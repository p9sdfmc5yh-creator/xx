# -*- coding: utf-8 -*-
"""k08_heye - 荷叶 (fresh lotus leaf with water droplets), kind = surface.

    python k08_heye.py --quality preview --out /tmp/x.png
    python k08_heye.py --quality draft --res 3840x2160 --spp 24 --region 0.35,0.55,0.60,0.80 --out /tmp/c.png
    python k08_heye.py --quality final --out film/renders/k08_heye.png

Macro across the upper side of a peltate lotus leaf draped over the "planet" dome; its thin, ruffled far
RIM is the horizon.  The leaf centre is out of frame below: ~21 primary veins radiate from it, fork
dichotomously three times on the way to the margin and end in a marginal vein.

  1 vein_field()    analytic distance to the nearest vein in leaf polar coordinates (r, phi)
  2 leaf mesh       (s, t) fan grid whose last row IS the rim (smooth silhouette), draped on the sphere,
                    displaced by undulation + rim ruffle + vein ridges; vein texture baked in the same (s, t)
  3 material        glaucous matte lamina (bloom sheen), pale veins, areole mesh, thin-leaf translucency
  4 droplets        sessile beads (contact angle ~150 deg, flattened by gravity when big) + refractive
                    shadow caustics (MNEE) for the bright spot under each bead
Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import bpy                                                                            # noqa: E402
from mathutils import Matrix, Vector                                                  # noqa: E402

SHOT = 'k08_heye'
NAME = '荷叶'
TMP = os.path.join(C.SCRATCH, 'tmp_' + SHOT)
R_DOME = 0.25             # dome the leaf is draped over -> frame is ~165 mm wide at the rim
R_LEAF = 0.26             # leaf radius (a 52 cm leaf)
Y_RIM0 = 0.015            # rim position on the dome at x = 0 (the limb is at +0.022)
N_MAIN = 21               # primary veins


# ----------------------------------------------------------------------------- 1. venation
def _h(k, c):
    x = np.sin(k * 12.9898 + c * 78.233) * 43758.5453
    return x - np.floor(x)


def _fork(r, rf, L):
    """0 before the fork radius, 1 once the two daughter veins run parallel again; starts with a
    definite angle (a real 'Y'), eases out."""
    return 1.0 - (1.0 - np.clip((r - rf) / L, 0.0, 1.0)) ** 1.7


def vein_field(r, phi):
    """Arc distance d (m) to the nearest vein and that vein's half width hw (m)."""
    w = 2.0 * math.pi / N_MAIN
    k0 = np.round(phi / w)
    side = np.where(phi - k0 * w >= 0, 1.0, -1.0)
    out = None
    for kk in (k0, k0 + side):
        A = kk * w + (_h(kk, 1.0) - 0.5) * 0.22 * w
        A = A + w * (0.014 * np.sin(r * (2 * math.pi / 0.120) + 6.283 * _h(kk, 5.0))
                     + 0.005 * np.sin(r * (2 * math.pi / 0.041) + 6.283 * _h(kk, 6.0)))
        a = phi - A
        S1 = _fork(r, R_LEAF * (0.42 + 0.17 * _h(kk, 2.0)), 0.22 * R_LEAF)
        s1 = np.where(a >= 0, 1.0, -1.0)
        a = a - s1 * (w / 4) * S1 * (1.0 + 0.16 * (_h(kk * 2 + s1, 7.0) - 0.5))
        S2 = _fork(r, R_LEAF * (0.68 + 0.09 * _h(kk * 2 + s1, 3.0)), 0.14 * R_LEAF)
        s2 = np.where(a >= 0, 1.0, -1.0)
        a = a - s2 * (w / 8) * S2
        S3 = _fork(r, R_LEAF * (0.850 + 0.055 * _h(kk * 4 + s1 * 2 + s2, 4.0)), 0.085 * R_LEAF)
        s3 = np.where(a >= 0, 1.0, -1.0)
        a = a - s3 * (w / 16) * S3
        d = r * np.abs(a)
        hw = 0.00074 * (1 - 0.22 * r / R_LEAF) * (1 - 0.30 * S1) * (1 - 0.28 * S2) * (1 - 0.24 * S3)
        if out is None:
            out = [d, hw]
        else:
            m = d / hw < out[0] / out[1]
            out = [np.where(m, d, out[0]), np.where(m, hw, out[1])]
    return out[0], out[1]


def _rim_radius(phi):
    """Leaf outline: almost a circle, slightly lobed, finely irregular, two small nicks."""
    arc = phi * R_LEAF
    rr = R_LEAF * (1.0 + 0.0040 * np.sin(arc * (2 * math.pi / 0.090) + 0.7) + 0.0012 * np.sin(arc * (2 * math.pi / 0.031) + 2.1)
                   + 0.0007 * np.sin(arc * (2 * math.pi / 0.0061) + 4.0) + 0.0004 * np.sin(arc * (2 * math.pi / 0.0027) + 1.0))
    for a0, depth, wid in ((-0.047, 0.0026, 0.0020), (0.064, 0.0018, 0.0016)):
        rr = rr - depth * np.exp(-((arc - a0) / wid) ** 2)
    return rr


class Fan(object):
    """(s, t) parametrisation of the visible fan of the leaf: s in [-1, 1] across the frame,
    t in [0, 1] from the near cut to the rim (t = 1 is exactly the margin)."""

    def __init__(self, patch):
        xmin, xmax, ymin, ymax = [float(v) for v in patch]
        self.yc = Y_RIM0 - R_LEAF                         # leaf centre (out of frame, below)
        self.xh = max(abs(xmin), abs(xmax))
        self.r_min = max(0.03, (ymin - self.yc) - 0.004)

    def polar(self, s, t):
        r0 = self.r_min + t * (R_LEAF - self.r_min)
        phi = s * np.arcsin(np.minimum(0.98, self.xh / r0))
        r = self.r_min + t * (_rim_radius(phi) - self.r_min)
        return r, phi


def make_vein_texture(path, fan, W=6144, H=4096):
    """16-bit PNG in the fan's (s, t) space: R = vein profile, G = broad ridge along the veins,
    B = marginal vein.  v = 0 is the bottom row."""
    import cv2
    img = np.zeros((H, W, 3), np.uint16)
    s = np.linspace(-1, 1, W, dtype=np.float32)[None, :]
    for j0 in range(0, H, 512):
        t = ((np.arange(j0, min(j0 + 512, H), dtype=np.float32) + 0.5) / H)[:, None]
        S, T = np.broadcast_arrays(s, t)
        r, phi = fan.polar(S.astype(np.float64), T.astype(np.float64))
        d, hw = vein_field(r, phi)
        prof = np.exp(-(d / hw) ** 2)
        broad = np.exp(-(d / (6.0 * hw + 0.0016)) ** 2)
        rim_d = (1.0 - T) * (R_LEAF - fan.r_min)
        marg = np.exp(-((rim_d - 0.0026) / 0.00030) ** 2) * 0.75
        prof = np.maximum(prof * C.smoothstep(0.0004, 0.0030, rim_d), marg)
        blk = np.stack([np.zeros_like(prof) + marg, broad, prof], -1)          # BGR
        img[H - 1 - np.arange(j0, j0 + blk.shape[0])] = (np.clip(blk, 0, 1) * 65535 + 0.5).astype(np.uint16)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv2.imwrite(path, img)
    return path


# ----------------------------------------------------------------------------- 3. materials
def leaf_material(tex_path=None, dried=False):
    """Lotus lamina.  tex_path: baked vein texture (UV = fan (s, t)); None -> vertex attributes
    'vein' / 'broad' (loose pieces).  dried=True: the yellow-green to olive-brown pharmacy herb."""
    m = C.Mat('lotus_dry' if dried else 'lotus_leaf', sss_method='BURLEY')
    if tex_path:
        img = bpy.data.images.load(tex_path)
        img.colorspace_settings.name = 'Non-Color'
        tex = m.node('ShaderNodeTexImage', {'Vector': m.coords('UV')}, image=img, extension='EXTEND', interpolation='Cubic')
        sp = m.node('ShaderNodeSeparateColor', {0: tex.outputs['Color']})
        vein, broad = sp.outputs[0], sp.outputs[1]
    else:
        vein, broad = m.attr('vein'), m.attr('broad')
    lp = m.attr('lp', output='Vector')                                  # leaf-plane metres
    rimk = m.attr('rimk')
    n_big = m.noise(scale=11, detail=3, roughness=0.55, vector=lp)
    n_mid = m.noise(scale=75, detail=3, roughness=0.6, vector=lp)
    n_f = m.noise(scale=1700, detail=3, roughness=0.6, vector=lp)
    warp = m.node('ShaderNodeVectorMath', {0: lp, 1: m.node('ShaderNodeVectorMath', {
        0: m.noise(scale=160, detail=2, vector=lp, color=True), 1: (0.0011, 0.0011, 0.0)}, operation='MULTIPLY').outputs[0]},
        operation='ADD').outputs[0]
    are = m.map_range(m.voronoi(scale=430, feature='DISTANCE_TO_EDGE', vector=warp), 0.0, 0.045, 1.0, 0.0, smooth=True)   # areoles
    are2 = m.map_range(m.voronoi(scale=1500, feature='DISTANCE_TO_EDGE', vector=warp), 0.0, 0.07, 1.0, 0.0, smooth=True)
    if dried:
        col = m.mix((0.115, 0.125, 0.030), (0.215, 0.185, 0.048), m.map_range(n_big, 0.3, 0.7))
        col = m.mix(col, (0.090, 0.060, 0.020), m.map_range(n_mid, 0.55, 0.80, 0.0, 0.6, smooth=True))
        vcol, acol, bcol = (0.36, 0.30, 0.11), (0.20, 0.18, 0.06), (0.19, 0.17, 0.05)
    else:
        col = m.mix((0.014, 0.068, 0.040), (0.034, 0.112, 0.040), m.map_range(n_big, 0.28, 0.72, smooth=True))   # blue-green .. mid green
        col = m.hsv(col, 0.5, 1.0, m.map_range(n_mid, 0.25, 0.75, 0.84, 1.14))
        vcol, acol, bcol = (0.185, 0.30, 0.095), (0.050, 0.135, 0.052), (0.046, 0.128, 0.047)
    col = m.mix(col, bcol, m.math('MULTIPLY', broad, 0.55))
    col = m.mix(col, acol, m.math('ADD', m.math('MULTIPLY', are, 0.40), m.math('MULTIPLY', are2, 0.12)))
    vmask = m.map_range(vein, 0.18, 0.75, 0.0, 1.0, smooth=True)
    col = m.mix(col, vcol, m.math('MULTIPLY', vmask, 0.88))
    col = m.mix(col, (0.30, 0.34, 0.060) if not dried else (0.16, 0.10, 0.03), m.math('MULTIPLY', rimk, 0.62))     # thin yellow-green margin
    speck = m.map_range(m.noise(scale=950, detail=2, vector=lp), 0.74, 0.80, 0.0, 0.5)             # dust / tiny blemishes
    col = m.mix(col, (0.20, 0.21, 0.13), speck)
    back = m.node('ShaderNodeNewGeometry').outputs['Backfacing']
    col = m.mix(col, m.mix((0.115, 0.215, 0.115), (0.33, 0.43, 0.20), vmask), back)                # paler underside
    rough = m.map_range(n_f, 0.3, 0.7, 0.74, 0.92)
    rough = m.mixf(rough, 0.48, m.math('MULTIPLY', vmask, 0.7))
    nrm = m.bump(vein, strength=0.55, distance=0.00012)
    nrm = m.bump(are, strength=0.5, distance=0.00005, normal=nrm)
    nrm = m.bump(n_mid, strength=0.25, distance=0.00030, normal=nrm)
    nrm = m.micro_bump(scale=9000, strength=0.55, distance=0.000022, vector=lp, normal=nrm)        # papillae
    m.set(base_color=col, roughness=rough, ior=1.45, specular=0.22, sss=0.20, sss_radius=(0.35, 1.0, 0.25),
          sss_scale=0.0004, sheen=0.0 if dried else 0.22, sheen_roughness=0.5, normal=nrm)
    try:
        m.set(**{'Sheen Tint': (0.55, 0.85, 0.80)})                                                # waxy bloom
    except Exception:
        pass
    # thin-leaf translucency: back-lit rim ruffles glow yellow-green
    tcol = m.mix((0.16, 0.36, 0.035), (0.40, 0.50, 0.06), rimk)
    tcol = m.mix(tcol, (0.30, 0.44, 0.10), m.math('MULTIPLY', vmask, 0.6))
    trn = m.node('ShaderNodeBsdfTranslucent', {'Color': tcol, 'Normal': nrm})
    mx = m.node('ShaderNodeMixShader', {0: m.mixf(0.20, 0.42, rimk)})
    m.nt.links.new(m.bsdf.outputs[0], mx.inputs[1])
    m.nt.links.new(trn.outputs[0], mx.inputs[2])
    m.nt.links.new(mx.outputs[0], m.out.inputs['Surface'])
    return m


def water_material(shadow_transparent):
    mat = bpy.data.materials.new('water')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    glass = nt.nodes.new('ShaderNodeBsdfGlass')
    glass.inputs['Roughness'].default_value = 0.0
    glass.inputs['IOR'].default_value = 1.333
    if shadow_transparent:
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        tr.inputs['Color'].default_value = (0.9, 0.9, 0.9, 1)
        lp = nt.nodes.new('ShaderNodeLightPath')
        mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(lp.outputs['Is Shadow Ray'], mix.inputs[0])
        nt.links.new(glass.outputs[0], mix.inputs[1])
        nt.links.new(tr.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
    else:
        nt.links.new(glass.outputs[0], out.inputs['Surface'])
    return mat


# ----------------------------------------------------------------------------- 4. droplets
def _bead(a, seed, nu=72, nv=128):
    """Sessile water bead of horizontal radius a: sphere when tiny, flattened by gravity when big
    (height -> ~5 mm), sitting on a small contact disc (contact angle ~150 deg).  Base at z = 0."""
    rng = np.random.default_rng(seed)
    c = a / math.sqrt(1.0 + (a / 0.0027) ** 2)
    th = np.linspace(0, math.pi, nu)[:, None]
    ph = np.linspace(0, 2 * math.pi, nv, endpoint=False)[None, :]
    ell = 1.0 + rng.uniform(0.0, 0.035) * np.cos(2 * ph + rng.uniform(0, 6))          # never a perfect circle
    lower = np.clip(-np.cos(th), 0, 1)                                                # flatter underneath
    v = np.stack([a * np.sin(th) * np.cos(ph) * ell, a * np.sin(th) * np.sin(ph) / ell,
                  c * np.cos(th) * (1.0 - 0.10 * lower) + np.zeros_like(ph)], -1).reshape(-1, 3)
    f = C.grid_faces(nu, nv, wrap_v=True)
    p0, p1, p2 = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    if np.einsum('ij,ij->i', p0, np.cross(p1, p2)).sum() < 0:                         # normals out of the water
        f = f[:, ::-1].copy()
    v[:, 2] += 0.84 * c
    return v, f, c


def add_droplets(pos, nrm, h, X, Y, sol, rng, caustics):
    """Beads rest where the lamina dips.  pos/nrm/h: leaf vertices, normals, height field."""
    xmin, xmax, ymin, ymax = sol['patch']
    water = water_material(shadow_transparent=not caustics)
    px, py = pos[:, 0], pos[:, 1]
    zone = (np.abs(px) < 0.27 * (xmax - xmin)) & (py > ymin + 0.30 * (Y_RIM0 - ymin)) & (py < Y_RIM0 - 0.050)
    idx = np.flatnonzero(zone)
    idx = idx[rng.choice(len(idx), size=min(60000, len(idx)), replace=False)]
    order = idx[np.argsort(h[idx])]
    radii = [0.0064, 0.0046, 0.0036, 0.0052, 0.0027, 0.0031, 0.0021, 0.0040, 0.0018, 0.0024]
    chosen = []
    for i in order[:len(order) // 3]:
        if len(chosen) == len(radii):
            break
        a = radii[len(chosen)]
        if all(np.hypot(px[i] - px[j], py[i] - py[j]) > 3.2 * (a + radii[k]) + 0.012 for k, j in enumerate(chosen)):
            chosen.append(int(i))
    objs = []
    for k, i in enumerate(chosen):
        v, f, c = _bead(radii[k], 300 + k)
        ob = C.mesh_from_arrays('bead%d' % k, v, f, material=water)
        q = Vector((0, 0, 1)).rotation_difference(Vector(nrm[i]))
        ob.matrix_world = Matrix.Translation(Vector(pos[i])) @ q.to_matrix().to_4x4() @ Matrix.Rotation(rng.uniform(0, 6.28), 4, 'Z')
        objs.append(ob)
    # tiny droplets: spheres, a loose sprinkle + satellites near the big beads
    v, f, _ = _bead(1.0, 7, nu=24, nv=32)
    v[:, 2] -= v[:, 2].min()
    tiny = C.mesh_from_arrays('tiny_bead', v, f, material=water)
    ti = list(idx[rng.choice(len(idx), size=46, replace=False)])
    for i in chosen:
        near = idx[np.hypot(px[idx] - px[i], py[idx] - py[i]) < 0.022]
        ti += list(near[rng.choice(len(near), size=min(4, len(near)), replace=False)])
    ti = np.array([i for i in ti if all(np.hypot(px[i] - px[j], py[i] - py[j]) > radii[k] * 1.25 + 0.0012 for k, j in enumerate(chosen))])
    rad = np.clip(rng.lognormal(math.log(0.00050), 0.5, len(ti)), 0.00018, 0.0014)
    qn = np.tile(np.array([[1.0, 0, 0, 0]]), (len(ti), 1))
    C.instance_on_points('tiny_beads', [tiny], loc=pos[ti] - nrm[ti] * (0.10 * rad)[:, None], quat=qn, scale=rad, var=np.zeros(len(ti), int))
    print('[droplets] %d beads, %d tiny' % (len(objs), len(ti)))
    return objs


def enable_caustics(light_ob, casters, receiver):
    """Refractive shadow caustics (MNEE): the bright focused spot in the shadow under each bead."""
    try:
        light_ob.data.cycles.is_caustics_light = True
        for ob in casters:
            ob.cycles.is_caustics_caster = True
        receiver.cycles.is_caustics_receiver = True
        return True
    except Exception as e_:                                             # pragma: no cover
        print('[warn] shadow caustics unavailable:', e_)
        return False


# ----------------------------------------------------------------------------- loose items
def make_piece(seed, mat, n=230):
    """One piece of the dried herb: a torn / cut sector fragment of leaf, veins fanning out, gently
    curled.  Lies on z = 0 (lowest point), origin at the footprint centre."""
    rng = np.random.default_rng(800 + seed)
    r1 = rng.uniform(0.07, 0.17)
    r2 = r1 + rng.uniform(0.030, 0.052)
    p0 = rng.uniform(0, 2 * math.pi)
    dphi = rng.uniform(0.030, 0.048) / (0.5 * (r1 + r2))
    gs, gt = np.meshgrid(np.linspace(-1, 1, n), np.linspace(0, 1, n))
    s, t = gs.ravel(), gt.ravel()
    e1 = 0.10 * np.sin(s * rng.uniform(2, 5) + rng.uniform(0, 6)) + 0.04 * np.sin(s * rng.uniform(9, 16) + rng.uniform(0, 6))
    e2 = 0.10 * np.sin(s * rng.uniform(2, 5) + rng.uniform(0, 6)) + 0.04 * np.sin(s * rng.uniform(9, 16) + rng.uniform(0, 6))
    tt = (t * (1 + e2 - e1) + e1)
    r = r1 + tt * (r2 - r1)
    side = 1.0 + 0.10 * np.sin(t * rng.uniform(3, 6) + rng.uniform(0, 6)) * np.abs(s) + 0.03 * np.sin(t * rng.uniform(11, 19)) * np.abs(s)
    phi = p0 + 0.5 * dphi * s * side
    d, hw = vein_field(r, phi)
    x, y = r * np.sin(phi - p0), r * np.cos(phi - p0) - 0.5 * (r1 + r2)
    P = np.stack([x, y, np.zeros_like(x)], -1)
    ax = rng.uniform(0, math.pi)                                         # curl axis
    q = x * math.cos(ax) + y * math.sin(ax)
    Rc = rng.uniform(0.030, 0.070) * rng.choice([-1, 1])
    z = (q * q) / (2 * Rc) + 0.0016 * C.fbm3(P * 45.0, 2, seed=seed) + 0.0005 * C.fbm3(P * 160.0, 2, seed=seed + 1)
    z = z + 0.00035 * np.exp(-(d / (3 * hw)) ** 2)
    z = z - z.min()
    cx, cy = 0.5 * (x.max() + x.min()), 0.5 * (y.max() + y.min())
    v = np.stack([x - cx, y - cy, z], -1)
    em = np.minimum(np.minimum(s + 1, 1 - s), np.minimum(t, 1 - t)) * 0.5 * (r2 - r1)
    attrs = dict(vein=np.exp(-(d / hw) ** 2).astype(np.float32), broad=np.exp(-(d / (6 * hw + 0.0016)) ** 2).astype(np.float32),
                 rimk=(1.0 - C.smoothstep(0.0, 0.0016, em)).astype(np.float32) * 0.6, lp=np.stack([x + seed, y, np.zeros_like(x)], -1))
    ob = C.mesh_from_arrays('heye_item_%d' % seed, v, C.grid_faces(n, n, wrap_v=False), attrs=attrs, material=mat)
    return ob, float(np.hypot(v[:, 0], v[:, 1]).max()), float(0.5 * z.max())


def make_items(seed=0, n=5):
    """Loose items for the flat-lay version: dried lotus-leaf pieces (干荷叶片) as dispensed.
    -> dict(objects, footprint_r [m], half_height [m], name)."""
    mat = leaf_material(None, dried=True)
    objs, fr, hh = [], [], []
    for i in range(n):
        ob, r, h = make_piece(seed * 7 + i, mat)
        objs.append(ob)
        fr.append(r)
        hh.append(h)
    return dict(objects=objs, footprint_r=fr, half_height=hh, name=NAME)


# ----------------------------------------------------------------------------- scene
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    sc = bpy.context.scene
    sc.cycles.transmission_bounces = 8
    sc.cycles.max_bounces = 10
    rng = np.random.default_rng(args.seed + 5)
    R = R_DOME
    APEX, EDGE = 0.545, 0.685
    sol = C.planet_solve(R, lens_mm=85, apex=APEX, edge=EDGE)
    fan = Fan(sol['patch'])
    hi = sc.render.resolution_x > 2000
    n_s, n_t = (1500, 1400) if hi else (1000, 900)
    tw, thh = (6144, 4096) if hi else (4096, 2560)
    tex = os.path.join(TMP, 'veins_v4_%dx%d.png' % (tw, thh))
    if not os.path.exists(tex):
        make_vein_texture(tex, fan, tw, thh)
    gs, gt = np.meshgrid(np.linspace(-1, 1, n_s), np.linspace(0, 1, n_t))
    s, t = gs.ravel(), gt.ravel()
    r, phi = fan.polar(s, t)
    X, Y = r * np.sin(phi), fan.yc + r * np.cos(phi)                    # leaf plane
    rho = np.hypot(X, Y) + 1e-12
    th = rho / R                                                        # draped on the dome
    nrm = np.stack([np.sin(th) * X / rho, np.sin(th) * Y / rho, np.cos(th)], -1)
    d, hw = vein_field(r, phi)
    P3 = np.stack([X, Y, np.zeros_like(X)], -1)
    und = 0.0024 * C.fbm3(P3 * 7.0 + 1.3, 2, seed=args.seed + 1) + 0.0005 * C.fbm3(P3 * 26.0, 2, seed=args.seed + 2)
    edge = C.smoothstep(0.80, 1.0, t)
    arc = phi * R_LEAF
    ruf = (0.0021 * np.sin(arc * (2 * math.pi / 0.082) + 0.6 + 1.3 * np.sin(arc * (2 * math.pi / 0.23)))
           + 0.0005 * np.sin(arc * (2 * math.pi / 0.033) + 1.9)) * edge ** 2 - 0.0010 * edge ** 2
    broad = np.exp(-(d / (6.0 * hw + 0.0016)) ** 2)
    h = und + ruf + 0.00040 * (broad - 0.45) + 0.00007 * np.exp(-(d / hw) ** 2)
    pos = nrm * (R + h)[:, None]
    rim_d = (1.0 - t) * (R_LEAF - fan.r_min)
    attrs = dict(lp=P3, rimk=(1.0 - C.smoothstep(0.0003, 0.0045, rim_d)).astype(np.float32))
    uv = np.stack([0.5 * (s + 1.0), t], -1)
    leaf = C.mesh_from_arrays('leaf', pos, C.grid_faces(n_t, n_s, wrap_v=False), attrs=attrs, uvs=uv, material=leaf_material(tex))
    print('[leaf] fan r %.3f..%.3f m, half width %.3f m, grid %dx%d (%.2f x %.2f mm)' % (
        fan.r_min, R_LEAF, fan.xh, n_s, n_t, 2000 * fan.xh / n_s, 1000 * (R_LEAF - fan.r_min) / n_t))

    cam, info = C.planet_camera(R + 0.0008, lens_mm=85, apex=APEX, edge=EDGE)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    L = C.studio_lights(info, tint=(0.86, 1.0, 0.93), key=0.80, fill=0.55, rim=1.0, world=0.0, key_size=0.9, top=0.25)
    # Sky for the water only: a bead is a lens - against a black world it turns into a black marble.
    # Glossy / transmission rays see a soft bright overcast dome, diffuse shading sees a dim one.
    wd = bpy.data.worlds.new('pond_sky')
    wd.use_nodes = True
    wn = wd.node_tree
    wn.nodes.clear()
    wo = wn.nodes.new('ShaderNodeOutputWorld')
    bg = wn.nodes.new('ShaderNodeBackground')
    tc = wn.nodes.new('ShaderNodeTexCoord')
    sx = wn.nodes.new('ShaderNodeSeparateXYZ')
    rmp = wn.nodes.new('ShaderNodeValToRGB')
    rmp.color_ramp.elements[0].position, rmp.color_ramp.elements[0].color = 0.40, (0.020, 0.040, 0.030, 1)
    rmp.color_ramp.elements[1].position, rmp.color_ramp.elements[1].color = 0.95, (0.50, 0.66, 0.60, 1)
    mr = wn.nodes.new('ShaderNodeMapRange')
    mr.inputs[1].default_value, mr.inputs[2].default_value = -1.0, 1.0
    lpn = wn.nodes.new('ShaderNodeLightPath')
    mth = wn.nodes.new('ShaderNodeMath')
    mth.operation = 'MULTIPLY_ADD'
    mth.inputs[1].default_value, mth.inputs[2].default_value = -0.85, 1.0      # diffuse rays: 15 %
    wn.links.new(tc.outputs['Generated'], sx.inputs[0])
    wn.links.new(sx.outputs[2], mr.inputs[0])
    wn.links.new(mr.outputs[0], rmp.inputs[0])
    wn.links.new(rmp.outputs[0], bg.inputs['Color'])
    wn.links.new(lpn.outputs['Is Diffuse Ray'], mth.inputs[0])
    wn.links.new(mth.outputs[0], bg.inputs['Strength'])
    wn.links.new(bg.outputs[0], wo.inputs['Surface'])
    sc.world = wd
    key = L.get('key') if isinstance(L, dict) else bpy.data.objects.get('key')
    beads = add_droplets(pos, nrm, h, X, Y, sol, rng, caustics=True)
    if not (key is not None and enable_caustics(key, beads, leaf)):
        for ob in beads:                                                # fall back: light passes straight through
            ob.data.materials[0] = water_material(True)

    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, SHOT + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    C.quick_comp(args.out, SHOT, comp, crop=args.region, text=not args.region)
    print('[comp]', comp)


if __name__ == '__main__':
    main()
