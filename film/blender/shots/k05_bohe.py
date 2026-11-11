# -*- coding: utf-8 -*-
"""k05_bohe - fresh mint leaves (薄荷), kind = surface: a macro across overlapping fresh leaves
that form the dome.

    python k05_bohe.py --quality preview --out /tmp/x.png
    python k05_bohe.py --quality draft --res 3840x2160 --spp 24 --region 0.38,0.50,0.62,0.75     # final-density crop
    python k05_bohe.py --quality final --out film/renders/k05_bohe.png

One leaf (40-56 mm) is a single dense sheet (760 x 440 vertices at 4K) with REAL relief:
ovate-lanceolate outline with forward-pointing saw teeth, sunken midrib + 6-7 pairs of arcuate
lateral veins, the tissue between them puffed up (bullate / quilted) in two scales of areoles,
arched and twisted blade, wavy margin, short petiole, fine hairs on margin / veins.
Shading: Principled + Translucent (thin leaf), all patterns in leaf millimetre space ('luv').
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _botanicals import C, rot, merge_parts, hair_tubes, settle, finish                # noqa: E402

SHOT = 'k05_bohe'
R_DOME = 0.19             # a 48 mm leaf is ~730 px (1920 frame) at the horizon: 2-3 leaves across
SEED = 2
N_UP, N_FLIP = 6, 1
SKY_TINT = (0.93, 1.0, 0.90)   # pale green-white sky of the shot


# ----------------------------------------------------------------------------- 1. geometry
def make_leaf(seed, nu=760, nv=440, flipped=False, hairs=True):
    """One fresh mint leaf, long axis X (base at -X), upper side +Z, centred on its collision
    ellipsoid.  Returns dict(verts, faces, face_mat, attrs, half)."""
    from scipy.spatial import cKDTree
    rng = np.random.default_rng(5000 + seed)
    L = rng.uniform(0.040, 0.056)
    Wh = L * rng.uniform(0.27, 0.33)
    s = np.linspace(0.0, 1.0, nu)[None, :]                    # columns = along the leaf (x)
    t = np.linspace(-1.0, 1.0, nv)[:, None]                   # rows = across (y)
    S, T = np.broadcast_arrays(s, t)
    a_, b_ = rng.uniform(0.50, 0.62), rng.uniform(0.85, 1.05)
    fmax = (a_ / (a_ + b_)) ** a_ * (b_ / (a_ + b_)) ** b_

    def fprof(sv):
        sv = np.clip(sv, 1e-4, 1 - 1e-4)
        return sv ** a_ * (1 - sv) ** b_ / fmax

    N = int(rng.integers(11, 16))

    def teeth(side):                                          # forward-pointing saw teeth
        g = s + 0.018 * C.perlin3(np.stack([s * 7.0, 0 * s + side * 3.3, 0 * s + seed * 1.7], -1), seed + side)
        fr = np.mod(g * N + rng.uniform(0, 1), 1.0)
        tp = np.where(fr < 0.78, (fr / 0.78) ** 1.25, 1.0 - (fr - 0.78) / 0.22)
        amp = 0.105 * C.smoothstep(0.10, 0.24, s) * (1 - 0.45 * C.smoothstep(0.75, 1.0, s)) * rng.uniform(0.8, 1.15)
        return 1.0 + amp * (tp - 0.6)

    wl = Wh * fprof(s) * teeth(1) * rng.uniform(0.94, 1.06)
    wr = Wh * fprof(s) * teeth(2)
    w = np.where(T < 0, wl, wr)                               # (nv, nu)
    X = S * L
    Y = T * w

    # --- lateral veins: quadratic Beziers leaving the midrib and arching towards the tip
    K = int(rng.integers(6, 8))
    pts, wid = [], []
    tau = np.linspace(0.0, 1.0, 260)[:, None]
    for side in (-1.0, 1.0):
        alt = rng.uniform(0.25, 0.75) if side > 0 else 0.0
        for k in range(K):
            sk = 0.05 + 0.72 * (max(k + alt + rng.uniform(-0.2, 0.2), 0.03) / K) ** 1.1
            se = min(sk + (0.15 + 0.11 * (1 - sk)) * rng.uniform(0.9, 1.12), 0.975)
            ye = 0.95 * Wh * float(fprof(np.array(se)))
            p0 = np.array([sk * L, 0.0])
            p2 = np.array([se * L, side * ye])
            p1 = np.array([p0[0] + rng.uniform(0.22, 0.34) * (p2[0] - p0[0]), side * rng.uniform(0.56, 0.68) * ye])
            pts.append((1 - tau) ** 2 * p0 + 2 * tau * (1 - tau) * p1 + tau ** 2 * p2)
            wid.append(0.00030 * (1 - 0.62 * tau[:, 0]) * (1 - 0.45 * sk) * rng.uniform(0.85, 1.15))
    pts, wid = np.concatenate(pts), np.concatenate(wid)
    d_sec, idx = cKDTree(pts).query(np.stack([X.ravel(), Y.ravel()], 1))
    d_sec = d_sec.reshape(X.shape)
    w_sec = wid[idx].reshape(X.shape)
    d_mid = np.abs(Y)
    wm = 0.00058 * (1 - 0.78 * S) + 0.00008
    g_mid = np.exp(-(d_mid / wm) ** 2)
    g_sec = np.exp(-(d_sec / w_sec) ** 2)
    puff = 1.0 - np.exp(-(np.minimum(d_mid, d_sec) / 0.0017) ** 2)

    # --- areoles: two scales of rounded cushions separated by vein creases
    c1 = rng.uniform(0.0016, 0.0020)
    q = np.stack([X, Y, np.full_like(X, seed * 0.013)], -1)
    warp = 0.00045 * np.stack([C.fbm3(q / 0.0035, 2, seed=seed + 4), C.fbm3(q / 0.0035 + 7.7, 2, seed=seed + 5),
                               np.zeros_like(X)], -1)
    F1, F2, _ = C.cellular3(((q + warp) / c1).reshape(-1, 3), seed + 6)
    pill1 = C.smoothstep(0.0, 0.42, (F2 - F1).reshape(X.shape)) ** 0.75
    G1, G2, _ = C.cellular3(((q + warp) / 0.00056 + 31.0).reshape(-1, 3), seed + 7)
    pill2 = C.smoothstep(0.0, 0.35, (G2 - G1).reshape(X.shape))
    big = C.fbm3(q / 0.006 + 3.1, 3, seed=seed + 8)
    ef = C.smoothstep(0.0, 0.10, 1 - np.abs(T)) * C.smoothstep(0.0, 0.04, S) * C.smoothstep(0.0, 0.03, 1 - S)
    h = (-0.00036 * g_mid - 0.00021 * g_sec * (1 - g_mid)
         + 0.00032 * puff * (0.75 + 0.5 * big)
         + 0.00018 * (pill1 - 0.6) * (0.35 + 0.65 * puff)
         + 0.000036 * (pill2 - 0.5)) * ef + 0.00014 * big

    # --- blade shape: arched, drooping tip, convex or cupped across, wavy margin, twist
    wn = w / Wh
    za = L * rng.uniform(0.02, 0.065) * (4 * S * (1 - S) - 0.667)
    zd = -L * rng.uniform(0.02, 0.10) * C.smoothstep(0.55, 1.0, S) ** 2
    zc = Wh * rng.uniform(-0.22, 0.08) * np.abs(T) ** 1.6 * wn
    side3 = np.stack([S * 5.0, np.sign(T) * 2.7 + 0 * S, np.full_like(S, seed * 0.37)], -1)
    zw = 0.0013 * np.abs(T) ** 2.5 * wn * C.perlin3(side3, seed + 9)
    zt = rng.uniform(-0.14, 0.14) * (S - 0.5) * Y
    Z = h + za + zd + zc + zw + zt
    Y = Y + rng.normal(0, 0.035) * L * (4 * S * (1 - S))      # sickle curve in the plane
    X = X - 0.5 * L
    z0 = 0.5 * (Z.max() + Z.min())
    Z = Z - z0
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    faces = C.grid_faces(nv, nu, wrap_v=False)
    r01 = rng.uniform(0, 100)
    attrs = dict(luv=np.stack([S * L * 1000.0, T * w * 1000.0, np.full_like(S, r01)], -1).reshape(-1, 3),
                 lv=np.stack([np.maximum(g_mid, g_sec * 0.9), (1 - pill1) * ef, puff * ef], -1).reshape(-1, 3),
                 lw=np.stack([np.abs(T) + 0 * S, np.zeros_like(S), S + 0 * T], -1).reshape(-1, 3))
    parts = [(verts, faces, 0, attrs)]

    # --- petiole
    n = 9
    tt = np.linspace(0, 1, n)[:, None]
    ln = rng.uniform(0.0015, 0.0035)
    zb = float(Z[nv // 2, 0])
    path = np.array([-0.5 * L + 0.0006, 0.0, zb - 0.0003]) + tt * ln * np.array([-1.0, rng.normal(0, 0.2), rng.normal(-0.1, 0.15)])
    pr = np.linspace(0.00042, 0.00046, n)
    pr[-2] *= 0.9
    pr[-1] *= 0.25
    pv, pf = C.tube(path, pr, nv=12)
    parts.append((pv, pf, 0, dict(luv=np.tile([0.0, 0.0, r01], (len(pv), 1)), lv=np.tile([1.0, 0.0, 0.9], (len(pv), 1)),
                                  lw=np.tile([0.0, 0.0, 0.0], (len(pv), 1)))))

    # --- hairs: margin cilia, on the veins, sparse on the blade
    if hairs:
        nrm = C.vertex_normals(verts, faces)
        ii = np.arange(nv * nu).reshape(nv, nu)
        m_i = np.concatenate([ii[0, rng.integers(int(0.04 * nu), int(0.99 * nu), 700)],
                              ii[-1, rng.integers(int(0.04 * nu), int(0.99 * nu), 700)]])
        vmask = np.where((np.maximum(g_mid, g_sec) > 0.55).ravel())[0]
        v_i = rng.choice(vmask, 500)
        s_i = rng.integers(0, nv * nu, 900)
        allr = np.concatenate([m_i, v_i, s_i])
        H = len(allr)
        ex = np.array([1.0, 0.0, 0.0])
        out = np.zeros((H, 3))
        out[:700, 1] = -1.0
        out[700:1400, 1] = 1.0
        dirs = nrm[allr] * 1.0 + ex * 0.55 + rng.normal(0, 0.35, (H, 3))
        dirs[:1400] = out[:1400] * 1.0 + ex * 0.7 + nrm[allr[:1400]] * 0.25 + rng.normal(0, 0.25, (1400, 3))
        ln_h = np.concatenate([rng.uniform(0.00022, 0.00050, 1400), rng.uniform(0.00015, 0.00040, H - 1400)])
        hv, hf, tv = hair_tubes(rng, verts[allr], dirs, ln_h, rng.uniform(0.000007, 0.000011, H))
        parts.append((hv, hf, 0, dict(luv=np.tile([0.0, 0.0, r01], (len(hv), 1)), lv=np.zeros((len(hv), 3)),
                                      lw=np.stack([np.zeros(len(hv)), np.ones(len(hv)), tv], 1))))
    verts, faces, fm, attrs = merge_parts(parts)
    zr = float(Z.max() - Z.min())
    half = (0.5 * L * 0.96, float(max(wl.max(), wr.max())) * 0.90, max(0.5 * zr * 0.80, 0.0018))
    if flipped:
        verts = verts * [1.0, -1.0, -1.0]
    return dict(verts=verts, faces=faces, face_mat=fm, attrs=attrs, half=half)


# ----------------------------------------------------------------------------- 2. material
def leaf_material():
    m = C.Mat('mint_leaf')
    uv = m.attr('luv', output='Vector')                              # leaf space, millimetres
    lv = m.node('ShaderNodeSeparateXYZ', {0: m.attr('lv', output='Vector')})
    vein, groove, puff = lv.outputs[0], lv.outputs[1], lv.outputs[2]
    lw = m.node('ShaderNodeSeparateXYZ', {0: m.attr('lw', output='Vector')})
    edge, hair = lw.outputs[0], lw.outputs[1]
    back = m.node('ShaderNodeNewGeometry').outputs['Backfacing']
    tone = m.attr('tone', 'INSTANCER')                               # 0 young, yellow-green ... 1 old, dark
    mott = m.noise(scale=0.22, detail=3, roughness=0.6, vector=uv)   # ~5 mm blotches
    fine = m.noise(scale=2.4, detail=3, roughness=0.6, vector=uv)
    # upper side
    top = m.mix((0.040, 0.160, 0.012), (0.095, 0.320, 0.022), m.map_range(puff, 0.15, 0.95))
    top = m.mix(top, (0.140, 0.380, 0.028), m.math('MULTIPLY', m.map_range(mott, 0.40, 0.75), 0.55))
    top = m.mix(top, (0.022, 0.095, 0.010), m.map_range(groove, 0.35, 1.0, 0.0, 0.62, smooth=True))
    top = m.mix(top, (0.220, 0.420, 0.065), m.map_range(vein, 0.60, 0.97, 0.0, 0.55, smooth=True))
    top = m.mix(top, (0.170, 0.400, 0.025), m.math('MULTIPLY', m.map_range(tone, 0.0, 0.45, 1.0, 0.0), 0.45))
    top = m.mix(top, (0.030, 0.120, 0.020), m.math('MULTIPLY', m.map_range(tone, 0.6, 1.0), 0.50))
    top = m.mix(top, m.mix(top, (0.6, 0.6, 0.6), 1.0, blend='MULTIPLY'), m.map_range(fine, 0.35, 0.75))
    gl = m.voronoi(scale=2.9, feature='F1', vector=uv)               # oil glands: tiny pale dots
    gdot = m.map_range(gl, 0.07, 0.13, 1.0, 0.0, smooth=True)
    top = m.mix(top, (0.30, 0.42, 0.10), m.math('MULTIPLY', gdot, 0.55))
    # underside: paler, matte, veins pale and prominent
    under = m.mix((0.060, 0.135, 0.030), (0.090, 0.180, 0.048), mott)
    under = m.mix(under, (0.22, 0.33, 0.11), m.map_range(vein, 0.35, 0.9, 0.0, 0.8, smooth=True))
    col = m.mix(top, under, back)
    col = m.jitter(col, hue=0.012, saturation=0.10, value=0.14)
    col = m.mix(col, (0.55, 0.68, 0.40), hair)
    rn = m.noise(scale=0.9, detail=3, roughness=0.6, vector=uv)
    rough = m.map_range(puff, 0.2, 0.95, 0.60, 0.42)
    rough = m.math('ADD', rough, m.map_range(rn, 0.3, 0.7, -0.06, 0.08))
    rough = m.mixf(rough, 0.60, m.map_range(groove, 0.4, 1.0))
    rough = m.mixf(rough, 0.62, back)
    # micro relief: finest vein reticulation + cell grain + gland bumps
    ret = m.voronoi(scale=2.3, feature='DISTANCE_TO_EDGE', vector=uv)
    nrm = m.bump(m.map_range(ret, 0.0, 0.22), strength=0.5, distance=0.000028)
    nrm = m.bump(m.noise(scale=11.0, detail=3, roughness=0.6, vector=uv), strength=0.5, distance=0.000012, normal=nrm)
    nrm = m.bump(gdot, strength=0.6, distance=0.000015, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.45, specular=0.30, normal=nrm)
    # light through the blade: bright yellow-green, darker under veins
    tc = m.mix((0.095, 0.300, 0.012), (0.200, 0.470, 0.030), m.map_range(puff, 0.1, 0.9))
    tc = m.mix(tc, (0.030, 0.105, 0.006), m.map_range(vein, 0.3, 0.9, 0.0, 0.85))
    tc = m.mix(tc, (0.045, 0.150, 0.008), m.map_range(groove, 0.4, 1.0, 0.0, 0.55))
    tc = m.mix(tc, (0.07, 0.24, 0.012), m.math('MULTIPLY', m.map_range(tone, 0.5, 1.0), 0.5))
    tc = m.jitter(tc, hue=0.010, saturation=0.08, value=0.12)
    tr = m.node('ShaderNodeBsdfTranslucent', {'Color': tc, 'Normal': nrm})
    mix = m.node('ShaderNodeMixShader', {0: m.mixf(0.40, 0.25, hair), 1: m.bsdf.outputs[0], 2: tr.outputs[0]})
    m.nt.links.new(mix.outputs[0], m.out.inputs['Surface'])
    return m


def base_material():
    """Dark leaf-green backing (deeper leaves in shadow): mottled, matte, faint veiny bump."""
    m = C.Mat('mint_base')
    n = m.noise(scale=55, detail=4, roughness=0.6)
    v = m.voronoi(scale=420, feature='DISTANCE_TO_EDGE')
    col = m.mix((0.022, 0.078, 0.010), (0.050, 0.155, 0.018), n)
    m.set(base_color=col, roughness=0.75, specular=0.2, normal=m.bump(m.map_range(v, 0.0, 0.25), 0.6, 0.00015))
    return m.mat


def _object(name, h, mat):
    return C.mesh_from_arrays(name, h['verts'], h['faces'], attrs=h['attrs'], materials=[mat], face_mat=h['face_mat'])


# ----------------------------------------------------------------------------- loose items (flat-lay)
def make_items(seed=0):
    """6 single fresh leaves lying on the table (one of them underside up), lowest point on z = 0."""
    mat = leaf_material()
    rng = np.random.default_rng(600 + seed)
    objs, foot, hh = [], [], []
    for i in range(6):
        h = make_leaf(seed * 100 + 40 + i, nu=560, nv=320, flipped=(i == 5))
        v, fr, hz = settle(h['verts'], rot(2, rng.uniform(0, 2 * math.pi)))
        objs.append(_object('bohe_item_%d' % i, dict(h, verts=v), mat))
        foot.append(fr)
        hh.append(hz)
    return dict(objects=objs, footprint_r=foot, half_height=hh, name='薄荷')


# ----------------------------------------------------------------------------- hero scene
def main():
    args = C.parse_args(seed=SEED)
    sc = C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    hi = sc.render.resolution_x >= 2500
    nu, nv = (760, 440) if hi else (440, 260)
    rng = np.random.default_rng(args.seed)
    mat = leaf_material()
    variants, shapes = [], []
    for i in range(N_UP + N_FLIP):
        h = make_leaf(i, nu=nu, nv=nv, flipped=(i >= N_UP))
        variants.append(_object('leaf%d' % i, h, mat))
        shapes.append(h['half'])
    weights = [1.0] * N_UP + [0.35] * N_FLIP

    sol = C.planet_solve(R_DOME)
    heap = C.pack_heap(R_DOME, sol['patch'], shapes, layers=2.9, coverage=0.80, weights=weights, seed=args.seed,
                       scale_range=(0.84, 1.12), tilt_deg=4.5, roll_deg=6, candidates=8, sink=0.10, rough=0.002,
                       max_slope_deg=13)        # leaves stay near-tangent: a shingled dome, no see-through pile
    n = len(heap)
    C.instance_on_points('heap', variants, heap, attrs={'tone': np.clip(rng.beta(1.8, 2.2, n), 0, 1)})
    # backing: a dark leaf-green surface draped ~3 mm under the local valley floors of the pile.  A loose
    # pile of big flat leaves is full of air; without it the sky shows through the gaps near the limb.
    from scipy.ndimage import minimum_filter, gaussian_filter
    res = float(heap.gx[1] - heap.gx[0])
    low = gaussian_filter(minimum_filter(heap.height, size=max(3, int(0.008 / res))), 0.005 / res) - 0.003
    gxx, gyy = np.meshgrid(heap.gx, heap.gy)
    bv = np.stack([gxx, gyy, low], -1).reshape(-1, 3)
    C.mesh_from_arrays('backing', bv, C.grid_faces(len(heap.gy), len(heap.gx), wrap_v=False), material=base_material())
    C.dome_base(R_DOME - 0.0005, base_material())

    cam, info = C.planet_camera(heap=heap, lens_mm=85, apex=0.56, edge=0.685, top_margin=0.03)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    C.studio_lights(info, tint=SKY_TINT, key=0.85, fill=1.6, rim=1.0, world=2.4, key_size=1.2)
    finish(args, SHOT)


if __name__ == '__main__':
    main()
