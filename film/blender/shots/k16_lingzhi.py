# -*- coding: utf-8 -*-
"""k16_lingzhi - lingzhi / reishi cap (灵芝, Ganoderma lucidum), kind = surface: a macro across the
lacquered top of the cap towards its far margin, which is the horizon arc.

    python k16_lingzhi.py --quality preview --out /tmp/x.png
    python k16_lingzhi.py --quality draft --res 3840x2160 --spp 24 --region 0.38,0.50,0.62,0.75   # final-density crop
    python k16_lingzhi.py --quality final --out film/renders/k16_lingzhi.png

The cap is described in polar coordinates about its growth centre (the stem side, towards the
camera): arc-length radius rho, azimuth phi.  cap_points() turns (rho, phi) into the real surface:
gently domed top, concentric growth zones (broad rounded ridges, narrow furrows, fine striae) that
wobble and follow the wavy margin, fine radial wrinkles, lumps, dents, and the thick rounded
margin roll (rho beyond the shoulder is wrapped around a quarter-torus).  The hero uses a dense
cartesian patch of only what the camera sees; make_items() uses the same function on a polar grid
to build small whole kidney-shaped caps with a lateral stem.
Colour bands by normalised radius: mahogany -> red-brown -> red -> orange -> ochre -> cream margin;
lacquer = glossy coat, killed by matte cocoa spore powder (patches + furrows) and on the matte
growing edge.
"""
import os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _botanicals import C, rot, merge_parts, settle, finish                            # noqa: E402

SHOT = 'k16_lingzhi'
SEED = 3
R_CAP = 0.080             # growth centre -> outer margin (m): a 15 cm fan-shaped cap
MARGIN = 0.0062           # radius of the rounded margin roll (margin ~12 mm thick)
H_DOME = 0.004            # rise of the cap towards its centre
ELEV = 30.0               # camera elevation over the cap plane
SKY_TINT = (1.0, 0.93, 0.86)   # black starry sky, warm stars


# ----------------------------------------------------------------------------- 1. geometry
def relief(x, y, rho, phi, a, seed):
    """Height (m) of the crust above the smooth cap + masks, from planar coords (x, y), arc radius
    rho, azimuth phi and local shoulder radius a."""
    z0 = np.zeros_like(rho)
    q2 = np.stack([x, y, z0 + seed * 0.37], -1)
    wob = 0.0013 * C.fbm3(q2 / 0.022, 3, seed=seed + 1) + 0.0004 * C.fbm3(q2 / 0.006 + 5.0, 2, seed=seed + 2)
    ww = rho * (np.mean(a) / a) + wob                           # ring coordinate: follows the margin, wobbles

    def ring(per, off, sd):
        return C.perlin3(np.stack([ww / per + off, z0 + 0.37 * sd, z0 + 1.3], -1), seed + sd)

    n1, n2, n3 = ring(0.0085, 0.0, 11), ring(0.0026, 3.3, 12), ring(0.00052, 7.7, 13)
    fur1 = (n1 ** 2 + 0.004) ** 0.30                             # broad rounded ridges, soft-bottomed furrows
    fur2 = (n2 ** 2 + 0.006) ** 0.32
    knob = 0.55 + 0.9 * np.clip(0.5 + C.fbm3(q2 / 0.0075 + 13.0, 3, seed=seed + 17), 0, 1)   # ridges swell and fade along their length
    u = rho / a
    env = 0.55 + 0.45 * C.smoothstep(0.2, 0.9, u)
    arc = phi * a + 0.0016 * C.fbm3(q2 / 0.011 + 31.0, 3, seed=seed + 18)
    rw = np.abs(C.perlin3(np.stack([arc / 0.0015, rho / 0.011, z0 + seed * 0.71], -1), seed + 14)) ** 0.7
    rw_env = 0.25 + 0.75 * C.smoothstep(0.35, 0.85, u)
    lump = C.fbm3(q2 / 0.03 + 9.0, 3, seed=seed + 15)
    h = (0.00195 * (fur1 - 0.62) * env * knob + 0.00048 * (fur2 - 0.6) * knob + 0.000018 * n3
         + 0.000045 * (rw - 0.5) * rw_env + 0.0010 * lump)
    furrow = np.clip(np.clip(1 - (fur1 - 0.19) / 0.40, 0, 1) * 0.8 + np.clip(1 - (fur2 - 0.19) / 0.35, 0, 1) * 0.4, 0, 1)
    zone = 0.5 + 0.5 * ring(0.0085, 40.0, 16)
    return h, furrow, rw, zone


def cap_points(rho, phi, a, margin, seed, H0, theta_max=2.0, n_dents=7, dent_sector=(0.0, 6.283)):
    """(rho, phi) -> surface points P (..., 3) and shader attrs.  a = shoulder radius (where the
    margin roll starts) for each phi; rho > a is wrapped around the roll (theta = (rho - a) / margin)."""
    x0, y0 = rho * np.cos(phi), rho * np.sin(phi)
    h, furrow, rw, zone = relief(x0, y0, rho, phi, a, seed)
    rng = np.random.default_rng(seed + 77)
    dent = np.zeros_like(rho)
    for _ in range(n_dents):
        rd, pd = rng.uniform(0.40, 0.90) * float(np.mean(a)), rng.uniform(*dent_sector)
        r_d = rng.uniform(0.0011, 0.0028)
        g = np.exp(-((x0 - rd * math.cos(pd)) ** 2 + (y0 - rd * math.sin(pd)) ** 2) / r_d ** 2)
        dent += g * rng.uniform(0.5, 1.0)
        h = h - rng.uniform(0.00025, 0.0006) * g
    u = rho / a
    th = np.clip((rho - a) / margin, 0.0, theta_max)
    rp = np.where(rho <= a, rho, a + margin * np.sin(th))
    zb = H0 * (1 - np.minimum(u, 1.0) ** 2) - margin * (1 - np.cos(th))
    fade = 1.0 - 0.7 * C.smoothstep(0.6, 1.8, th)
    N0 = np.stack([np.sin(th) * np.cos(phi), np.sin(th) * np.sin(phi), np.cos(th)], -1)
    P = np.stack([rp * np.cos(phi), rp * np.sin(phi), zb], -1) + N0 * (h * fade)[..., None]
    q2 = np.stack([x0, y0, np.zeros_like(x0) + seed * 0.37], -1)
    pw = (C.smoothstep(0.0, 0.35, C.fbm3(q2 / 0.018 + 20.0, 4, seed=seed + 21) + 0.20 * furrow - 0.16)
          * (1 - C.smoothstep(0.84, 0.93, u)))
    attrs = dict(lz=np.stack([u, furrow, rw], -1), lp=np.stack([pw, np.clip(dent, 0, 1), zone], -1))
    return P, attrs


def a_hero(phi, seed):
    pp = np.stack([phi * 2.2, np.zeros_like(phi) + seed * 0.3, np.zeros_like(phi)], -1)
    return (R_CAP - MARGIN) * (1 + 0.016 * C.perlin3(pp, seed + 31) + 0.007 * C.perlin3(pp * 3.3 + 5.0, seed + 32))


# ----------------------------------------------------------------------------- 2. materials
def cap_material():
    m = C.Mat('lz_cap')
    lz = m.node('ShaderNodeSeparateXYZ', {0: m.attr('lz', output='Vector')})
    u, fur, rw = lz.outputs[0], lz.outputs[1], lz.outputs[2]
    lp = m.node('ShaderNodeSeparateXYZ', {0: m.attr('lp', output='Vector')})
    pw, dent, zone = lp.outputs[0], lp.outputs[1], lp.outputs[2]
    P = m.coords('Object')
    jn = m.noise(scale=60, detail=3, roughness=0.55, vector=P)
    uu = m.math('ADD', u, m.map_range(jn, 0.3, 0.7, -0.035, 0.035))
    col = m.ramp(uu, [(0.40, (0.036, 0.008, 0.007)), (0.60, (0.070, 0.012, 0.007)), (0.76, (0.185, 0.028, 0.008)),
                      (0.86, (0.42, 0.105, 0.013)), (0.925, (0.60, 0.29, 0.05)), (0.975, (0.74, 0.59, 0.32))])
    col = m.mix(col, (0.52, 0.42, 0.40), m.map_range(zone, 0.30, 0.72, smooth=True), blend='MULTIPLY')      # zone to zone
    col = m.mix(col, (0.45, 0.38, 0.36), m.math('MULTIPLY', fur, 0.85), blend='MULTIPLY')      # furrows darker
    col = m.mix(col, (0.90, 0.87, 0.86), m.map_range(rw, 0.55, 0.15), blend='MULTIPLY')        # radial streaks
    mot = m.noise(scale=260, detail=4, roughness=0.6, vector=P)
    col = m.mix(col, (0.75, 0.70, 0.66), m.map_range(mot, 0.45, 0.75), blend='MULTIPLY')
    # spore powder: matte cocoa dust in patches and furrows, speckled edges
    speck = m.noise(scale=2600, detail=2, roughness=0.6, vector=P)
    cloud = m.noise(scale=150, detail=5, roughness=0.65, vector=P)
    pw2 = m.math('MULTIPLY', m.math('POWER', pw, 1.6), m.math('MULTIPLY', m.map_range(cloud, 0.25, 0.75, 0.35, 1.0),
                                                           m.map_range(speck, 0.2, 0.8, 0.55, 1.0)), clamp=True)
    pw2 = m.math('MULTIPLY', pw2, 0.75)
    col = m.mix(col, (0.062, 0.032, 0.018), m.math('MULTIPLY', pw2, 0.85))
    matte = m.map_range(uu, 0.895, 0.965, smooth=True)                                          # growing edge is not lacquered
    rn = m.noise(scale=420, detail=4, roughness=0.6, vector=P)
    scr = m.noise(scale=1.0, detail=2, roughness=0.5, vector=m.mapping(P, scale=(60.0, 2600.0, 60.0), rotation=(0, 0, 0.5)))
    rough = m.map_range(rn, 0.3, 0.7, 0.34, 0.52)
    rough = m.mixf(rough, 0.62, matte)
    rough = m.mixf(rough, 0.88, pw2)
    coat = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, pw2), m.math('SUBTRACT', 1.0, m.math('MULTIPLY', matte, 0.9)), clamp=True)
    coat = m.math('MULTIPLY', coat, m.map_range(dent, 0.3, 0.9, 1.0, 0.45))
    crough = m.math('ADD', m.map_range(rn, 0.3, 0.7, 0.055, 0.15), m.map_range(scr, 0.62, 0.80, 0.0, 0.12))
    crough = m.mixf(crough, 0.6, pw2)
    nrm = m.bump(m.noise(scale=1700, detail=3, roughness=0.6, vector=P), strength=0.45, distance=0.00006)
    nrm = m.bump(m.noise(scale=7000, detail=2, roughness=0.6, vector=P), strength=m.mixf(0.15, 0.7, pw2),
                 distance=0.00003, normal=nrm)
    m.set(base_color=col, roughness=rough, ior=1.5, specular=0.20, coat=coat, coat_roughness=crough, normal=nrm)
    return m


def pore_material():
    """Underside of the cap (pore surface): matte cream-buff with tiny pores."""
    m = C.Mat('lz_pore')
    P = m.coords('Object')
    n = m.noise(scale=90, detail=4, roughness=0.6, vector=P)
    v = m.voronoi(scale=4200, feature='F1', vector=P)
    col = m.mix((0.50, 0.38, 0.22), (0.30, 0.19, 0.10), m.map_range(n, 0.35, 0.75))
    col = m.mix(col, (0.10, 0.06, 0.03), m.map_range(v, 0.0, 0.25, 0.7, 0.0))
    m.set(base_color=col, roughness=0.85, specular=0.2, normal=m.bump(v, 0.6, 0.00006))
    return m


# ----------------------------------------------------------------------------- loose items (flat-lay)
def make_cap(seed, nr=250, nphi=520):
    """A small whole kidney-shaped cap with a lateral stem, top up.  Returns dict(verts, faces, face_mat, attrs)."""
    rng = np.random.default_rng(4100 + seed)
    A = rng.uniform(0.026, 0.040)                                  # shoulder radius on the far side
    mg = rng.uniform(0.0034, 0.0048)
    H0 = rng.uniform(0.002, 0.005)
    ph = np.linspace(-math.pi, math.pi, nphi, endpoint=False)[None, :]          # phi = +-pi : stem side
    pp = np.stack([np.cos(ph) * 1.6, np.sin(ph) * 1.6, np.zeros_like(ph) + seed], -1)
    a = A * (0.34 + 0.66 * ((1 + np.cos(ph)) / 2) ** 0.6) * (1 + 0.05 * C.perlin3(pp, seed + 3))
    t = np.linspace(0.0, 1.0, nr)[:, None]
    rho = np.maximum(t * (a + math.pi * mg), 1e-6)
    PH = np.broadcast_to(ph, rho.shape)
    AA = np.broadcast_to(a, rho.shape)
    P, at = cap_points(rho, PH, AA, mg, 50 + seed, H0, theta_max=math.pi, n_dents=4)
    parts = [(P.reshape(-1, 3), C.grid_faces(nr, nphi, wrap_v=True), 0,
              dict(lz=at['lz'].reshape(-1, 3), lp=at['lp'].reshape(-1, 3)))]
    # underside (pore surface): from the end of the roll inwards
    tu = np.linspace(1.0, 0.0, 36)[:, None]
    ru = tu * a
    zu = -2 * mg - 0.25 * mg * (1 - tu ** 2) + 0 * ru
    U = np.stack([ru * np.cos(ph), ru * np.sin(ph), zu], -1)
    parts.append((U.reshape(-1, 3), C.grid_faces(36, nphi, wrap_v=True), 1, {}))
    # lateral stem, lacquered dark
    r0 = float(a[0, 0])
    ln = rng.uniform(0.022, 0.040)
    tt = np.linspace(0, 1, 26)[:, None]
    path = (np.array([-r0 * 0.75, 0.0, -mg]) + tt * ln * np.array([-1.0, rng.normal(0, 0.15), rng.normal(-0.05, 0.08)])
            + tt ** 2 * ln * np.array([0.0, rng.normal(0, 0.12), -0.10]))
    sr = rng.uniform(0.0042, 0.0058) * (1.0 + 0.25 * np.sin(tt[:, 0] * 9 + seed) * 0.3 - 0.15 * tt[:, 0])
    sr[-1] *= 0.6
    sv, sf = C.tube(path, sr, nv=40)
    sv = sv + 0.0006 * np.stack([C.fbm3(sv / 0.006, 3, seed=seed + 5), C.fbm3(sv / 0.006 + 4.0, 3, seed=seed + 6),
                                 C.fbm3(sv / 0.006 + 8.0, 3, seed=seed + 7)], 1)
    parts.append((sv, sf, 0, dict(lz=np.tile([0.30, 0.2, 0.5], (len(sv), 1)), lp=np.tile([0.15, 0.0, 0.5], (len(sv), 1)))))
    verts, faces, fm, attrs = merge_parts(parts)
    return dict(verts=verts, faces=faces, face_mat=fm, attrs=attrs)


def make_items(seed=0):
    """4 small whole lingzhi (cap + lateral stem) lying cap-up, lowest point on z = 0."""
    mats = [cap_material(), pore_material()]
    rng = np.random.default_rng(700 + seed)
    objs, foot, hh = [], [], []
    for i in range(4):
        h = make_cap(seed * 100 + i)
        v, fr, hz = settle(h['verts'], rot(2, rng.uniform(0, 2 * math.pi)) @ rot(0, rng.normal(0, 0.05)))
        objs.append(C.mesh_from_arrays('lingzhi_item_%d' % i, v, h['faces'], attrs=h['attrs'], materials=mats,
                                       face_mat=h['face_mat']))
        foot.append(fr)
        hh.append(hz)
    return dict(objects=objs, footprint_r=foot, half_height=hh, name='灵芝')


# ----------------------------------------------------------------------------- hero scene
def main():
    args = C.parse_args(seed=SEED)
    sc = C.setup_scene(args, look='AgX - Punchy', exposure=0.0)
    hi = sc.render.resolution_x >= 2500
    e = math.radians(ELEV)
    r_sil = R_CAP - MARGIN + MARGIN * math.sin(e)                 # silhouette circle on the margin roll
    zc = -MARGIN * (1 - math.cos(e)) + 0.0005
    sol = C.disc_solve(r_sil, elevation_deg=ELEV, apex=0.54, center=(0, 0, zc))
    xmin, xmax, ymin, ymax = sol['patch']
    ext = (xmin * 1.08, xmax * 1.08, ymin - 0.012, R_CAP + MARGIN * 1.1)
    v, f, _, (ny, nx) = C.patch_grid(ext, R=None, n_max=1750 if hi else 850)
    rho = np.maximum(np.hypot(v[:, 0], v[:, 1]), 1e-6)
    phi = np.arctan2(v[:, 1], v[:, 0])
    P, attrs = cap_points(rho, phi, a_hero(phi, args.seed), MARGIN, args.seed, H_DOME,
                          n_dents=6, dent_sector=(math.pi / 2 - 0.55, math.pi / 2 + 0.55))
    C.mesh_from_arrays('cap', P, f, attrs=attrs, material=cap_material())
    print('[cap] %d x %d verts, cell %.3f mm' % (nx, ny, 1000 * (ext[1] - ext[0]) / (nx - 1)))

    cam, info = C.disc_camera(r_sil, elevation_deg=ELEV, apex=0.54, center=(0, 0, zc))
    C.auto_dof(cam, info, near_blur_px=7, far_blur_px=3)
    C.studio_lights(info, tint=SKY_TINT, key=1.0, fill=0.65, rim=0.9, world=0.35, key_az=-52, key_el=44, key_size=1.2)
    finish(args, SHOT)


if __name__ == '__main__':
    main()
