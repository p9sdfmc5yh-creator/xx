#!/usr/bin/env python3
"""merge-storyboard.py — assemble docs/storyboard-<film>.json from the part files in docs/storyboard-parts/.
   python3 tools/merge-storyboard.py coins
Validates ids, frame counts, beats, file names and tones; prints problems and exits 1 if any shot is missing."""
import json, glob, os, re, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
film = sys.argv[1]
META = {
    'coins': dict(topic='中国古钱币', tagline=['一枚圆钱', '藏着', '千年'], titleCard=dict(title='中国古钱币', seal='通宝', cta='千年通宝 等你发现')),
    'antiques': dict(topic='中国古玩', tagline=['一层包浆', '藏着', '千年'], titleCard=dict(title='中国古玩', seal='雅玩', cta='千年雅玩 等你发现')),
    'tcm': dict(topic='中国中医药', tagline=['一味草木', '藏着', '千年'], titleCard=dict(title='中国中医药', seal='本草', cta='千年本草 等你发现')),
}[film]
FRAMES = [31, 26, 26, 11, 6, 6, 13, 15, 13, 14, 15, 13, 14, 15, 8, 10, 8, 11, 12, 8, 10, 8, 8, 11, 7, 6, 8, 8, 7, 8, 6, 7, 7, 7, 6, 5, 5]
beat_of = lambda i: 0 if i < 14 else 1 if i < 19 else 2 if i < 24 else 3
shots = {}
for f in sorted(glob.glob(os.path.join(ROOT, 'docs', 'storyboard-parts', f'{film}-*.json'))):
    data = json.load(open(f, encoding='utf-8'))
    if isinstance(data, dict):
        data = data.get('shots', [])
    for s in data:
        shots[s['id']] = s
problems, out = [], []
for i in range(37):
    sid = f's{i + 1:02d}'
    s = shots.get(sid)
    if not s:
        problems.append(f'{sid}: MISSING'); continue
    s['frames'] = FRAMES[i]; s['beat'] = beat_of(i)
    slug = re.sub(r'[^a-z0-9-]+', '-', str(s.get('file', '')).lower().replace('.js', '')).strip('-')
    if not slug.startswith(sid + '-'):
        slug = sid + '-' + (re.sub(r'^s\d\d-?', '', slug) or 'shot')
    s['file'] = slug + '.js'
    if s.get('tone') not in ('light', 'dark'):
        problems.append(f'{sid}: tone {s.get("tone")!r} → light'); s['tone'] = 'light'
    for k in ('name', 'brief', 'palette', 'refDesc'):
        if not s.get(k): problems.append(f'{sid}: empty {k}')
    for k in ('motion', 'accuracy'):
        s.setdefault(k, '')
    s.setdefault('factsToVerify', [])
    out.append({k: s[k] for k in ('id', 'file', 'name', 'frames', 'beat', 'tone', 'refDesc', 'brief', 'palette', 'motion', 'accuracy', 'factsToVerify')})
doc = dict(film=film, topic=META['topic'], tagline=META['tagline'], titleCard=META['titleCard'], researchDir='docs/research', shots=out)
if len(out) == 37:
    json.dump(doc, open(os.path.join(ROOT, 'docs', f'storyboard-{film}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'{film}: {len(out)}/37 shots; tones dark={sum(1 for s in out if s["tone"]=="dark")}; problems: {problems or "none"}')
sys.exit(0 if len(out) == 37 else 1)
