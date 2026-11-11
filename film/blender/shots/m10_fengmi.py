# -*- coding: utf-8 -*-
"""m10_fengmi - 蜂蜜 (honey in honeycomb), kind = special.

    python m10_fengmi.py --quality preview --out /tmp/x.png
    python m10_fengmi.py --quality draft --res 3840x2160 --spp 24 --region 0.35,0.55,0.60,0.80 --out /tmp/c.png
    python m10_fengmi.py --quality final --out film/renders/m10_fengmi.png

A gently domed slab of natural comb (the "planet"): hand-built beeswax cells 5.2 mm across flats on a
slightly warped lattice, lumpy rounded rims, most cells brimming with honey (one refractive, absorbing
sheet with a concave meniscus in every cell), a patch of ivory wax cappings, a few empty cells, and a
thick tongue of honey that has run across the comb (bulging edge, sags a little over every cell).

  1 comb_fields()   numpy height fields of wax + honey in the comb plane (u, v)   2 materials
  3 dome scene (C.patch_grid canvas draped on the sphere)   4 make_items(): cut comb pieces
Units are metres.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import common as C                                                                    # noqa: E402
import bpy                                                                            # noqa: E402

SHOT = 'm10_fengmi'
NAME = '蜂蜜'
R_DOME = 0.135            # comb dome radius -> a cell is ~110 px at the horizon, ~155 px in the foreground (1920 frame)
S_CELL = 0.0052           # cell width across flats
DEPTH = 0.0058            # modelled cell depth (real cells are ~11 mm; the honey hides the rest)
SLOPE = 14.0              # steepness of the cell walls in the height field
SQ3 = math.sqrt(3.0)


# ----------------------------------------------------------------------------- 1. height fields
def _hash01(i, j, k):
    h = np.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453
    return h - np.floor(h)


def _softmax(a, b, k):
    m = np.maximum(a, b)
    return m + k * np.log(np.exp((a - m) / k) + np.exp((b - m) / k))


def _hex(x, y, s):
    """Nearest cell of a hexagonal lattice (flat-to-flat s).  -> qi, ri, centre X, Y, hex metric m
    (0 at the centre, s/2 on the wall mid-line) and |d|."""
    q = (x - y / SQ3) / s
    r = (2.0 * y / SQ3) / s
    cx, cz = q, r
    cy = -cx - cz
    rx, ry, rz = np.round(cx), np.round(cy), np.round(cz)
    dx, dy, dz = np.abs(rx - cx), np.abs(ry - cy), np.abs(rz - cz)
    fx = (dx > dy) & (dx > dz)
    fz = (~fx) & (dz >= dy)
    qi = np.where(fx, -ry - rz, rx)
    ri = np.where(fz, -rx - ry, rz)
    X = s * (qi + 0.5 * ri)
    Y = s * 0.5 * SQ3 * ri
    ex, ey = x - X, y - Y
    m = np.maximum(np.abs(ex), np.maximum(np.abs(0.5 * ex + 0.5 * SQ3 * ey), np.abs(-0.5 * ex + 0.5 * SQ3 * ey)))
    return qi, ri, X, Y, m, np.hypot(ex, ey)


def _flow_dn(u, v, path):
    """Normalised distance (1 = edge) to a tongue of honey given as [(x, y, half_width), ...]."""
    best = np.full(u.shape, 1e9)
    for (ax, ay, wa), (bx, by, wb) in zip(path[:-1], path[1:]):
        abx, aby = bx - ax, by - ay
        t = np.clip(((u - ax) * abx + (v - ay) * aby) / (abx * abx + aby * aby), 0, 1)
        d = np.hypot(u - ax - t * abx, v - ay - t * aby)
        best = np.minimum(best, d / (wa + (wb - wa) * t))
    return best


def comb_fields(u, v, seed=0, flow=None, cap_at=None, empty_at=None, cap_frac=0.20, empty_frac=0.09):
    """Wax and honey height fields over the comb plane.  u, v: (N,) metres.
    flow: None or [(x, y, half_width), ...] poly-line of a honey tongue; cap_at / empty_at: (x, y, r)
    where a patch of capped / emptied cells is wanted.  -> dict(zw, zh, attrs=dict(cap, rim, dep, wet))"""
    P = np.stack([u, v, np.zeros_like(u)], -1)
    # bees do not use a ruler: the lattice drifts, walls wander
    x = u + 0.00062 * C.fbm3(P * 55.0 + 3.1, 2, seed=seed + 1) + 0.00011 * C.fbm3(P * 300.0 + 1.7, 2, seed=seed + 5)
    y = v + 0.00062 * C.fbm3(P * 55.0 + 9.7, 2, seed=seed + 2) + 0.00011 * C.fbm3(P * 300.0 + 6.3, 2, seed=seed + 6)
    qi, ri, X, Y, m, rr = _hex(x, y, S_CELL)
    half = 0.5 * S_CELL
    mm = np.maximum(m, 0.905 * rr)                       # rounded interior corners, thick wall junctions
    e = np.clip(half - mm, 0.0, None)                    # distance from the wall mid-line
    rc = np.clip(mm / half, 0, 1)                        # 0 centre .. 1 wall
    h1, h2, h3 = _hash01(qi, ri, 1.0 + seed), _hash01(qi, ri, 2.3 + seed), _hash01(qi, ri, 4.1 + seed)
    Pc = np.stack([X, Y, np.zeros_like(X)], -1)
    capn = C.fbm3(Pc * 30.0 + 11.0, 2, seed=seed + 20)
    emn = C.fbm3(Pc * 42.0 + 5.0, 2, seed=seed + 21)
    if cap_at is not None:
        capn = capn + 1.5 * np.exp(-((X - cap_at[0]) ** 2 + (Y - cap_at[1]) ** 2) / cap_at[2] ** 2)
    if empty_at is not None:
        emn = emn + 1.5 * np.exp(-((X - empty_at[0]) ** 2 + (Y - empty_at[1]) ** 2) / empty_at[2] ** 2)
    capped = (capn > np.quantile(capn, 1.0 - cap_frac)) | (h1 > 0.972)
    empty = (~capped) & ((emn > np.quantile(emn, 1.0 - empty_frac)) | (h1 < 0.028))
    partial = (~capped) & (~empty) & (h1 < 0.115)
    lvl = np.where(partial, 0.0012 + 0.0026 * h2, 0.00012 + 0.00070 * h2 ** 2)      # honey level below the rim

    tw = 0.00021 + 0.00010 * C.fbm3(P * 420.0 + 2.2, 2, seed=seed + 7)               # wall half thickness
    tw = np.clip(tw, 0.00014, 0.00036)
    zr_low = 0.00024 * C.fbm3(P * 85.0 + 4.0, 2, seed=seed + 8)                      # uneven rim height
    zr = zr_low + 0.00015 * C.fbm3(P * 650.0, 2, seed=seed + 9) + 0.000045 * C.fbm3(P * 2600.0, 2, seed=seed + 10)
    t = np.clip(e / tw, 0, 1)
    top = zr - 0.55 * tw * (1.0 - np.sqrt(1.0 - t * t))                              # rounded rim
    ei = e - tw
    floor = DEPTH + 0.0006 * (1.0 - rc * rc)
    desc = -_softmax(-np.clip(ei, 0, None) * SLOPE, -floor, 0.00030)                 # soft min(wall, floor)
    z_open = np.where(ei < 0, top, zr - 0.55 * tw - desc)
    # cappings: thin wax lids, a little sunken or domed, finely wrinkled, the hexagon still shows
    wr = C.ridged3(P * 1100.0 + 3.0, 3, seed=seed + 11)
    wr = (wr - wr.mean()) / (wr.std() + 1e-9)
    capz = (zr_low - 0.00020 + 0.00034 * (h2 - 0.42) * (1.0 - rc * rc) + 0.000045 * np.clip(wr, -2, 2)
            + 0.000050 * C.fbm3(P * 330.0 + 8.0, 2, seed=seed + 12))
    z_cap = _softmax(np.where(ei < 0, top, zr - 0.55 * tw - np.clip(ei, 0, None) * 2.5), capz, 0.00004)
    zw = np.where(capped, z_cap, z_open)

    # honey: per-cell level + concave meniscus climbing the walls
    rise = np.minimum(0.00032, 0.8 * lvl)
    zc = zr_low - 0.55 * tw - lvl + rise * np.exp(-np.clip(ei, 0, None) / 0.00050)
    zc = np.where(ei < 0, zr_low - 0.55 * tw - lvl - 0.0005, zc)
    zc = np.where(capped | empty, zr_low - DEPTH - 0.0030, zc)
    wet = np.zeros_like(u)
    if flow is not None:
        dn = _flow_dn(u, v, flow) * (1.0 + 0.24 * C.fbm3(P * 60.0 + 2.0, 2, seed=seed + 30)
                                     + 0.07 * C.fbm3(P * 210.0, 2, seed=seed + 31))
        bump = np.clip(1.0 - dn * dn, 0.0, 1.0)
        thick = 0.00070 + 0.00135 * C.smoothstep(0.006, -0.022, v)                   # thin at the limb, fat in front
        sag = 0.00010 * C.smoothstep(0.0, 0.0012, ei) * (~capped)
        F = zr_low - 0.0010 + (0.0010 + thick) * bump ** 0.5 - sag * bump
        F = np.where(bump > 0, F, zr_low - DEPTH - 0.0030)
        zh = _softmax(zc, F, 0.00008)
        wet = C.smoothstep(1.45, 1.0, dn) * (0.55 + 0.45 * C.smoothstep(-0.2, 0.3, C.fbm3(P * 150.0 + 7.0, 2, seed=seed + 32)))
    else:
        zh = zc
    # honey smeared over some rims of brim-full cells
    wet = np.maximum(wet, (lvl < 0.00030) * (~capped) * (~empty) * 0.8 * C.smoothstep(0.0, 0.3, C.fbm3(P * 240.0 + 1.0, 2, seed=seed + 33)))
    attrs = dict(cap=(capped * C.smoothstep(-0.2 * tw, 0.6 * tw, ei)).astype(np.float32),
                 rim=(1.0 - C.smoothstep(0.7 * tw, 1.8 * tw, e)).astype(np.float32),
                 dep=np.clip((zr - zw) / DEPTH, 0, 1).astype(np.float32),
                 wet=np.clip(wet, 0, 1).astype(np.float32),
                 crnd=h3.astype(np.float32))
    return dict(zw=zw, zh=zh, attrs=attrs)


# ----------------------------------------------------------------------------- 2. materials
def wax_material():
    """Beeswax: pale yellow rims, honey-stained golden walls, ivory cappings; soft, strongly
    scattering (walls glow when back-lit); matte-satin, glossy only where honey has smeared it."""
    m = C.Mat('beeswax', sss_method='BURLEY')
    P = m.coords('Object')
    cap, rim, dep, wet = m.attr('cap'), m.attr('rim'), m.attr('dep'), m.attr('wet')
    n1 = m.noise(scale=170, detail=3, roughness=0.6, vector=P)
    n2 = m.noise(scale=1500, detail=3, roughness=0.6, vector=P)
    rimc = m.mix((0.52, 0.30, 0.050), (0.66, 0.44, 0.105), m.map_range(n1, 0.3, 0.7))
    col = m.mix(rimc, (0.44, 0.205, 0.024), m.map_range(dep, 0.04, 0.55, 0.0, 0.9, smooth=True))
    col = m.hsv(col, 0.5, 1.0, m.map_range(m.attr('crnd'), 0, 1, 0.88, 1.08))
    capc = m.mix((0.62, 0.50, 0.27), (0.74, 0.65, 0.43), m.map_range(n1, 0.3, 0.7))
    capc = m.mix(capc, (0.66, 0.47, 0.20), m.map_range(m.noise(scale=420, detail=2, vector=P), 0.52, 0.78, 0.0, 0.55))   # damp, honey-touched lids
    col = m.mix(col, capc, cap)
    stain = m.map_range(m.noise(scale=38, detail=2, vector=P), 0.52, 0.78, 0.0, 0.50, smooth=True)   # older, darker comb
    col = m.mix(col, (0.33, 0.165, 0.030), stain)
    col = m.hsv(col, 0.5, 1.0, m.map_range(n2, 0.3, 0.7, 0.90, 1.07))
    rough = m.map_range(n2, 0.3, 0.7, 0.36, 0.58)
    rough = m.mixf(rough, 0.10, m.math('MULTIPLY', wet, 0.9))
    nrm = m.bump(n2, strength=0.45, distance=0.00004)
    nrm = m.micro_bump(scale=6500, strength=0.4, distance=0.00002, vector=P, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.44, specular=0.5, sss=0.70, sss_radius=(1.0, 0.45, 0.15),
          sss_scale=0.0016, sss_anisotropy=0.2, coat=m.math('MULTIPLY', wet, 0.85), coat_roughness=0.03,
          coat_ior=1.49, normal=nrm)
    return m


def honey_material():
    """Clear golden-amber honey: smooth dielectric (n = 1.49) + absorbing volume.  Transmittance over
    5 mm ~ (0.86, 0.46, 0.07): shallow honey is gold, a full cell deep amber.  Shadow rays pass
    straight through (the volume still tints them) so the wax under the honey is lit."""
    mat = bpy.data.materials.new('honey')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    glass = nt.nodes.new('ShaderNodeBsdfGlass')
    glass.inputs['Roughness'].default_value = 0.0
    glass.inputs['IOR'].default_value = 1.49
    glass.inputs['Color'].default_value = (1, 1, 1, 1)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    tr.inputs['Color'].default_value = (0.94, 0.94, 0.94, 1)
    lp = nt.nodes.new('ShaderNodeLightPath')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Shadow Ray'], mix.inputs[0])
    nt.links.new(glass.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    vol = nt.nodes.new('ShaderNodeVolumeAbsorption')
    vol.inputs['Color'].default_value = (0.955, 0.760, 0.200, 1)
    vol.inputs['Density'].default_value = 650.0
    nt.links.new(vol.outputs[0], out.inputs['Volume'])
    return mat


def _honey_faces(f, zw, zh, margin=0.00030):
    """Keep only the honey quads that are not buried under the wax."""
    vis = zh > zw - margin
    keep = vis[f].any(1)
    f = f[keep]
    used = np.zeros(len(zw), bool)
    used[f.ravel()] = True
    remap = np.cumsum(used) - 1
    return used, remap[f]


# ----------------------------------------------------------------------------- 4. loose items
def make_piece(seed, wax, honey, cell=0.00009):
    """One knife-cut chunk of comb honey lying flat (z = 0 .. ~12 mm), origin at the footprint centre."""
    rng = np.random.default_rng(500 + seed)
    a, b = rng.uniform(0.015, 0.020), rng.uniform(0.011, 0.015)       # half sizes
    T = rng.uniform(0.0105, 0.0135)
    nx, ny = int(2 * (a + 0.002) / cell), int(2 * (b + 0.002) / cell)
    U, V = np.meshgrid(np.linspace(-a - 0.002, a + 0.002, nx), np.linspace(-b - 0.002, b + 0.002, ny))
    u, v = U.ravel(), V.ravel()
    ang = rng.uniform(0, math.pi)
    ur, vr = u * math.cos(ang) - v * math.sin(ang) + rng.uniform(0, 0.01), u * math.sin(ang) + v * math.cos(ang)
    fld = comb_fields(ur, vr, seed=40 + seed, cap_frac=rng.choice([0.0, 0.15, 0.4]), empty_frac=0.05)
    # outline: a rough quadrilateral cut, corners a little crushed
    P = np.stack([u, v, np.zeros_like(u)], -1)
    sk = rng.normal(0, 0.10, 4)
    d = np.minimum(np.minimum(a - u + sk[0] * v, a + u + sk[1] * v), np.minimum(b - v + sk[2] * u, b + v + sk[3] * u))
    d = d + 0.0006 * C.fbm3(P * 120.0, 2, seed=seed + 3) - 0.0012
    ins = C.smoothstep(0.0, 0.0005, d)
    zw = ins * (T + fld['zw'] * C.smoothstep(0.0002, 0.0012, d))
    zh = T + fld['zh']
    f = C.grid_faces(ny, nx, wrap_v=False)
    fw = f[(d[f] > -0.0004).any(1)]
    usedh, fh = _honey_faces(f[(d[f] > 0.0009).all(1)], zw, zh)
    vw = np.stack([u, v, zw], -1)
    vh = np.stack([u, v, zh], -1)[usedh]
    usedw = np.zeros(len(u), bool)
    usedw[fw.ravel()] = True
    remap = np.cumsum(usedw) - 1
    verts, faces, fmat = C.merge_meshes([(vw[usedw], remap[fw], 0), (vh, fh, 1)])
    attrs = {}
    for k, val in fld['attrs'].items():
        if k == 'dep':                                       # the cut sides are honey-soaked wax
            val = np.maximum(val, (1.0 - C.smoothstep(0.0003, 0.0012, d)) * 0.8)
        attrs[k] = np.concatenate([val[usedw], np.zeros(len(vh), np.float32)])
    ob = C.mesh_from_arrays('fengmi_item_%d' % seed, verts, faces, attrs=attrs, materials=[wax, honey], face_mat=fmat)
    return ob, float(np.hypot(u[usedw], v[usedw]).max()), float(0.5 * (T + 0.0003))


def make_items(seed=0, n=5):
    """Loose items for the flat-lay version: small cut chunks of comb honey (巢蜜块).
    -> dict(objects, footprint_r [m], half_height [m], name)."""
    wax, honey = wax_material(), honey_material()
    objs, fr, hh = [], [], []
    for i in range(n):
        ob, r, h = make_piece(seed * 13 + i, wax, honey)
        objs.append(ob)
        fr.append(r)
        hh.append(h)
    return dict(objects=objs, footprint_r=fr, half_height=hh, name=NAME)


# ----------------------------------------------------------------------------- 3. scene
def main():
    args = C.parse_args()
    C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    sc = bpy.context.scene
    sc.cycles.transmission_bounces = 6
    sc.cycles.glossy_bounces = 3
    sc.cycles.diffuse_bounces = 2
    sc.cycles.max_bounces = 8
    R = R_DOME
    sol = C.planet_solve(R, lens_mm=85, apex=0.54, edge=0.68)
    n_max = 1500 if sc.render.resolution_x > 2000 else 1000
    v0, f, nrm, (ny, nx) = C.patch_grid(sol['patch'], R=R, n_max=n_max)
    # comb plane coordinates (azimuthal equidistant about the pole): no stretching of the lattice
    th = np.arccos(np.clip(v0[:, 2] / R, -1, 1))
    ph = np.arctan2(v0[:, 1], v0[:, 0])
    u, v = R * th * np.cos(ph), R * th * np.sin(ph)
    flow = [(R * x_, R * y_, R * w_) for x_, y_, w_ in ((-0.21, 0.34, 0.050), (-0.105, 0.085, 0.056), (-0.005, -0.075, 0.064),
                                                         (0.060, -0.195, 0.072), (0.088, -0.262, 0.070))]
    fld = comb_fields(u, v, seed=args.seed, flow=flow, cap_at=(0.235 * R, -0.10 * R, 0.10 * R),
                      empty_at=(-0.22 * R, -0.21 * R, 0.055 * R))
    print('[comb] patch %s  grid %dx%d  cell %.3f mm' % (np.round(sol['patch'], 3), nx, ny, 1000 * (sol['patch'][1] - sol['patch'][0]) / (nx - 1)))
    C.mesh_from_arrays('comb', nrm * (R + fld['zw'])[:, None], f, attrs=fld['attrs'], material=wax_material())
    used, fh = _honey_faces(f, fld['zw'], fld['zh'])
    C.mesh_from_arrays('honey', (nrm * (R + fld['zh'])[:, None])[used], fh, material=honey_material())
    C.dome_base(R - DEPTH - 0.0045, C.simple_material('under', (0.10, 0.045, 0.008), 0.8))

    cam, info = C.planet_camera(R + 0.0005, lens_mm=85, apex=0.54, edge=0.68)
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    # back light is the point: honey and thin wax walls glow; the key box also draws the long
    # highlight along the bulging honey tongue
    C.studio_lights(info, tint=(1.0, 0.90, 0.74), key=0.70, fill=0.40, rim=1.3, world=0.8, key_size=0.6, key_el=38)
    # tall dim panel straight behind: every honey surface mirrors a piece of it (liquid sheen), and
    # it is extra back light for the glow
    sc_w = info['scale']
    T = np.array(info['target'], float)
    el = math.radians(35.0)
    panel = C._area_light('sheen', T + 2.6 * sc_w * np.array([0.10, math.cos(el), math.sin(el)]), T, 2.4 * sc_w,
                          60.0 * sc_w ** 2, (1.0, 0.93, 0.80), shape='RECTANGLE')

    C.render(args)
    if not args.region:
        C.check_framing(args.out)
    comp = args.comp or os.path.join(C.PREVIEW_DIR, SHOT + ('_comp.jpg' if args.quality == 'final'
                                                              else '_%s_comp.jpg' % args.quality))
    C.quick_comp(args.out, SHOT, comp, crop=args.region, text=not args.region)
    print('[comp]', comp)


if __name__ == '__main__':
    main()
