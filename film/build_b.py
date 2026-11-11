#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build VERSION B of 《药食同源》 with compose/compose_b.compose_frame_b() and encode it.

    python build_b.py                     # 1920x1080 -> film/out/yaoshi_B_1080p.mp4
    python build_b.py --scale 2           # 3840x2160 -> film/out/yaoshi_B_4k.mp4
    python build_b.py --list              # which stills exist / which segments are stale
    python build_b.py --watch 60          # build, then rebuild whenever stills arrive, until none is missing
    python build_b.py --start 608 --end 760 --out glyphs.mp4      # a range (video only)

 * Stills are looked up ONCE per build (film/renders_b/<id>.png, see compose_b.find_still); a
   missing or unreadable still becomes a paper placeholder with the shot id.  Re-run the same
   command when new stills have arrived.
 * The film is cut into segments = the scenes of film/shots_b.json (long scenes are split every
   128 frames).  A multiprocessing pool renders the frames (chunks of 8 frames per worker), the
   raw RGB frames are piped IN ORDER into ffmpeg (libx264, yuv420p, CRF 18, preset medium, BT.709
   tags, 30 fps); every segment is cached with a signature of everything it depends on (compose
   code, timeline.json, the scene's still(s), scale, encoder settings), so a re-run only renders
   the scenes whose still arrived or changed.
 * The segments are concatenated by stream copy, the ORIGINAL audio is muxed by stream copy and
   the mp4 is written with +faststart.  The result is probed: exactly 1248 frames or the build
   fails.
"""
import argparse
import collections
import hashlib
import json
import os
import subprocess
import sys
import time
from multiprocessing import get_context

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'compose'))
SCRATCH = '/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
AUDIO = os.environ.get('YAOSHI_AUDIO', os.path.join(SCRATCH, 'work', 'audio_orig.m4a'))
SEGROOT = os.environ.get('YAOSHI_B_SEGDIR', os.path.join(SCRATCH, 'tmp_bcomp', 'segments'))
DEFAULT_OUT = {1: os.path.join(HERE, 'out', 'yaoshi_B_1080p.mp4'),
               2: os.path.join(HERE, 'out', 'yaoshi_B_4k.mp4')}
FPS = 30
NFRAMES = 1248
SEG_MAX = 128          # frames per cached segment
CHUNK = 8              # frames handed to one worker at a time
DEPENDS = ['compose/compose_b.py', 'compose/text.py', 'compose/retro.py', 'timeline.json']


# ----------------------------------------------------------------------------- workers
def _init(manifest, strength):
    import cv2
    cv2.setNumThreads(1)
    import compose_b
    compose_b.MANIFEST = manifest
    compose_b.RETRO_STRENGTH = strength


def _render_chunk(job):
    frames, scale = job
    import compose_b
    return [compose_b.compose_frame_b(f, scale).tobytes() for f in frames]


# ----------------------------------------------------------------------------- segments
def _sha(path):
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        for blk in iter(lambda: f.read(1 << 20), b''):
            h.update(blk)
    return h.hexdigest()


def code_signature():
    return {p: _sha(os.path.join(HERE, p)) for p in DEPENDS}


def segments(start=0, end=NFRAMES):
    """[(name, a, b, (scene id, scene start, scene end))] covering [start, end)."""
    import compose_b
    out = []
    for sid, s, e in compose_b.scenes():
        a = s
        while a < e:
            b = min(e, a + SEG_MAX)
            a2, b2 = max(a, start), min(b, end)
            if b2 > a2:
                out.append(('%04d_%04d_%s' % (a2, b2, sid), a2, b2, (sid, s, e)))
            a = b
    return out


def seg_signature(seg, args, code, manifest):
    name, a, b, scene = seg
    sid = scene[0]
    d = dict(code=code, a=a, b=b, scene=list(scene), scale=args.scale, crf=args.crf, preset=args.preset,
             strength=args.strength, fps=FPS, still=manifest.get(sid), empty=manifest.get(sid + '#empty'))
    return hashlib.sha1(json.dumps(d, sort_keys=True).encode()).hexdigest()


def ffmpeg_cmd(w, h, out, args):
    return ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (w, h), '-r', str(FPS), '-i', '-',
            '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int,'
                   'format=yuv420p',
            '-c:v', 'libx264', '-preset', args.preset, '-crf', str(args.crf), '-pix_fmt', 'yuv420p',
            '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
            '-r', str(FPS), '-video_track_timescale', '15360', '-movflags', '+faststart', out]


def render_segment(pool, seg, path, args):
    name, a, b, scene = seg
    w, h = 1920 * args.scale, 1080 * args.scale
    tmp = path + '.part.mp4'
    proc = subprocess.Popen(ffmpeg_cmd(w, h, tmp, args), stdin=subprocess.PIPE)
    jobs = [(list(range(f, min(b, f + CHUNK))), args.scale) for f in range(a, b, CHUNK)]
    pending = collections.deque()
    it = iter(jobs)
    n = 0
    try:
        while True:
            while len(pending) < args.workers + 1:          # bounded look-ahead (memory)
                j = next(it, None)
                if j is None:
                    break
                pending.append(pool.apply_async(_render_chunk, (j,)))
            if not pending:
                break
            for buf in pending.popleft().get():
                proc.stdin.write(buf)
                n += 1
        proc.stdin.close()
        rc = proc.wait()
    except BaseException:
        proc.kill()
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    if rc != 0 or n != b - a:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise RuntimeError('ffmpeg failed on segment %s (rc %s, %d frames)' % (name, rc, n))
    os.replace(tmp, path)


def probe(path):
    """(video frames, video duration s, audio codec or None, colour tags) of an mp4."""
    r = subprocess.run(['ffprobe', '-v', 'error', '-count_packets', '-show_entries',
                        'stream=codec_type,codec_name,nb_read_packets,duration,width,height,pix_fmt,'
                        'color_space,color_transfer,color_primaries,color_range,r_frame_rate',
                        '-of', 'json', path], capture_output=True, text=True, check=True)
    st = json.loads(r.stdout)['streams']
    v = next(s for s in st if s['codec_type'] == 'video')
    a = next((s for s in st if s['codec_type'] == 'audio'), None)
    return v, a


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--scale', type=int, default=1, help='1 = 1920x1080 (default), 2 = 3840x2160')
    ap.add_argument('--start', type=int, default=0)
    ap.add_argument('--end', type=int, default=NFRAMES)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument('--out', default=None)
    ap.add_argument('--renders', default=None, help='directory of the stills (default film/renders_b)')
    ap.add_argument('--crf', type=int, default=18)
    ap.add_argument('--preset', default='medium')
    ap.add_argument('--strength', type=float, default=None, help='retro.retro() strength (default: compose_b)')
    ap.add_argument('--segdir', default=None)
    ap.add_argument('--audio', default=AUDIO)
    ap.add_argument('--force', action='store_true', help='re-render every segment')
    ap.add_argument('--list', action='store_true', help='only show the state of the stills / segments')
    ap.add_argument('--watch', type=float, default=0, metavar='SECONDS',
                    help='after the build keep polling the stills directory every SECONDS and rebuild whenever a '
                         'still arrived or changed; exits once no placeholder is left')
    args = ap.parse_args(argv)
    import compose_b
    if args.strength is None:
        args.strength = compose_b.RETRO_STRENGTH
    rc, manifest = build_once(args)
    while args.watch > 0 and not args.list and rc == 0 and any(v is None for v in manifest.values()):
        time.sleep(args.watch)
        new = compose_b.build_manifest(args.renders)
        if new != manifest:
            print('--- %s  stills changed, rebuilding' % time.strftime('%H:%M:%S'), flush=True)
            rc, manifest = build_once(args, new)
    return rc


def build_once(args, manifest=None):
    """One (incremental) build; returns (exit code, manifest of the stills it used)."""
    import compose_b
    full = args.start == 0 and args.end == NFRAMES
    out = args.out or (DEFAULT_OUT.get(args.scale) if full else
                       os.path.join(HERE, 'out', 'B_range_%04d_%04d_s%d.mp4' % (args.start, args.end, args.scale)))
    segdir = args.segdir or os.path.join(SEGROOT, 's%d' % args.scale)
    os.makedirs(segdir, exist_ok=True)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    t0 = time.time()
    if manifest is None:
        manifest = compose_b.build_manifest(args.renders)
    compose_b.MANIFEST = manifest
    code = code_signature()
    segs = segments(args.start, args.end)
    todo, paths = [], []
    placeholders = [sid for sid, _, _ in compose_b.scenes() if manifest.get(sid) is None]
    for seg in segs:
        path = os.path.join(segdir, seg[0] + '.mp4')
        sig = seg_signature(seg, args, code, manifest)
        meta = None
        try:
            meta = json.load(open(path + '.json'))
        except Exception:
            pass
        fresh = (not args.force) and meta is not None and meta.get('sig') == sig and os.path.isfile(path)
        paths.append(path)
        if not fresh:
            todo.append((seg, path, sig))
    last = compose_b.scenes()[-1][0]
    print('stills %d/%d  placeholders %d: %s' % (len(compose_b.scenes()) - len(placeholders), len(compose_b.scenes()),
                                                 len(placeholders), ' '.join(placeholders) or '-'))
    if manifest.get(last) is not None and manifest.get(last + '#empty') is None:
        print('note: ground-only landing plate (%s*empty*.png) missing -> synthetic ground for the reveal' % last[:3])
    print('segments %d  to render %d (%d frames)' % (len(segs), len(todo), sum(s[0][2] - s[0][1] for s in todo)))
    if args.list:
        stale = {t[0][0] for t in todo}
        for name, a, b, scene in segs:
            print('  %-30s %4d-%4d  %s%s' % (name, a, b, 'RENDER' if name in stale else 'cached',
                                             '  placeholder' if scene[0] in placeholders else ''))
        return 0, manifest
    if todo:
        ctx = get_context('fork')
        with ctx.Pool(args.workers, initializer=_init, initargs=(manifest, args.strength)) as pool:
            for seg, path, sig in todo:
                t = time.time()
                render_segment(pool, seg, path, args)
                json.dump(dict(sig=sig, a=seg[1], b=seg[2], scene=seg[3][0]), open(path + '.json', 'w'))
                dt = time.time() - t
                print('  %-30s %3d frames  %6.1f s  %.2f s/frame' % (seg[0], seg[2] - seg[1], dt, dt / (seg[2] - seg[1])),
                      flush=True)
    # concat (stream copy) + original audio (stream copy)
    lst = os.path.join(segdir, 'concat_%04d_%04d.txt' % (args.start, args.end))
    with open(lst, 'w') as f:
        for p in paths:
            f.write("file '%s'\n" % p)
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst]
    if full and args.audio and os.path.isfile(args.audio):
        cmd += ['-i', args.audio, '-map', '0:v:0', '-map', '1:a:0']
    else:
        cmd += ['-map', '0:v:0']
        print('note: %s -> video only' % ('partial range' if not full else 'audio file missing'))
    tmp = out + '.part.mp4'
    cmd += ['-c', 'copy', '-video_track_timescale', '15360', '-movflags', '+faststart', tmp]
    subprocess.run(cmd, check=True)
    os.replace(tmp, out)
    nfr = sum(b - a for _, a, b, _ in segs)
    v, a = probe(out)
    print('wrote %s  (%.1f MB, %d placeholder shots, %.0f s)' % (out, os.path.getsize(out) / 1e6, len(placeholders),
                                                              time.time() - t0))
    print('probe: video %sx%s %s %s fps  frames %s  duration %s s  colour %s/%s/%s %s | audio %s %s s' % (
        v.get('width'), v.get('height'), v.get('pix_fmt'), v.get('r_frame_rate'), v.get('nb_read_packets'),
        v.get('duration'), v.get('color_primaries'), v.get('color_transfer'), v.get('color_space'),
        v.get('color_range'), a and a.get('codec_name'), a and a.get('duration')))
    sys.stdout.flush()
    if int(v.get('nb_read_packets', -1)) != nfr:
        print('ERROR: expected %d frames' % nfr)
        return 1, manifest
    return 0, manifest


if __name__ == '__main__':
    sys.exit(main())
