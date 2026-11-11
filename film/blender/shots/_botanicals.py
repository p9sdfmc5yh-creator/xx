# -*- coding: utf-8 -*-
"""Shared helpers for the 'botanicals' shots (k05_bohe, k16_lingzhi, k13_luohanguo): part merging with
per-vertex attributes, hair / fuzz tubes, resting poses for the loose items, the render tail."""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402


def rot(axis, ang):
    c, s = math.cos(ang), math.sin(ang)
    if axis == 0:
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == 1:
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def merge_parts(parts):
    """[(verts, faces, slot, {attr: array})] -> verts, [faces], face_mat, attrs (missing attrs = 0)."""
    shapes = {}
    for p in parts:
        for k, v in p[3].items():
            shapes[k] = np.asarray(v).shape[1:]
    out = {k: [] for k in shapes}
    for v, f, slot, at in parts:
        n = len(v)
        for k, shp in shapes.items():
            out[k].append(np.asarray(at[k], np.float32).reshape((n,) + shp) if k in at
                          else np.zeros((n,) + shp, np.float32))
    verts, faces, fm = C.merge_meshes([(p[0], p[1], p[2]) for p in parts])
    return verts, faces, fm, {k: np.concatenate(v, 0) for k, v in out.items()}


def hair_tubes(rng, roots, dirs, length, radius, bend=0.25, nr=4, nseg=3):
    """H tapered, slightly bent hairs as thin tubes.  roots (H,3), dirs (H,3), length (H,), radius (H,)
    in metres.  Returns verts (H*nr*nseg, 3), quad faces, tau (per-vertex 0 root .. 1 tip)."""
    H = len(roots)
    tau = np.linspace(0.0, 1.0, nr)
    d = dirs / np.maximum(np.linalg.norm(dirs, axis=1, keepdims=True), 1e-12)
    ref = np.where(np.abs(d[:, 2:3]) < 0.9, [[0.0, 0.0, 1.0]], [[1.0, 0.0, 0.0]])
    u = np.cross(d, ref)
    u /= np.linalg.norm(u, axis=1, keepdims=True)
    v = np.cross(d, u)
    b = rng.normal(0, bend, (H, 2))
    lt = length[:, None] * tau[None, :]
    lt2 = length[:, None] * tau[None, :] ** 2
    cen = (roots[:, None, :] + d[:, None, :] * lt[..., None]
           + (u[:, None, :] * b[:, 0, None, None] + v[:, None, :] * b[:, 1, None, None]) * lt2[..., None])
    rr = radius[:, None] * np.interp(tau, [0.0, 0.5, 1.0], [1.0, 0.72, 0.12])[None, :]
    ang = np.linspace(0, 2 * np.pi, nseg, endpoint=False)
    P = cen[:, :, None, :] + rr[:, :, None, None] * (u[:, None, None, :] * np.cos(ang)[None, None, :, None]
                                                     + v[:, None, None, :] * np.sin(ang)[None, None, :, None])
    f0 = C.grid_faces(nr, nseg, wrap_v=True)
    faces = (f0[None] + (np.arange(H) * nr * nseg)[:, None, None]).reshape(-1, 4)
    tv = np.broadcast_to(tau[None, :, None], (H, nr, nseg)).reshape(-1)
    return P.reshape(-1, 3), faces, tv


def settle(verts, R=None):
    """Resting pose for a loose item: optional rotation R, lowest point on z = 0, origin at the
    footprint centre.  Returns verts, footprint radius, half height."""
    v = verts @ R.T if R is not None else verts.copy()
    v[:, 2] -= v[:, 2].min()
    v[:, :2] -= 0.5 * (v[:, :2].max(0) + v[:, :2].min(0))
    return v, float(np.percentile(np.hypot(v[:, 0], v[:, 1]), 99.5)), float(0.5 * v[:, 2].max())


def finish(args, shot):
    """Render, check the framing contract (full frames only), write the judging composite."""
    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, shot + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    if args.region:
        C.quick_comp(args.out, shot, comp, crop=args.region, text=False)
    else:
        C.quick_comp(args.out, shot, comp)
    print('[comp]', comp)
