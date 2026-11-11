"""A mound of the loose items returned by any shot script's make_items() - used where the single
macro surface did not read as the ingredient (whole jujubes, dried yam slices, whole monk fruits).

    python pile_from_items.py --shot k13_luohanguo --quality final --out film/renders/k13_luohanguo.png
"""
import os, sys, importlib.util
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
ARGV = sys.argv[1:]
SHOT = 'm03_dazao'
if '--shot' in ARGV:
    i = ARGV.index('--shot'); SHOT = ARGV[i + 1]; del ARGV[i:i + 2]
import common as C

# px = apparent item length at the horizon in a 1920 px frame; base = colour of the hidden dome under the heap
CFG = {
    'm03_dazao':     dict(px=250, layers=2.6, tilt=14, roll=40,  exposure=1.0, base=(0.05, 0.012, 0.008), tint=(1.0, 0.97, 0.90)),
    'm01_shanyao':   dict(px=215, layers=3.2, tilt=20, roll=25,  exposure=0.10, base=(0.30, 0.27, 0.22),   tint=(1.0, 0.98, 0.95)),
    'k13_luohanguo': dict(px=470, layers=1.9, tilt=12, roll=180, exposure=0.35, base=(0.05, 0.035, 0.02),  tint=(1.0, 0.97, 0.92)),
}

def build(args, cfg):
    spec = importlib.util.spec_from_file_location('ing', os.path.join(HERE, SHOT + '.py'))
    ing = importlib.util.module_from_spec(spec); spec.loader.exec_module(ing)
    items = ing.make_items(seed=args.seed)
    variants, shapes = [], []
    for ob in items['objects']:
        me = ob.data
        co = np.array([v.co[:] for v in me.vertices], np.float64)
        ctr = (co.max(0) + co.min(0)) / 2
        for v, c in zip(me.vertices, co - ctr): v.co = c            # centre the mesh on its bounding box
        ob.location = (0, 0, 0); ob.rotation_euler = (0, 0, 0); ob.scale = (1, 1, 1)
        variants.append(ob); shapes.append(tuple(float(h) for h in (co.max(0) - co.min(0)) / 2))
    size = float(np.mean([max(s) for s in shapes])) * 2
    R = 2900.0 * size / cfg['px']
    sol = C.planet_solve(R)
    heap = C.pack_heap(R, sol['patch'], shapes, layers=cfg['layers'], seed=args.seed + 3, candidates=6, sink=0.10,
                       rough=0.08 * size, tilt_deg=cfg['tilt'], roll_deg=cfg['roll'])
    C.instance_on_points(SHOT + '_heap', variants, heap)
    C.dome_base(R - 0.3 * size, C.simple_material('base', cfg['base'], 0.9))
    cam, info = C.planet_camera(heap=heap)
    C.auto_dof(cam, info)
    C.studio_lights(info, tint=cfg['tint'])

if __name__ == '__main__':
    cfg = CFG[SHOT]
    args = C.parse_args(ARGV)
    C.setup_scene(args, exposure=cfg['exposure'])
    build(args, cfg)
    C.render(args)
    print(C.check_framing(args.out))
