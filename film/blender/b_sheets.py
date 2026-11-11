# -*- coding: utf-8 -*-
"""QA contact sheets of the VERSION B stills: 6 stills per sheet at 640 px, text zones outlined.
    python b_sheets.py            -> $S/previews/b_sheet_01.jpg ... (all ids of shots_b.json + b31_empty)
    python b_sheets.py b15 b16    -> only these, to $S/previews/b_sheet_sel.jpg
Zones drawn: wreath = the clear window of the table; glyph = the calm label strip at y 0.925 H;
landing = lower third."""
import sys, os, json
import numpy as np, cv2

R = '/home/user/xx/film'
S = '/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
tab = json.load(open(os.path.join(R, 'shots_b.json'), encoding='utf-8'))
want = sys.argv[1:]
cells = []
entries = [(s['id'], s) for s in tab['scenes']] + [('b31_empty', tab['scenes'][-1])]
for name, s in entries:
    if want and name not in want and name.split('_')[0] not in want:
        continue
    f = os.path.join(R, 'renders_b', name + '.png')
    im = cv2.imread(f, cv2.IMREAD_UNCHANGED)
    if im is None:
        im = np.full((360, 640, 3), 70, np.uint8)
        cv2.putText(im, 'missing', (240, 190), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (200, 200, 200), 2, cv2.LINE_AA)
    else:
        if im.dtype == np.uint16:
            im = (im / 257.0 + 0.5).astype(np.uint8)
        im = cv2.resize(im[..., :3], (640, 360), interpolation=cv2.INTER_AREA)
        P = s.get('params', {})
        if s['layout'] == 'wreath':
            u, v, w, h = P.get('window', [0.5, 0.42, 0.46, 0.30])
            cv2.rectangle(im, (int((u - w / 2) * 640), int((v - h / 2) * 360)), (int((u + w / 2) * 640), int((v + h / 2) * 360)), (255, 160, 0), 1)
        elif s['layout'] == 'glyph':
            cv2.rectangle(im, (int(0.40 * 640), int(0.90 * 360)), (int(0.60 * 640), int(0.975 * 360)), (255, 160, 0), 1)
        elif s['layout'] == 'landing':
            cv2.line(im, (0, 240), (640, 240), (255, 160, 0), 1)
    cv2.putText(im, name, (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(im, name, (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    cells.append(im)
os.makedirs(os.path.join(S, 'previews'), exist_ok=True)
for k in range(0, len(cells), 6):
    grp = cells[k:k + 6]
    while len(grp) < 6:
        grp.append(np.full((360, 640, 3), 40, np.uint8))
    sheet = np.vstack([np.hstack(grp[:3]), np.hstack(grp[3:])])
    out = os.path.join(S, 'previews', 'b_sheet_sel.jpg' if want else 'b_sheet_%02d.jpg' % (k // 6 + 1))
    cv2.imwrite(out, sheet, [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(out)
