#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Render the 《药食同源》 film with compose.compose_frame() and encode it.

    python build_video.py                      # 4K master  -> film/out/yaoshi_tongyuan_A_4k.mp4
    python build_video.py --scale 1 --out x.mp4            # fast 1080p test
    python build_video.py --list               # what is cached / stale / still a placeholder
    python build_video.py --start 448 --end 480 --out goji.mp4   # a range (video only)

How it works
 * The film is cut into segments = the scenes of the cut list (long 2D scenes are split every
   128 frames).  Each segment is rendered by a multiprocessing pool (--workers, default 3; the
   frames of one 8-frame chunk go to one worker so a still is loaded once), the raw RGB frames
   are piped IN ORDER into ffmpeg (libx264, yuv420p, CRF 16, preset medium, BT.709 tags,
   30 fps) and the result is kept in --segdir with a signature of everything it depends on
   (code + data of film/compose, timeline.json, shots.json, the still PNG / depth of the shot,
   scale, encoder settings).
 * A re-run only renders segments whose signature changed - e.g. the shots whose still has
   arrived or was re-rendered since the last build (missing stills = grey placeholder domes) -
   then concatenates all segments by stream copy, muxes the ORIGINAL audio by stream copy and
   writes the mp4 with +faststart.  So "new stills arrived" = run the same command again.
 * An interrupted build loses at most the segment in progress.  A worker killed by the OOM
   killer is detected (BrokenProcessPool) and the segment is retried with a fresh pool.
 * Memory at 4K: ~0.7 GB per worker + ~0.2 GB per worker of queued frames + ~1.5 GB x264.
   Use --workers 2 while the render queue is busy.
"""
import argparse
import collections
import hashlib
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from multiprocessing import get_context

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'compose'))
SCRATCH = '/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
AUDIO = os.environ.get('YAOSHI_AUDIO', os.path.join(SCRATCH, 'work', 'audio_orig.m4a'))
SEGROOT = os.environ.get('YAOSHI_SEGDIR', os.path.join(SCRATCH, 'tmp_compositor', 'segments'))
DEFAULT_OUT = {2: os.path.join(HERE, 'out', 'yaoshi_tongyuan_A_4k.mp4'),
               1: os.path.join(HERE, 'out', 'yaoshi_tongyuan_A_1080p_test.mp4')}
FPS = 30
NFRAMES = 1248
SEG_MAX = 128          # frames per cached segment
CHUNK = 8              # frames handed to one worker at a time
DEPENDS = ['compose/compose.py', 'compose/text.py', 'compose/backdrops.py', 'compose/backdrops_data.npz',
           'timeline.json', 'shots.json']


# ----------------------------------------------------------------------------- workers

def _init():
    import cv2
    cv2.setNumThreads(1)
    import compose  # noqa: F401


def _render_chunk(job):
    frames, scale, renders, old = job
    import compose
    return [compose.compose_frame(f, scale, renders, old).tobytes() for f in frames]


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
    """[(name, a, b, scene_id)] covering [start, end)."""
    import compose
    out = []
    for sid, s, e in compose.scenes():
        a = s
        while a < e:
            b = min(e, a + SEG_MAX)
            a2, b2 = max(a, start), min(b, end)
            if b2 > a2:
                out.append(('%04d_%04d_%s' % (a2, b2, sid), a2, b2, sid))
            a = b
    return out


def seg_signature(seg, args, code):
    import compose
    name, a, b, sid = seg
    d = dict(code=code, a=a, b=b, scale=args.scale, crf=args.crf, preset=args.preset, old=bool(args.old_name),
             fps=FPS)
    if compose.B.MONTAGE[0] <= a < compose.B.MONTAGE[1]:
        d['still'] = [str(v) for v in compose.still_signature(sid, args.renders)]
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
    name, a, b, sid = seg
    w, h = 1920 * args.scale, 1080 * args.scale
    tmp = path + '.part.mp4'
    proc = subprocess.Popen(ffmpeg_cmd(w, h, tmp, args), stdin=subprocess.PIPE)
    jobs = [(list(range(f, min(b, f + CHUNK))), args.scale, args.renders, args.old_name)
            for f in range(a, b, CHUNK)]
    pending = collections.deque()
    it = iter(jobs)
    n = 0
    try:
        while True:
            while len(pending) < args.workers:              # bounded look-ahead (memory)
                j = next(it, None)
                if j is None:
                    break
                pending.append(pool.submit(_render_chunk, j))
            if not pending:
                break
            for buf in pending.popleft().result():
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


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--scale', type=int, default=2, help='2 = 3840x2160 master, 1 = 1920x1080 test')
    ap.add_argument('--start', type=int, default=0)
    ap.add_argument('--end', type=int, default=NFRAMES)
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--out', default=None)
    ap.add_argument('--renders', default=None, help='directory of the 3D stills (default film/renders)')
    ap.add_argument('--crf', type=int, default=16)
    ap.add_argument('--preset', default='medium')
    ap.add_argument('--old-name', action='store_true', help='verification only: old producer name')
    ap.add_argument('--segdir', default=None)
    ap.add_argument('--audio', default=AUDIO)
    ap.add_argument('--force', action='store_true', help='re-render every segment')
    ap.add_argument('--list', action='store_true', help='only show the state of the segments')
    args = ap.parse_args(argv)
    import compose
    full = args.start == 0 and args.end == NFRAMES
    out = args.out or (DEFAULT_OUT.get(args.scale) if full else
                       os.path.join(HERE, 'out', 'range_%04d_%04d_s%d.mp4' % (args.start, args.end, args.scale)))
    segdir = args.segdir or os.path.join(SEGROOT, 's%d%s' % (args.scale, '_old' if args.old_name else ''))
    os.makedirs(segdir, exist_ok=True)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    code = code_signature()
    segs = segments(args.start, args.end)
    todo, paths, placeholders = [], [], []
    for seg in segs:
        name, a, b, sid = seg
        path = os.path.join(segdir, name + '.mp4')
        sig = seg_signature(seg, args, code)
        meta = None
        try:
            meta = json.load(open(path + '.json'))
        except Exception:
            pass
        fresh = (not args.force) and meta is not None and meta.get('sig') == sig and os.path.isfile(path)
        if compose.B.MONTAGE[0] <= a < compose.B.MONTAGE[1] and compose.is_placeholder(sid, args.renders):
            placeholders.append(sid)
        paths.append(path)
        if not fresh:
            todo.append((seg, path, sig))
    print('segments %d  to render %d (%d frames)  placeholders %d: %s' % (
        len(segs), len(todo), sum(s[0][2] - s[0][1] for s in todo), len(placeholders), ' '.join(placeholders)))
    if args.list:
        stale = {t[0][0] for t in todo}
        for name, a, b, sid in segs:
            print('  %-28s %4d-%4d  %s%s' % (name, a, b, 'RENDER' if name in stale else 'cached',
                                             '  placeholder' if sid in placeholders else ''))
        return 0
    t0 = time.time()
    if todo:
        def new_pool():
            return ProcessPoolExecutor(args.workers, mp_context=get_context('fork'), initializer=_init)
        pool = new_pool()
        try:
            for seg, path, sig in todo:
                t = time.time()
                for attempt in range(3):
                    try:
                        render_segment(pool, seg, path, args)
                        break
                    except BrokenProcessPool:           # a worker was killed (OOM killer ...): new pool, retry
                        print('  worker died on %s (attempt %d) - restarting the pool' % (seg[0], attempt + 1), flush=True)
                        pool.shutdown(wait=False, cancel_futures=True)
                        pool = new_pool()
                        if attempt == 2:
                            raise
                json.dump(dict(sig=sig, a=seg[1], b=seg[2], scene=seg[3]), open(path + '.json', 'w'))
                dt = time.time() - t
                print('  %-28s %3d frames  %6.1f s  %.2f s/frame' % (seg[0], seg[2] - seg[1], dt, dt / (seg[2] - seg[1])),
                      flush=True)
        finally:
            pool.shutdown(wait=False, cancel_futures=True)
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
    print('wrote %s  (%d frames, %.1f MB, %d placeholder shots, %.0f s)' % (
        out, nfr, os.path.getsize(out) / 1e6, len(placeholders), time.time() - t0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
