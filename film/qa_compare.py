#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""QA of a built 《药食同源》 mp4 against the original film.

    python qa_compare.py NEW.mp4 [--orig ORIGINAL.mp4] [--sheet sheet.jpg] [--tile 240] [--json out.json]

Checks (exit code 0 only if all pass)
  1. container : exactly 1248 video frames, 30 fps (r and avg), 41.600 s, uniform frame
                 timestamps, resolution 3840x2160 or 1920x1080, h264 / yuv420p / bt709 tags
  2. audio     : md5 of the audio packets (stream copy) identical to the original mp4's audio
  3. cuts      : hard cuts (frame-difference spikes) on exactly the same frame indices as the
                 original; expected 192, 256, 320, 384, 448, every 16 frames to 608, every
                 8 frames to 736 (+ the original's own glow steps at 752-754, see KNOWN_STEPS)
  4. sheet     : original | new side by side, one mid frame per scene (written, not judged)
"""
import argparse
import glob
import json
import os
import subprocess
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'compose'))
_ORIG = glob.glob('/root/.claude/uploads/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/ce0d416f-*.mp4')
ORIG = os.environ.get('YAOSHI_ORIG', _ORIG[0] if _ORIG else '')
NFRAMES, FPS, DUR = 1248, 30, 41.6
EXPECTED_CUTS = [192, 256, 320, 384, 448] + list(range(464, 609, 16)) + list(range(616, 737, 8))
# not edits: the horizon glow of the outro card switches on in three steps (frames 752-754) in the
# ORIGINAL film; the rebuilt backdrop reproduces it, so the detector fires there in both films.
KNOWN_STEPS = [752, 753, 754]


def probe(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries',
                        'stream=codec_name,pix_fmt,width,height,r_frame_rate,avg_frame_rate,duration,nb_read_packets,'
                        'color_space,color_transfer,color_primaries,color_range,time_base:format=duration',
                        '-of', 'json', path], capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    s = j['streams'][0]
    s['format_duration'] = float(j['format']['duration'])
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts',
                        '-of', 'csv=p=0', path], capture_output=True, text=True, check=True)
    pts = np.array(sorted(int(v.split(',')[0]) for v in r.stdout.split() if v.strip(',')), np.int64)
    d = np.diff(pts)
    s['pts_uniform'] = bool(len(d) and d.min() == d.max())
    s['pts_first'] = int(pts[0]) if len(pts) else None
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries',
                        'stream=codec_name,duration,nb_frames', '-of', 'json', path], capture_output=True, text=True)
    a = json.loads(r.stdout or '{}').get('streams') or [None]
    s['audio'] = a[0]
    return s


def audio_md5(path):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-map', '0:a:0', '-c', 'copy', '-f', 'md5', '-'],
                       capture_output=True, text=True)
    return r.stdout.strip() or None


def decode_small(path, tw, th):
    """All frames as uint8 (N, th, tw, 3) RGB."""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-map', '0:v:0', '-vf',
                        'scale=%d:%d:flags=area' % (tw, th), '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.uint8).reshape(-1, th, tw, 3)


def find_cuts(frames):
    """Frame indices i where frame i differs abruptly from frame i-1 (spike of the mean abs difference)."""
    g = frames.astype(np.float32).mean(-1)
    d = np.zeros(len(g), np.float32)
    d[1:] = np.abs(g[1:] - g[:-1]).reshape(len(g) - 1, -1).mean(1)
    cuts = []
    for i in range(1, len(d)):
        nb = np.concatenate([d[max(1, i - 6):i], d[i + 1:i + 7]])
        base = float(np.median(nb)) if len(nb) else 0.0
        if d[i] > max(6.0 * base, base + 0.8):
            cuts.append(i)
    return cuts, d


def scene_frames():
    import compose
    out = []
    for sid, a, b in compose.scenes():
        out.append((sid, {'s00_intro': 60, 'e01_outro': 1200}.get(sid, (a + b) // 2)))
    return out


def write_sheet(path, fo, fn, tile, cols=4):
    th = fo.shape[1]
    items = scene_frames()
    rows = (len(items) + cols - 1) // cols
    cw = 2 * tile + 6
    sheet = np.full((rows * (th + 18), cols * cw, 3), 24, np.uint8)
    for i, (sid, f) in enumerate(items):
        y, x = (i // cols) * (th + 18), (i % cols) * cw
        if f < len(fo):
            sheet[y + 18:y + 18 + th, x:x + tile] = fo[f]
        if f < len(fn):
            sheet[y + 18:y + 18 + th, x + tile:x + 2 * tile] = fn[f]
        cv2.putText(sheet, '%s f%d  orig | new' % (sid, f), (x + 3, y + 13), cv2.FONT_HERSHEY_SIMPLEX, 0.38,
                    (220, 220, 220), 1, cv2.LINE_AA)
    cv2.imwrite(path, sheet[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 90])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('new')
    ap.add_argument('--orig', default=ORIG)
    ap.add_argument('--sheet', default=None)
    ap.add_argument('--tile', type=int, default=240)
    ap.add_argument('--json', default=None)
    a = ap.parse_args(argv)
    res, ok = {}, {}
    p = probe(a.new)
    res['video'] = {k: p.get(k) for k in ('codec_name', 'pix_fmt', 'width', 'height', 'r_frame_rate', 'avg_frame_rate',
                                          'duration', 'nb_read_packets', 'color_space', 'color_transfer',
                                          'color_primaries', 'color_range', 'pts_uniform', 'format_duration')}
    ok['frames_1248'] = int(p.get('nb_read_packets', 0)) == NFRAMES
    ok['fps_30'] = p.get('r_frame_rate') == '30/1' and p.get('avg_frame_rate') == '30/1' and p['pts_uniform']
    ok['duration_41.6'] = abs(float(p.get('duration', 0)) - DUR) < 1e-3 and abs(p['format_duration'] - DUR) < 0.03
    ok['resolution'] = (p.get('width'), p.get('height')) in ((3840, 2160), (1920, 1080))
    ok['h264_yuv420p_bt709'] = (p.get('codec_name') == 'h264' and p.get('pix_fmt') == 'yuv420p'
                                and p.get('color_space') == 'bt709' and p.get('color_transfer') == 'bt709'
                                and p.get('color_primaries') == 'bt709')
    mo, mn = audio_md5(a.orig), audio_md5(a.new)
    res['audio'] = dict(orig_md5=mo, new_md5=mn, new_stream=p.get('audio'))
    ok['audio_identical'] = mo is not None and mo == mn
    tw, th = a.tile, a.tile * 9 // 16
    fo, fn = decode_small(a.orig, tw, th), decode_small(a.new, tw, th)
    co, _ = find_cuts(fo)
    cn, dn = find_cuts(fn)
    res['cuts'] = dict(expected=EXPECTED_CUTS, orig=co, new=cn,
                       missing_in_new=sorted(set(EXPECTED_CUTS) - set(cn)),
                       extra_in_new=sorted(set(cn) - set(EXPECTED_CUTS)),
                       orig_vs_expected=dict(missing=sorted(set(EXPECTED_CUTS) - set(co)),
                                             extra=sorted(set(co) - set(EXPECTED_CUTS))))
    ok['decoded_1248'] = len(fn) == NFRAMES and len(fo) == NFRAMES
    ok['cuts_match_original'] = cn == co
    ok['cuts_match_expected'] = sorted(set(cn) - set(KNOWN_STEPS)) == EXPECTED_CUTS
    res['cuts']['known_non_cut_steps'] = KNOWN_STEPS
    if a.sheet:
        write_sheet(a.sheet, fo, fn, tw)
        res['sheet'] = a.sheet
    res['checks'] = ok
    res['pass'] = all(ok.values())
    if a.json:
        json.dump(res, open(a.json, 'w'), indent=1)
    print('video  :', res['video'])
    print('audio  :', res['audio'])
    c = res['cuts']
    print('cuts   : new %d, orig %d, expected %d | missing in new %s | extra in new %s | orig vs expected %s' % (
        len(cn), len(co), len(EXPECTED_CUTS), c['missing_in_new'], c['extra_in_new'], c['orig_vs_expected']))
    print('checks :', ' '.join('%s=%s' % (k, 'OK' if v else 'FAIL') for k, v in ok.items()))
    print('RESULT :', 'PASS' if res['pass'] else 'FAIL')
    return 0 if res['pass'] else 1


if __name__ == '__main__':
    sys.exit(main())
