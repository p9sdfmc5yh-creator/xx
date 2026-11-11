# -*- coding: utf-8 -*-
"""Shared helpers for the fruit pile shots (k03_guiyuan, k11_shaji, k06_sangshen)."""
import os, sys, math, shutil
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402


def sphere_grid(nu, nv, eps=2e-3):
    """Unit directions on a lat-long grid: s = 0 is the pole at -X (stem end), s = 1 the pole at +X.
    Returns U (nu, nv, 3), s (nu, 1), ph (1, nv); use with C.grid_faces(nu, nv, wrap_v=True)."""
    s = np.linspace(0.0, 1.0, nu)[:, None]
    ph = np.linspace(0.0, 2 * math.pi, nv, endpoint=False)[None, :]
    th = eps + (math.pi - 2 * eps) * s
    U = np.stack([-np.cos(th) + 0 * ph, np.sin(th) * np.cos(ph), np.sin(th) * np.sin(ph)], -1)
    return U, s, ph


def noise3(fn, p, *a, **k):
    """Call a common.py noise on an array of any shape (..., 3)."""
    sh = p.shape[:-1]
    r = fn(np.ascontiguousarray(p.reshape(-1, 3)), *a, **k)
    if isinstance(r, tuple):
        return tuple(x.reshape(sh) for x in r)
    return r.reshape(sh)


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def rand_quats(n, rng):
    """Uniform random orientations, (n, 4) wxyz."""
    return unit(rng.normal(size=(n, 4)))


def quat_mul(a, b):
    """Hamilton product a * b (apply b first), wxyz, broadcasting."""
    aw, ax, ay, az = np.moveaxis(np.asarray(a, float), -1, 0)
    bw, bx, by, bz = np.moveaxis(np.asarray(b, float), -1, 0)
    return np.stack([aw * bw - ax * bx - ay * by - az * bz, aw * bx + ax * bw + ay * bz - az * by,
                     aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw], -1)


def quat_from_to(a, b):
    """Shortest rotation taking unit vector a onto unit vector b (wxyz)."""
    a, b = unit(a), unit(b)
    w = 1.0 + float(a @ b)
    if w < 1e-6:
        ax = unit(np.cross(a, [0.3, 0.5, 0.8]))
        return np.array([0.0, ax[0], ax[1], ax[2]])
    return unit(np.concatenate([[w], np.cross(a, b)]))


def quat_axis(axis, ang):
    axis = unit(axis)
    return np.concatenate([[math.cos(0.5 * ang)], axis * math.sin(0.5 * ang)])


def quat_matrix(q):
    w, x, y, z = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def aim_quat(local_dir, world_dir, rng, spread=0.45):
    """Orientation that turns local_dir towards world_dir (+ random scatter and a free spin)."""
    d = unit(np.asarray(world_dir, float) + rng.normal(0, spread, 3))
    q = quat_from_to(local_dir, d)
    return quat_mul(quat_axis(d, rng.uniform(0, 2 * math.pi)), q)


def rest_item(name, parts, attrs, materials, Rm=None):
    """Loose item for make_items(): optional 3x3 rotation into its resting pose, lowest point on z = 0,
    origin at the footprint centre.  -> (object, footprint_r, half_height)."""
    v, f, fm = C.merge_meshes(parts)
    if Rm is not None:
        v = v @ np.asarray(Rm).T
    nb = len(parts[0][0])
    body = v[:nb]
    c = 0.5 * (body.min(0) + body.max(0))
    v = v - np.array([c[0], c[1], v[:, 2].min()])
    ob = C.mesh_from_arrays(name, v, f, attrs=attrs, materials=materials, face_mat=fm)
    ext = body.max(0) - body.min(0)
    return ob, 0.5 * float(max(ext[0], ext[1])), 0.5 * float(ext[2])


def finish(args, shot):
    """Render, check the framing contract, write the judging composite (+ <shot>_prev_comp.jpg for previews)."""
    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, shot + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    C.quick_comp(args.out, shot, comp, crop=args.region, text=not args.region)
    if args.quality == 'preview' and not args.region:
        shutil.copyfile(comp, os.path.join(C.PREVIEW_DIR, shot + '_prev_comp.jpg'))
    print('[comp]', comp)
