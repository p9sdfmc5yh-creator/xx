"""大枣 as a mound of WHOLE dried red jujubes (re-uses the whole-fruit items of m03_dazao.make_items)."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common as C

def build(args):
    import importlib.util
    spec = importlib.util.spec_from_file_location('dz', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'm03_dazao.py'))
    dz = importlib.util.module_from_spec(spec); spec.loader.exec_module(dz)
    items = dz.make_items(seed=args.seed)
    variants, shapes = [], []
    for ob in items['objects']:
        me = ob.data
        co = np.array([v.co[:] for v in me.vertices], np.float64)
        ctr = (co.max(0) + co.min(0)) / 2
        for v, c in zip(me.vertices, co - ctr): v.co = c          # centre the mesh on its bounding box
        half = (co.max(0) - co.min(0)) / 2
        ob.location = (0, 0, 0); ob.rotation_euler = (0, 0, 0); ob.scale = (1, 1, 1)
        variants.append(ob); shapes.append(tuple(float(h) for h in half))
    size = float(np.mean([max(s) for s in shapes])) * 2
    R = 2900.0 * size / 250.0
    sol = C.planet_solve(R)
    heap = C.pack_heap(R, sol['patch'], shapes, layers=2.6, seed=args.seed + 3, candidates=6, sink=0.10, rough=0.08 * size, tilt_deg=14, roll_deg=40)
    C.instance_on_points('jujube_heap', variants, heap)
    C.dome_base(R - 0.3 * size, C.simple_material('base', (0.05, 0.012, 0.008), 0.9))
    cam, info = C.planet_camera(heap=heap)
    C.auto_dof(cam, info)
    C.studio_lights(info, tint=(1.0, 0.97, 0.90))

if __name__ == '__main__':
    args = C.parse_args()
    C.setup_scene(args)
    build(args)
    C.render(args)
    print(C.check_framing(args.out))
