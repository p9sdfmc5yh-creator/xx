# -*- coding: utf-8 -*-
"""flatlay.py - VERSION B scene builder: top-down "specimen plate" stills of the ingredients.

    PY=/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad/bvenv/bin/python
    $PY flatlay.py --shot b17 --quality draft|preview|final --out PATH [--threads N] [--region x0,y0,x1,y1]
                   [--res WxH] [--items SHOT_ID[,SHOT_ID..]] [--width M] [--empty] [--plan PNG] [--jpg JPG]

One generic builder for every scene of film/shots_b.json (see README_B.md):

  * the ingredient module (film/blender/shots/<id>.py) is imported by file path and asked for
    make_items(seed) -> dict(objects, footprint_r, half_height, name [, weights, inst_attrs, flip_prob]);
  * a LAYOUT ('wreath' | 'glyph' | 'landing' | 'taiji' | 'dishes' | 'bespoke') turns the frame into item
    positions, a drop-and-settle pass (`settle`) stacks them on a height field using point-cloud
    proxies sampled from the real meshes (no interpenetration, items tilt onto their neighbours);
  * common.instance_on_points instances the variants (per-instance random / attributes keep working);
  * a GROUND with real material response (handmade paper +- printed grid, slate, walnut, linen);
  * camera straight down, 135 mm, everything in focus; one large soft window from the upper-left;
    OPAQUE 16-bit PNG (+ depth .npy at final quality) + <out>_layout.json describing what was built.

World: metres, +Z up towards the camera, picture x = world +X (right), picture up = world +Y, the
ground is z = 0 and the frame centre is the origin.  Frame fractions (u, v) are measured from the
TOP-LEFT like every other tool of the film: x = (u - 0.5) * W, y = (0.5 - v) * H.
"""
import os
import sys
import math
import json
import time
import argparse
import importlib.util

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C                                                              # noqa: E402
import glyph_layout as G                                                        # noqa: E402
import bpy                                                                      # noqa: E402
import cv2                                                                      # noqa: E402
from scipy import ndimage as ndi                                                # noqa: E402
from scipy.spatial import cKDTree                                               # noqa: E402

SHOTS_B_JSON = os.path.join(C.FILM_DIR, 'shots_b.json')
SHOT_DIR = os.path.join(HERE, 'shots')
TMP_DIR = os.path.join(C.SCRATCH, 'tmp_flatlay')
ASPECT = 16.0 / 9.0
LENS_MM = 135.0

# AgX 'Punchy' tone curve measured with an emission chart (scene-linear -> display, sRGB encoded).
_LUT_LIN = np.array([0.0, 0.0025, 0.005, 0.01, 0.02, 0.04, 0.08, 0.12, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.4, 2.0, 3.0, 4.5, 7.0])
_LUT_DISP = np.array([0.0, 0.0023, 0.0039, 0.01, 0.0395, 0.1086, 0.2034, 0.271, 0.3463, 0.4129, 0.4865, 0.5632,
                      0.6296, 0.6923, 0.7449, 0.7938, 0.8422, 0.885, 0.93])
VEIL = 0.012           # scene-linear light a dark matte ground reflects besides its diffuse colour (measured)
LIGHT_E = 2.0          # scene-linear value of a white diffuse card at the frame centre under the rig (exposure 0)


def albedo_for_display(srgb255, exposure=0.0):
    """Albedo (linear RGB) that renders as the given DISPLAY colour (sRGB 0-255) on a flat matte
    ground under the flat-lay rig with AgX Punchy at the given exposure (stops).  Per-channel
    inversion of the measured tone curve (good to a few % for the muted paper colours used here)."""
    d = np.clip(np.asarray(srgb255, float) / 255.0, 0.0, 0.93)
    lin = np.interp(d, _LUT_DISP, _LUT_LIN) * 2.0 ** (-exposure)
    lin = np.maximum(lin - VEIL, 0.25 * lin)                         # the paper's own sheen / specular adds ~VEIL
    return np.clip(lin / LIGHT_E, 0.0005, 0.92)


# ============================================================================= shot table
def load_table():
    with open(SHOTS_B_JSON, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_shot_b(shot):
    """'b17' or 'b17_guiyuan' -> scene dict of shots_b.json (defaults merged in)."""
    tab = load_table()
    for sc in tab['scenes']:
        if sc['id'] == shot or sc['id'].split('_')[0] == shot:
            out = dict(tab.get('defaults', {}))
            out.update(sc)
            return out
    raise SystemExit('unknown B shot %r (see %s)' % (shot, SHOTS_B_JSON))


# ============================================================================= frame
class Frame(object):
    """Physical frame on the ground plane: W x H metres, centred on the origin."""

    def __init__(self, width_m, aspect=ASPECT, lens_mm=LENS_MM):
        self.W = float(width_m)
        self.H = self.W / aspect
        self.lens = float(lens_mm)
        self.D = self.W * self.lens / C.SENSOR_MM            # camera height above the ground

    def xy(self, u, v):
        return (np.asarray(u, float) - 0.5) * self.W, (0.5 - np.asarray(v, float)) * self.H

    def uv(self, x, y):
        return np.asarray(x, float) / self.W + 0.5, 0.5 - np.asarray(y, float) / self.H

    def extent(self, margin=0.0):
        return (-self.W / 2 - margin, self.W / 2 + margin, -self.H / 2 - margin, self.H / 2 + margin)


# ============================================================================= ingredient modules
def _import_shot_module(shot_id):
    path = os.path.join(SHOT_DIR, shot_id + '.py')
    if not os.path.exists(path):
        raise SystemExit('ingredient module %s does not exist yet - use --items <existing id> as a stand-in' % path)
    spec = importlib.util.spec_from_file_location('ysty_items_' + shot_id, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not hasattr(mod, 'make_items'):
        raise SystemExit('%s has no make_items()' % path)
    return mod


def _rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def _rot_vec(rx, ry):
    """Rotation matrix of the rotation vector (rx, ry, 0) (a tilt: axis in the ground plane)."""
    ang = math.hypot(rx, ry)
    if ang < 1e-9:
        return np.eye(3)
    ax, ay = rx / ang, ry / ang
    K = np.array([[0.0, 0.0, ay], [0.0, 0.0, -ax], [-ay, ax, 0.0]])
    return np.eye(3) + math.sin(ang) * K + (1.0 - math.cos(ang)) * (K @ K)


def _mesh_points(ob, n, rng):
    """n area-weighted random surface points of a mesh object (object-space, object transform applied)."""
    me = ob.data
    nv = len(me.vertices)
    co = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3).astype(np.float64)
    M = np.array(ob.matrix_basis)
    if not np.allclose(M, np.eye(4), atol=1e-9):
        co = co @ M[:3, :3].T + M[:3, 3]
    me.calc_loop_triangles()
    nt = len(me.loop_triangles)
    if nt == 0:
        return co, co
    tri = np.empty(nt * 3, np.int32)
    me.loop_triangles.foreach_get('vertices', tri)
    tri = tri.reshape(-1, 3)
    a, b, c = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    p = area / max(area.sum(), 1e-30)
    f = rng.choice(nt, size=n, p=p)
    r1, r2 = rng.random(n), rng.random(n)
    s1 = np.sqrt(r1)
    pts = (1 - s1)[:, None] * a[f] + (s1 * (1 - r2))[:, None] * b[f] + (s1 * r2)[:, None] * c[f]
    return pts, co


class ItemSet(object):
    """One ingredient: template objects + everything the layouts need to know about them.

      objects   K template mesh objects (natural resting pose, lowest point z = 0, origin = footprint centre)
      a, b, c   (K,) half length / half width of the top-down footprint along its principal axes, half height
      bp        (K,) packing half width: the ellipse (a, bp) has the footprint's real area (bp <= b)
      theta     (K,) angle of the footprint's long axis in the template's own XY (radians)
      clouds    K (n,3) surface point clouds = the collision proxies of the drop-and-settle pass
      com       (K,3) centroid of the cloud (tilts pivot about it)
      weights   (K,) variant probabilities;  inst_attrs {name: f(rng, n)} per-instance shader attributes
      L, Wd, T  typical (weighted median) length, width, thickness of one item in metres
    """

    def __init__(self, shot_id, seed=0, tag=None, scale=1.0):
        self.id = shot_id
        self.tag = tag or shot_id
        mod = _import_shot_module(shot_id)
        d = mod.make_items(seed=seed)
        self.objects = list(d['objects'])
        if not self.objects:
            raise SystemExit('%s.make_items() returned no loose items (bespoke scene?)' % shot_id)
        self.name = d.get('name', shot_id)
        K = len(self.objects)
        self.K = K
        self.user_scale = float(scale)
        w = np.asarray(d.get('weights', np.ones(K)), float)
        self.weights = w / w.sum()
        self.inst_attrs = d.get('inst_attrs', {}) or {}
        self.flip_prob = float(d.get('flip_prob', 0.0))
        self.footprint_r = np.asarray(d.get('footprint_r', np.zeros(K)), float) * scale
        self.half_height = np.asarray(d.get('half_height', np.zeros(K)), float) * scale
        rng = np.random.default_rng(4242 + seed)
        self.a, self.b, self.c, self.theta = np.zeros(K), np.zeros(K), np.zeros(K), np.zeros(K)
        self.bp = np.zeros(K)                                        # half width of the ellipse with the footprint's real area
        self.clouds, self.com = [], np.zeros((K, 3))
        for k, ob in enumerate(self.objects):
            pts, co = _mesh_points(ob, 6000, rng)
            pts, co = pts * scale, co * scale
            xy = pts[:, :2] - pts[:, :2].mean(0)
            ev, evec = np.linalg.eigh(np.cov(xy.T))
            ax = evec[:, 1]                                          # principal (long) axis of the footprint
            th = math.atan2(ax[1], ax[0])
            cs, sn = math.cos(-th), math.sin(-th)
            q = np.stack([xy[:, 0] * cs - xy[:, 1] * sn, xy[:, 0] * sn + xy[:, 1] * cs], 1)
            self.a[k] = 0.5 * (np.percentile(q[:, 0], 99.7) - np.percentile(q[:, 0], 0.3))
            self.b[k] = 0.5 * (np.percentile(q[:, 1], 99.7) - np.percentile(q[:, 1], 0.3))
            self.c[k] = 0.5 * float(co[:, 2].max() - min(co[:, 2].min(), 0.0))
            self.theta[k] = th
            cell = max(self.a[k], self.b[k]) / 24.0                  # real footprint area (the bounding ellipse is too fat
            gi = np.floor(q / cell).astype(int)                      # for spindles, crescents, stars ...)
            gi -= gi.min(0)
            occ = np.zeros(gi.max(0) + 1, bool)
            occ[gi[:, 0], gi[:, 1]] = True
            occ = ndi.binary_fill_holes(ndi.binary_closing(np.pad(occ, 2), iterations=2))
            self.bp[k] = min(self.b[k], float(occ.sum()) * cell * cell / (math.pi * self.a[k]))
            self.clouds.append(pts)
            self.com[k] = pts.mean(0)
        self.L = float(2 * self._wmedian(self.a))
        self.Wd = float(2 * self._wmedian(self.b))
        self.T = float(2 * self._wmedian(self.c))
        self.r_eff = float(np.sqrt(self._wmedian(self.a) * self._wmedian(self.b)))
        self.aspect = self.L / max(self.Wd, 1e-9)
        self.fullness = float(self._wmedian(self.bp / self.b))       # footprint area / bounding ellipse area
        print('[items] %s (%s): %d variants, L %.1f mm  W %.1f mm  T %.1f mm  aspect %.2f  fullness %.2f' % (
            shot_id, self.name, K, self.L * 1e3, self.Wd * 1e3, self.T * 1e3, self.aspect, self.fullness))

    def _wmedian(self, v):
        o = np.argsort(v)
        cw = np.cumsum(self.weights[o])
        return float(v[o][np.searchsorted(cw, 0.5 * cw[-1])])

    def proxies(self, res, max_pts=2400):
        """Thin the clouds to ~6 points per height-field cell of the footprint (cached per res)."""
        out = []
        for k in range(self.K):
            cells = (2 * self.a[k] / res) * (2 * self.b[k] / res)
            n = int(np.clip(7.0 * cells, 240, max_pts))
            out.append(self.clouds[k][:n])
        return out


# ============================================================================= sampling helpers
def fbm2(h, w, base_px, rng, octaves=4, gain=0.5):
    """Cheap 2-D fractal value noise (cubic-upsampled random grids), roughly N(0, 0.6), float32 (h, w)."""
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        cell = base_px / (2.0 ** o)
        if cell < 1.5:
            break
        gh, gw = int(h / cell) + 4, int(w / cell) + 4
        n = rng.standard_normal((gh, gw)).astype(np.float32)
        big = cv2.resize(n, (int(math.ceil(gw * cell)), int(math.ceil(gh * cell))), interpolation=cv2.INTER_CUBIC)
        oy, ox = int(rng.integers(0, int(cell) + 1)), int(rng.integers(0, int(cell) + 1))
        out += amp * big[oy:oy + h, ox:ox + w]
        tot += amp
        amp *= gain
    return out / max(tot, 1e-9)


class Field2(object):
    """A scalar raster over a world rectangle with bilinear lookup (density maps, masks)."""

    def __init__(self, arr, extent):
        self.a = np.asarray(arr, np.float32)
        self.xmin, self.xmax, self.ymin, self.ymax = extent
        self.h, self.w = self.a.shape

    def __call__(self, x, y):
        fx = (np.asarray(x, float) - self.xmin) / (self.xmax - self.xmin) * (self.w - 1)
        fy = (self.ymax - np.asarray(y, float)) / (self.ymax - self.ymin) * (self.h - 1)      # row 0 = top
        return ndi.map_coordinates(self.a, [fy, fx], order=1, mode='nearest')


# ============================================================================= placement container
class Placement(object):
    """Items to drop: arrays of length N.  `iset` indexes the list of ItemSets, `var` the variant
    inside its set, `order` the pouring pass (0 first), `fixed` = keep the given xy (no relaxation)."""

    FIELDS = ('x', 'y', 'yaw', 'iset', 'var', 'scale', 'order', 'stray', 'group')

    def __init__(self, n=0):
        self.x = np.zeros(n)
        self.y = np.zeros(n)
        self.yaw = np.zeros(n)
        self.iset = np.zeros(n, int)
        self.var = np.zeros(n, int)
        self.scale = np.ones(n)
        self.order = np.zeros(n, int)
        self.stray = np.zeros(n, bool)
        self.group = np.zeros(n, int)

    def __len__(self):
        return len(self.x)

    @staticmethod
    def cat(parts):
        out = Placement(0)
        for f in Placement.FIELDS:
            setattr(out, f, np.concatenate([getattr(p, f) for p in parts]) if parts else getattr(out, f))
        return out

    def take(self, sel):
        out = Placement(0)
        for f in Placement.FIELDS:
            setattr(out, f, getattr(self, f)[sel])
        return out


def _pick_variants(items, n, rng, size_jitter=0.07):
    var = rng.choice(items.K, size=n, p=items.weights)
    scale = np.clip(rng.normal(1.0, size_jitter, n), 1 - 2.2 * size_jitter, 1 + 2.2 * size_jitter)
    return var, scale


# ============================================================================= drop & settle
class HeightField(object):
    def __init__(self, extent, res, base=None):
        xmin, xmax, ymin, ymax = extent
        self.x0, self.y0, self.res = float(xmin), float(ymin), float(res)
        self.nx = int(math.ceil((xmax - xmin) / res)) + 2
        self.ny = int(math.ceil((ymax - ymin) / res)) + 2
        if self.nx * self.ny > 60e6:
            raise ValueError('height field %dx%d too large' % (self.nx, self.ny))
        self.H = np.zeros((self.ny, self.nx), np.float32)
        if base is not None:
            gx = self.x0 + (np.arange(self.nx) + 0.5) * res
            gy = self.y0 + (np.arange(self.ny) + 0.5) * res
            self.H[:] = base(*np.meshgrid(gx, gy))
        self.Hr = self.H.reshape(-1)

    def idx(self, x, y):
        ix = ((x - self.x0) / self.res).astype(np.intp)
        iy = ((y - self.y0) / self.res).astype(np.intp)
        np.clip(ix, 0, self.nx - 1, out=ix)
        np.clip(iy, 0, self.ny - 1, out=iy)
        return iy * self.nx + ix


def settle(place, sets, extent, rng, base=None, candidates=1, jitter=0.6, allowed=None, tilt=True,
           max_tilt_deg=38.0, sink=0.05, res=None, verbose=True):
    """Drop the items of `place` one after another (pass 0 first) onto a height field.

    Every item is represented by a point cloud sampled from its REAL mesh.  For a pose (position,
    yaw, tilt) the resting height is max(height_field - cloud_z): the item comes down until its
    first point touches.  Items that land on bare ground keep the template's own resting pose.
    Items that land on others (i) may try `candidates` nearby positions and keep the lowest
    ("roll into the hollow"; positions rejected by allowed(x, y) are skipped), then (ii) lower
    their centre of mass by tilting (pattern search over the two tilt angles, <= max_tilt) - a
    berry lying across another ends up with one end on the paper and the other on its neighbour.
    Finally the cloud is stamped into the height field (upper envelope).

    Returns dict(loc (N,3) template origin, rot (N,3,3), scale (N,), layer (N,), zc (N,), hf)."""
    N = len(place)
    cmin = min(float(s.c.min()) for s in sets)
    res = float(res or max(cmin / 2.2, (extent[1] - extent[0]) / 6000.0))
    hf = HeightField(extent, res, base)
    prox = [s.proxies(res) for s in sets]
    loc = np.zeros((N, 3))
    rot = np.zeros((N, 3, 3))
    layer = np.zeros(N, int)
    zcs = np.zeros(N)
    order = np.lexsort((rng.random(N), place.order))
    Hr = hf.Hr
    maxt = math.radians(max_tilt_deg)
    dirs = np.array([[1, 0], [-1, 0], [0, 1], [0, -1], [.7071, .7071], [-.7071, .7071], [.7071, -.7071], [-.7071, -.7071]])
    half = 0.5 * res
    offs = ((-half * 0.5, -half * 0.5), (half * 0.5, half * 0.5), (-half * 0.5, half * 0.5), (half * 0.5, -half * 0.5))
    t0 = time.time()
    n_tilt = 0
    for i in order:
        S = sets[place.iset[i]]
        k = place.var[i]
        s = place.scale[i]
        Rz = _rot_z(place.yaw[i])
        P0 = (prox[place.iset[i]][k] * s) @ Rz.T                 # yawed cloud, relative to the template origin
        c0 = Rz @ (S.com[k] * s)
        Pr = P0 - c0                                             # relative to the centre of mass
        zflat = -float(Pr[:, 2].min())                           # COM height when lying on bare ground
        x, y = place.x[i], place.y[i]
        # ---- (i) position: original first, then jittered candidates; keep the lowest
        best = None
        ncand = candidates if place.order[i] > 0 else 1
        jit = jitter * S.a[k] * s
        for j in range(max(1, ncand)):
            xj = x + (rng.uniform(-jit, jit) if j else 0.0)
            yj = y + (rng.uniform(-jit, jit) if j else 0.0)
            if j and allowed is not None and not allowed(xj, yj):
                continue
            zc = float(np.max(Hr[hf.idx(xj + c0[0] + Pr[:, 0], yj + c0[1] + Pr[:, 1])] - Pr[:, 2]))
            if best is None or zc < best[0] - 1e-6:
                best = (zc, xj, yj)
            if zc <= zflat + 1e-6:
                break
        zc, x, y = best
        cx, cy = x + c0[0], y + c0[1]
        Rt = np.eye(3)
        Pt = Pr
        if zc > zflat + 0.02 * S.c[k] * s:
            # ---- (ii) tilt: minimise the height of the centre of mass
            if tilt and (S.a[k] > 1.25 * S.c[k]):
                n_tilt += 1
                bt = np.zeros(2)
                step = math.radians(12.0)
                it = 0
                while step > math.radians(2.0) and it < 10:
                    it += 1
                    improved = False
                    for d in dirs:
                        t = bt + step * d
                        nt = math.hypot(t[0], t[1])
                        if nt > maxt:
                            t *= maxt / nt
                        R1 = _rot_vec(t[0], t[1])
                        P1 = Pr @ R1.T
                        z1 = float(np.max(Hr[hf.idx(cx + P1[:, 0], cy + P1[:, 1])] - P1[:, 2]))
                        if z1 < zc - 1e-5:
                            zc, bt, Rt, Pt, improved = z1, t, R1, P1, True
                    if not improved:
                        step *= 0.5
            zlow = -float(Pt[:, 2].min())
            zc = max(zc - sink * S.c[k] * s, zlow)
        else:
            zc = zflat
        # ---- stamp the upper envelope (4 sub-cell offsets close pinholes between samples)
        zt = (zc + Pt[:, 2]).astype(np.float32)
        px, py = cx + Pt[:, 0], cy + Pt[:, 1]
        for ox, oy in offs:
            np.maximum.at(Hr, hf.idx(px + ox, py + oy), zt)
        R = Rt @ Rz
        loc[i] = np.array([cx, cy, zc]) - Rt @ c0
        rot[i] = R
        zcs[i] = zc
        layer[i] = int(round((zc - zflat) / max(1.6 * S.c[k] * s, 1e-9)))
    if verbose:
        print('[settle] %d items, grid %dx%d @ %.2f mm, %d tilted, max layer %d, top %.1f mm, %.1f s' % (
            N, hf.nx, hf.ny, res * 1e3, n_tilt, int(layer.max()) if N else 0, float(hf.H.max()) * 1e3, time.time() - t0))
    return dict(loc=loc, rot=rot, scale=place.scale.copy(), layer=layer, zc=zcs, hf=hf)


# ============================================================================= layouts
def pack_select(x, y, ang, a, b, rng, k=0.92, n_fixed=0):
    """Random sequential packing of ORIENTED footprints.  Every footprint is a stadium (a row of discs
    of radius b along the long axis, half length a, direction ang).  Candidates are scanned in random
    order (the first n_fixed are already accepted and keep their place); one is kept unless it overlaps
    a kept one by more than (1 - k).  Vectorised: KD-tree pairs -> disc/disc test -> greedy rounds.
    Returns the kept indices (fixed ones first)."""
    n = len(x)
    if n == 0:
        return np.zeros(0, int)
    pr = np.concatenate([np.arange(n_fixed), n_fixed + rng.permutation(n - n_fixed)])
    X = np.stack([x, y], 1)[pr]
    A, B, ANG = np.asarray(a, float)[pr], np.asarray(b, float)[pr], np.asarray(ang, float)[pr]
    pairs = cKDTree(X).query_pairs(2.0 * float(A.max()) * k, output_type='ndarray')
    lo = hi = np.zeros(0, int)
    if len(pairs):
        pairs = pairs[~((pairs[:, 0] < n_fixed) & (pairs[:, 1] < n_fixed))]
        nd = int(np.clip(math.ceil(2.0 * float((A / B).max()) - 1.0), 1, 9))
        ts = np.linspace(-1.0, 1.0, nd) if nd > 1 else np.zeros(1)
        los, his = [], []
        for c0 in range(0, len(pairs), 400000):
            i, j = pairs[c0:c0 + 400000, 0], pairs[c0:c0 + 400000, 1]
            d = X[i] - X[j]
            m = np.hypot(d[:, 0], d[:, 1]) < (A[i] + A[j]) * k
            i, j, d = i[m], j[m], d[m]
            if nd > 1:
                ei = (A[i] - B[i])[:, None] * ts[None, :]
                ej = (A[j] - B[j])[:, None] * ts[None, :]
                dx = d[:, 0][:, None, None] + ei[:, :, None] * np.cos(ANG[i])[:, None, None] - ej[:, None, :] * np.cos(ANG[j])[:, None, None]
                dy = d[:, 1][:, None, None] + ei[:, :, None] * np.sin(ANG[i])[:, None, None] - ej[:, None, :] * np.sin(ANG[j])[:, None, None]
                dmin = np.sqrt((dx * dx + dy * dy).reshape(len(i), -1).min(1))
            else:
                dmin = np.hypot(d[:, 0], d[:, 1])
            cf = dmin < (B[i] + B[j]) * k
            los.append(np.minimum(i, j)[cf])
            his.append(np.maximum(i, j)[cf])
        lo, hi = np.concatenate(los), np.concatenate(his)
    state = np.zeros(n, np.int8)
    while True:
        und = state == 0
        if not und.any():
            break
        act = (state[lo] >= 0) & (state[hi] == 0)
        blocked = np.zeros(n, bool)
        blocked[hi[act]] = True
        new = und & ~blocked
        state[new] = 1
        kill = (state[lo] == 1) & (state[hi] == 0)
        state[hi[kill]] = -1
        if not new.any():
            break
    return np.sort(pr[state == 1])


def relax_pack(c, signed, rng, iters=140, k=0.96, edge=0.9, tol=0.0, dir_fn=None, align_w=0.04, rho_end=0.62,
               max_overlap=0.34, max_out=0.40, verbose=''):
    """Dense oriented packing by soft-particle relaxation ("pour, then pat into shape").

    c       candidate dict (x, y, ang, a, b, ...) thrown too densely into the region (they overlap).
    signed  signed(x, y) -> (distance to the region outline in metres, + inside; unit gradient gx, gy
            pointing inwards).  Discs are pushed back until they are inside by edge * radius - tol.
    Every footprint is a chain of discs (spindle: the end discs are rho_end x the waist radius).
    Overlapping discs push each other apart (force + torque), dir_fn(x, y) optionally keeps the long
    axis along a direction field.  Afterwards the worst offenders are removed until nothing overlaps
    by more than max_overlap x its half width or sticks out by more than max_out x its half width.
    Returns the surviving candidates (jammed coverage ~0.8 instead of ~0.55 for random dart throwing)."""
    x, y, ang = c['x'].astype(float).copy(), c['y'].astype(float).copy(), c['ang'].astype(float).copy()
    a, b = c['a'].astype(float), c['b'].astype(float)
    N = len(x)
    if N == 0:
        return c
    asp = float((a / b).max())
    nd = 1 if asp < 1.2 else int(np.clip(2 * math.ceil(asp) - 1, 3, 9))
    ts = np.linspace(-1.0, 1.0, nd) if nd > 1 else np.zeros(1)
    rj = b[:, None] * (1.0 - (1.0 - rho_end) * ts[None, :] ** 2)
    off = ts[None, :] * (a[:, None] - rj)
    amax = float(a.max())
    pairs = np.zeros((0, 2), int)

    def discs():
        ca, sa = np.cos(ang), np.sin(ang)
        return x[:, None] + off * ca[:, None], y[:, None] + off * sa[:, None], ca, sa

    def contacts(px, py, pairs):
        i, j = pairs[:, 0], pairs[:, 1]
        dx = px[i][:, :, None] - px[j][:, None, :]
        dy = py[i][:, :, None] - py[j][:, None, :]
        dist = np.sqrt(dx * dx + dy * dy) + 1e-12
        ov = np.clip((rj[i][:, :, None] + rj[j][:, None, :]) * k - dist, 0.0, None)
        return i, j, dx, dy, dist, ov

    for it in range(iters):
        px, py, ca, sa = discs()
        if it % 3 == 0:
            pairs = cKDTree(np.stack([x, y], 1)).query_pairs(2.05 * amax, output_type='ndarray')
        FX = np.zeros((N, nd))
        FY = np.zeros((N, nd))
        if len(pairs):
            i, j, dx, dy, dist, ov = contacts(px, py, pairs)
            fx, fy = 0.5 * ov * dx / dist, 0.5 * ov * dy / dist
            np.add.at(FX, i, fx.sum(2))
            np.add.at(FY, i, fy.sum(2))
            np.add.at(FX, j, -fx.sum(1))
            np.add.at(FY, j, -fy.sum(1))
        sd, gx, gy = signed(px, py)
        pen = np.clip(edge * rj - tol - sd, 0.0, None)
        FX += pen * gx
        FY += pen * gy
        step = 0.55 * (1.0 - 0.6 * it / iters)
        Fx, Fy = FX.sum(1), FY.sum(1)
        mag = np.hypot(Fx, Fy) + 1e-12
        lim = np.minimum(1.0, 0.45 * b / (step * mag))
        x += step * Fx * lim
        y += step * Fy * lim
        if nd > 1:
            tq = (off * ca[:, None] * FY - off * sa[:, None] * FX).sum(1) / (0.5 * a * a)
            if dir_fn is not None and align_w > 0:
                tq += align_w * np.sin(2.0 * (dir_fn(x, y) - ang))
            ang += np.clip(step * tq, -0.10, 0.10)
    # ---- remove the worst offenders
    alive = np.ones(N, bool)
    px, py, ca, sa = discs()
    sd, gx, gy = signed(px, py)
    out = (np.clip(edge * rj - tol - sd, 0.0, None) / b[:, None]).max(1)
    alive &= out <= max_out
    pairs = cKDTree(np.stack([x, y], 1)).query_pairs(2.05 * amax, output_type='ndarray')
    if len(pairs):
        i, j, dx, dy, dist, ov = contacts(px, py, pairs)
        o = ov.reshape(len(i), -1).max(1) / np.minimum(b[i], b[j])
        m = o > max_overlap
        i, j, o = i[m], j[m], o[m]
        for q in np.argsort(-o):                                    # worst pair first: drop the more crowded one
            if alive[i[q]] and alive[j[q]]:
                ci, cj = np.sum((i == i[q]) | (j == i[q])), np.sum((i == j[q]) | (j == j[q]))
                alive[i[q] if ci >= cj else j[q]] = False
    res = {q: v[alive] for q, v in c.items()}
    res['x'], res['y'], res['ang'] = x[alive], y[alive], ang[alive]
    if verbose:
        cov = float(np.sum(math.pi * res['a'] * res['b']))
        print('[relax] %s: %d thrown, %d kept (%d discs each), footprint area %.0f cm2' % (verbose, N, int(alive.sum()), nd, cov * 1e4))
    return res


def blue_noise(pts, rad, rng):
    """Variable-radius blue noise (discs): indices of the kept points."""
    pts = np.asarray(pts, float)
    rad = np.broadcast_to(np.asarray(rad, float), (len(pts),))
    return pack_select(pts[:, 0], pts[:, 1], np.zeros(len(pts)), rad, rad, rng, k=1.0)


def _candidates(sets, mix, x, y, rng, size_jitter=0.07, assign=None):
    """Give every candidate position an ingredient, a variant, a size and its footprint (a, b)."""
    n = len(x)
    if assign is not None:
        iset = assign(x, y)
    else:
        mix = np.asarray(mix, float) / np.sum(mix)
        iset = rng.choice(len(sets), size=n, p=mix)
    var = np.zeros(n, int)
    scale = np.ones(n)
    a = np.zeros(n)
    b = np.zeros(n)
    bfull = np.zeros(n)
    for si, S in enumerate(sets):
        m = iset == si
        v, sc = _pick_variants(S, int(m.sum()), rng, size_jitter)
        var[m], scale[m] = v, sc
        a[m], b[m], bfull[m] = S.a[v] * sc, S.bp[v] * sc, S.b[v] * sc
    return dict(x=np.asarray(x, float), y=np.asarray(y, float), iset=iset, var=var, scale=scale, a=a, b=np.minimum(b, a),
                bfull=bfull)


def _cat_c(c1, c2):
    return c2 if c1 is None else {k: np.concatenate([c1[k], c2[k]]) for k in c2}


def pack_pass(sample, n_try, rng, k=0.92, rounds=1):
    """One pouring pass: `sample(n)` returns a candidate dict (x, y, ang, iset, var, scale, a, b) that
    already respects the region; candidates are packed without overlap.  rounds > 1 keeps throwing
    new candidates between the accepted ones until the layer is jammed."""
    acc = None
    for r in range(rounds):
        c = sample(n_try)
        if c is None or len(c['x']) == 0:
            continue
        nf = 0 if acc is None else len(acc['x'])
        m = _cat_c(acc, c)
        keep = pack_select(m['x'], m['y'], m['ang'], m['a'], m['b'], rng, k=k, n_fixed=nf)
        acc = {kk: v[keep] for kk, v in m.items()}
    return acc


def _to_placement(c, sets, order, group=0):
    n = 0 if c is None else len(c['x'])
    pl = Placement(n)
    if n:
        pl.x, pl.y, pl.iset, pl.var, pl.scale = c['x'], c['y'], c['iset'], c['var'], c['scale']
        th = np.zeros(n)
        for si, S in enumerate(sets):
            m = c['iset'] == si
            th[m] = S.theta[c['var'][m]]
        pl.yaw = c['ang'] - th                                       # ang = world direction of the long axis
        pl.order[:] = order
        pl.group[:] = group
    return pl


def _scatter_passes(extent, sets, mix, dens_fns, rng, k=(0.94, 0.88, 0.85), oversample=6.0, keep=None,
                    size_jitter=0.07, group=0, assign=None, rounds=1, ang_fn=None):
    """Density-driven scatter.  For every pouring pass p: throw candidates into `extent` with
    probability dens_fns[p](x, y) in 0..1, give each one an ingredient (probabilities `mix`, or
    assign(x, y) -> set index), a variant, a size and a direction (random, or ang_fn(x, y)), and pack
    them as oriented footprints (pack_pass).  keep(x, y, a) -> bool mask can veto candidates."""
    xmin, xmax, ymin, ymax = extent
    area = (xmax - xmin) * (ymax - ymin)
    mixn = np.asarray(mix, float) / np.sum(mix)
    foot = float(np.sum(mixn * np.array([math.pi * s.L * s.Wd / 4.0 * s.fullness for s in sets])))
    parts = []
    for p, fn in enumerate(dens_fns):
        def sample(n, fn=fn):
            x = rng.uniform(xmin, xmax, n)
            y = rng.uniform(ymin, ymax, n)
            ok = rng.random(n) < np.clip(fn(x, y), 0, 1)
            x, y = x[ok], y[ok]
            c = _candidates(sets, mix, x, y, rng, size_jitter, assign)
            if keep is not None:
                kk = keep(c['x'], c['y'], c['a'])
                c = {q: v[kk] for q, v in c.items()}
            c['ang'] = rng.uniform(0, 2 * math.pi, len(c['x'])) if ang_fn is None else ang_fn(c['x'], c['y'])
            return c
        n_try = int(min(oversample * area / foot, 3.0e6))
        c = pack_pass(sample, n_try, rng, k=k[min(p, len(k) - 1)], rounds=rounds)
        parts.append(_to_placement(c, sets, p, group))
    return Placement.cat(parts)


def _patch_assign(sets, extent, wavelength, rng, weights=None):
    """assign(x, y) -> set index: organic patches (one smooth random field per ingredient, the largest
    wins) so that a mixed scatter reads as groups of each ingredient that blend at their borders."""
    n = len(sets)
    if n == 1:
        return lambda x, y: np.zeros(len(x), int)
    w, h = 256, int(256 * (extent[3] - extent[2]) / (extent[1] - extent[0])) + 1
    cell = wavelength / (extent[1] - extent[0]) * w
    wts = np.ones(n) if weights is None else np.asarray(weights, float)
    fields = [Field2(fbm2(h, w, cell, rng, 2, 0.4) / 0.6 + 0.35 * math.log(max(wts[i], 1e-3)), extent) for i in range(n)]

    def assign(x, y):
        sc = np.stack([f(x, y) for f in fields], 0) + rng.normal(0, 0.10, (n, len(x)))
        return np.argmax(sc, 0)
    return assign


def layout_wreath(frame, sets, P, rng):
    """Items scattered densely along the frame edges (cropped by the frame), thinning towards a clear
    rounded window.  P keys (all optional): window [u, v, w, h] (frame fractions, default
    [0.50, 0.42, 0.46, 0.30]), layers (1-3), reach (0-1: how far the dense band reaches towards the
    window), rough (irregularity of the inner boundary), strays (count), mix ('patches' | 'random' |
    list of per-source weights)."""
    wu, wv, ww, wh = P.get('window', [0.50, 0.42, 0.46, 0.30])
    layers = float(P.get('layers', 2.4))
    reach = float(P.get('reach', 0.55))
    rough = float(P.get('rough', 0.16))
    n_stray = int(P.get('strays', 9))
    Lmax = max(s.L for s in sets)
    ext = frame.extent(1.2 * Lmax)
    wx, wy = frame.xy(wu, wv)
    aw, ah = 0.5 * ww * frame.W, 0.5 * wh * frame.H
    nexp = 3.0                                                      # superellipse exponent of the window
    # raster of the "s" coordinate: 0 on the window outline, 1 on the frame edge
    px = max(frame.W / 640.0, 1e-5)
    nx, ny = int((ext[1] - ext[0]) / px), int((ext[3] - ext[2]) / px)
    X, Y = np.meshgrid(np.linspace(ext[0], ext[1], nx), np.linspace(ext[3], ext[2], ny))
    dx, dy = X - wx, Y - wy
    f = (np.abs(dx / aw) ** nexp + np.abs(dy / ah) ** nexp) ** (1.0 / nexp)
    with np.errstate(divide='ignore', invalid='ignore'):
        tx = np.where(dx > 0, (frame.W / 2 - wx) / dx, np.where(dx < 0, (-frame.W / 2 - wx) / dx, np.inf))
        ty = np.where(dy > 0, (frame.H / 2 - wy) / dy, np.where(dy < 0, (-frame.H / 2 - wy) / dy, np.inf))
    tedge = np.minimum(tx, ty)                                      # ray parameter of the frame edge (1 = this pixel)
    s = (f - 1.0) / np.maximum(f * tedge - 1.0, 1e-6)
    s = np.where(tedge <= 1.0, 1.0 + (1.0 / np.maximum(tedge, 1e-6) - 1.0), s)   # outside the frame: > 1
    s = np.clip(s, -1.0, 2.0)
    win = f <= 1.0
    dwin = ndi.distance_transform_edt(~win) * px                    # metres from the window outline
    nz = fbm2(ny, nx, 0.16 * frame.W / px, rng, octaves=4, gain=0.55) / 0.6
    s2 = s + rough * nz * np.clip(1.6 - s, 0.3, 1.0)
    e0 = 1.0 - reach                                                # s where the ground layer becomes complete
    d0 = C.smoothstep(e0 - 0.40, e0, s2) ** 2.0
    d1 = C.smoothstep(e0 + 0.05, min(e0 + 0.42, 1.0), s2) ** 1.5 * np.clip(layers - 1.0, 0, 1)
    d2 = C.smoothstep(e0 + 0.32, 1.05, s2) ** 1.5 * np.clip(layers - 2.0, 0, 1)
    F0, F1, F2, FD = Field2(d0, ext), Field2(d1, ext), Field2(d2, ext), Field2(dwin, ext)
    clear = float(P.get('clear_m', 0.012 * frame.H))

    def keep(x, y, a):
        return FD(x, y) > 0.95 * a + clear                          # nothing may reach into the text window

    mix = P.get('mix', 'patches')
    assign = None
    if isinstance(mix, str):
        # equal AREA share per ingredient: big items must not swamp small ones
        share = np.array([1.0 / (s_.L * s_.Wd) for s_ in sets])
        if mix == 'patches' and len(sets) > 1:
            assign = _patch_assign(sets, ext, float(P.get('patch', 0.22)) * frame.W, rng)
        mix = share
    fns = [F0, F1, F2][:max(1, int(math.ceil(layers)))]
    pl = _scatter_passes(ext, sets, mix, fns, rng, keep=keep, assign=assign)
    # a few single strays between the dense band and the window
    if n_stray > 0:
        band = Field2(((s2 > 0.03) & (s2 < e0 - 0.22) & (s <= 1.0)).astype(np.float32), ext)
        xs = rng.uniform(ext[0], ext[1], 4000)
        ys = rng.uniform(ext[2], ext[3], 4000)
        ok = band(xs, ys) > 0.5
        c = _candidates(sets, mix, xs[ok], ys[ok], rng, assign=assign)
        kk = keep(c['x'], c['y'], c['a'])
        c = {q: v[kk] for q, v in c.items()}
        sel = blue_noise(np.stack([c['x'], c['y']], 1), 2.6 * Lmax, rng)[:n_stray]
        if len(pl):                                                 # not on top of the scatter
            d, _ = cKDTree(np.stack([pl.x, pl.y], 1)).query(np.stack([c['x'][sel], c['y'][sel]], 1))
            sel = sel[d > 1.1 * Lmax]
        c = {q: v[sel] for q, v in c.items()}
        c['ang'] = rng.uniform(0, 2 * math.pi, len(sel))
        st = _to_placement(c, sets, 0)
        st.stray[:] = True
        pl = Placement.cat([pl, st])
    info = dict(window=[wu, wv, ww, wh], extent=list(ext))
    return pl, dict(extent=ext, allowed=None, candidates=4, info=info)


def stroke_width_robust(mask):
    """Width (px) of the regular strokes: 2 x the 30th percentile of the distance transform along the
    skeleton ridge (glyph_layout.stroke_width_px takes the median, which jumps to the width of a
    big filled block for glyphs like 同)."""
    dt = ndi.distance_transform_edt(mask)
    ridge = (dt == ndi.maximum_filter(dt, size=5)) & (dt > 2)
    return 2.0 * float(np.percentile(dt[ridge], 30))


def _glyph_mask(text, font, tracking, thin):
    """Rasterised text mask as glyph_layout sees it, optionally thinned: `thin` (fraction of the
    typical stroke width) erodes the strokes so that the counters open up - object type needs
    whiter counters than printed type."""
    m = G._ysty_text_mask(text, font_file=font, tracking=tracking)
    if thin > 0:
        sw = stroke_width_robust(m)
        dt = ndi.distance_transform_edt(m)
        m2 = dt > thin * sw * 0.5
        # never erase a stroke completely: keep the skeleton ridge of thin strokes
        ridge = (dt == ndi.maximum_filter(dt, size=7)) & (dt > 1.5)
        m2 |= ndi.binary_dilation(ridge & m, iterations=max(1, int(0.18 * sw))) & m
        m = m2
    return m


if not hasattr(G, '_ysty_text_mask'):
    G._ysty_text_mask = G.text_mask


class _MaskPatch(object):
    """Context manager: make glyph_layout.glyph_layout() use a prepared (thinned) mask."""

    def __init__(self, mask):
        self.mask = mask

    def __enter__(self):
        G.text_mask = lambda *a, **k: self.mask
        return self

    def __exit__(self, *a):
        G.text_mask = G._ysty_text_mask


def _stroke_direction(mask, sw):
    """Local stroke direction (radians, image coordinates: x right, y DOWN) from the structure tensor
    of the softened mask - the direction along which the mask changes least."""
    sm = ndi.gaussian_filter(mask.astype(np.float32), 0.30 * sw)
    gy, gx = np.gradient(sm)
    sig = 0.55 * sw
    jxx, jyy, jxy = ndi.gaussian_filter(gx * gx, sig), ndi.gaussian_filter(gy * gy, sig), ndi.gaussian_filter(gx * gy, sig)
    return 0.5 * np.arctan2(2 * jxy, jxx - jyy) + math.pi / 2


def layout_glyph(frame, sets, P, rng, text, seed=0):
    """Characters poured from the ingredient.

    Two stroke-fill engines share the same rasterised (optionally thinned) glyph mask:
      'glyph_layout'  glyph_layout.glyph_layout() once per pouring pass (upper passes inset -> a mound,
                      not a slab).  Disc footprints: right for seeds / berries / anything roundish.
      'packed'        oriented packing (pack_pass): elongated items lie ALONG the strokes, side by
                      side, and every footprint is tested against the outline - the only way to get
                      crisp strokes out of spindle-shaped things like goji or cinnamon.
    engine 'auto' = 'packed' when the item aspect is > 1.3.  Both end in settle().

    P keys: centre [u, v] (default [0.50, 0.47]); height (block height / frame height, 0.72) or width
    (block width / frame width); font; tracking; thin (stroke erosion, fraction of the stroke width);
    engine; passes (list of dicts: inset (item widths), k (overlap factor), fill (0-1)); align
    (0-1 | 'auto'); edge_tol (item widths an item may stick out); strays (fraction of the count)."""
    S = sets[0]
    font = P.get('font', G.DEFAULT_FONT)
    tracking = float(P.get('tracking', 0.06))
    thin = float(P.get('thin', 0.0))
    cu, cv_ = P.get('centre', [0.50, 0.47])
    mask = _glyph_mask(text, font, tracking, thin)
    mh, mw = mask.shape
    if 'width' in P:
        px_per_m = mw / (float(P['width']) * frame.W)
    else:
        px_per_m = mh / (float(P.get('height', 0.72)) * frame.H)
    sw = stroke_width_robust(mask)
    engine = P.get('engine', 'auto')
    if engine == 'auto':
        engine = 'packed' if S.aspect > 1.3 else 'glyph_layout'
    align = P.get('align', 'auto')
    if align == 'auto':
        align = float(np.clip((S.aspect - 1.1) / 0.9, 0.0, 0.92))
    align = float(align)
    stray_frac = float(P.get('strays', 0.012))
    cx, cy = frame.xy(cu, cv_)
    tol_px = float(P.get('edge_tol', 0.22)) * S.Wd * px_per_m
    dt_out = ndi.distance_transform_edt(~mask)                      # px outside the strokes
    dt_in = ndi.distance_transform_edt(mask)

    def to_px(x, y):
        return (np.asarray(x, float) - cx) * px_per_m + mw / 2.0, -(np.asarray(y, float) - cy) * px_per_m + mh / 2.0

    def outside_px(x, y):
        fx, fy = to_px(x, y)
        ok = (fx >= 0) & (fx < mw) & (fy >= 0) & (fy < mh)
        v = np.full(np.shape(fx), 1e6)
        v[ok] = dt_out[np.asarray(fy)[ok].astype(int), np.asarray(fx)[ok].astype(int)]
        return v

    parts = []
    if engine == 'glyph_layout':
        passes = P.get('passes') or [dict(inset=0.55), dict(inset=1.5), dict(inset=2.6, fill=0.7)]
        item_r = S.r_eff
        stroke_items = G.stroke_width_px(mask) / (2.0 * item_r * px_per_m)      # reproduces px_per_m inside the tool
        with _MaskPatch(mask):
            for p, ps in enumerate(passes):
                lay = G.glyph_layout(text, item_r=item_r, stroke_items=stroke_items, item_h=0.5 * S.T, shape='sphere',
                                     passes=1, density=1.0, edge_inset=float(ps.get('inset', 0.55)) * S.Wd / (2 * item_r),
                                     size_jitter=0.07, stray_frac=0.0, align=align, font_file=font, tracking=tracking,
                                     seed=seed * 31 + p)
                n = len(lay['z'])
                pl = Placement(n)
                pl.x, pl.y = lay['xy'][:, 0] + cx, lay['xy'][:, 1] + cy
                pl.var, _ = _pick_variants(S, n, rng)
                pl.scale = np.clip(lay['scale'], 0.84, 1.16)
                pl.yaw = lay['yaw'] - S.theta[pl.var]                # the tool's yaw = direction of the long axis
                pl.order[:] = p
                if float(ps.get('fill', 1.0)) < 1.0:
                    pl = pl.take(rng.random(n) < float(ps['fill']))
                parts.append(pl)
    else:
        passes = P.get('passes') or [dict(mode='relax', pack=0.90), dict(mode='rsa', inset=0.7, k=0.92, fill=0.6)]
        sdir = _stroke_direction(mask, sw)
        sd_img = (dt_in - dt_out).astype(np.float32)                # signed distance (px), + inside the stroke
        sgy, sgx = np.gradient(ndi.gaussian_filter(sd_img, 1.5))
        gn = np.hypot(sgx, sgy) + 1e-9
        sgx, sgy = sgx / gn, sgy / gn

        def pix(x, y):
            fx, fy = to_px(x, y)
            return np.clip(fy.astype(int), 0, mh - 1), np.clip(fx.astype(int), 0, mw - 1), fx, fy

        def signed(x, y):
            iy, ix, fx, fy = pix(x, y)
            d = sd_img[iy, ix] / px_per_m
            far = np.maximum(np.maximum(-fx, fx - mw), np.maximum(-fy, fy - mh))
            d = np.where(far > 0, d - far / px_per_m, d)
            return d, sgx[iy, ix], -sgy[iy, ix]                     # image y is down

        def dir_fn(x, y):
            iy, ix, _, _ = pix(x, y)
            return -sdir[iy, ix]

        ts_l = np.array([-0.90, -0.45, 0.0, 0.45, 0.90])
        for p, ps in enumerate(passes):
            inset = float(ps.get('inset', 0.0))
            ys_, xs_ = np.where(dt_in >= max((0.40 + inset) * S.Wd * px_per_m - tol_px, 0.5))
            if len(ys_) == 0:
                continue
            fill = float(ps.get('fill', 1.0))
            foot = math.pi * S.L * S.Wd / 4.0 * S.fullness

            def throw(n, ys_=ys_, xs_=xs_):
                j = rng.integers(0, len(ys_), n)
                fx, fy = xs_[j] + rng.random(n), ys_[j] + rng.random(n)
                x = (fx - mw / 2.0) / px_per_m + cx
                y = -(fy - mh / 2.0) / px_per_m + cy
                c = _candidates(sets, [1.0], x, y, rng)
                sd_ = -sdir[np.clip(fy.astype(int), 0, mh - 1), np.clip(fx.astype(int), 0, mw - 1)]   # world angle (y up)
                c['ang'] = np.where(rng.random(n) < align, sd_ + rng.normal(0, 0.16, n), rng.uniform(0, math.pi, n))
                c['sd'] = sd_
                return c

            if ps.get('mode', 'rsa') == 'relax':
                area = float(mask.sum()) / px_per_m ** 2
                c = throw(int(float(ps.get('pack', 0.90)) * area / foot))
                c = relax_pack(c, signed, rng, iters=int(ps.get('iters', 140)), tol=tol_px / px_per_m, dir_fn=dir_fn,
                               align_w=0.05 * align, verbose='pass %d' % p)
                c['ang'] = c['ang'] + np.where(rng.random(len(c['x'])) < 0.5, math.pi, 0.0)
            else:
                def sample(n, throw=throw, inset=inset):
                    c = throw(n)
                    ok = np.zeros(n, bool)
                    ang = c['ang']
                    for attempt in range(2):                         # 2nd try: exactly along the stroke
                        todo = ~ok
                        if attempt == 1:
                            ang = np.where(todo, c['sd'], ang)
                        ca, sa = np.cos(ang[todo]), np.sin(ang[todo])
                        a_, b_ = c['a'][todo], c['bfull'][todo]
                        w = np.zeros(int(todo.sum()))
                        for t in ts_l:                               # points along the long axis ...
                            w = np.maximum(w, outside_px(c['x'][todo] + t * a_ * ca, c['y'][todo] + t * a_ * sa))
                        for t in (-0.85, 0.85):                      # ... and across the waist
                            w = np.maximum(w, outside_px(c['x'][todo] - t * b_ * sa, c['y'][todo] + t * b_ * ca))
                        idx = np.flatnonzero(todo)
                        ok[idx[w <= tol_px]] = True
                    c['ang'] = ang + np.where(rng.random(n) < 0.5, math.pi, 0.0)
                    return {q: v[ok] for q, v in c.items()}
                n_cap = len(ys_) / px_per_m ** 2 / foot
                c = pack_pass(sample, int(3.0 * n_cap) + 50, rng, k=float(ps.get('k', 0.9)), rounds=int(ps.get('rounds', 4)))
            pl = _to_placement(c, sets, p)
            if fill < 1.0 and len(pl):
                pl = pl.take(rng.random(len(pl)) < fill)
            parts.append(pl)
    pl = Placement.cat(parts)

    # ---- a few loose items around the characters (never inside the counters)
    n_stray = int(round(stray_frac * len(pl)))
    if n_stray > 0:
        closed = ndi.binary_closing(np.pad(mask, 40), iterations=max(2, int(1.2 * sw)))[40:-40, 40:-40]
        dist_c = ndi.distance_transform_edt(~closed) / px_per_m
        yy, xx = np.where((dist_c > 0.9 * S.L) & (dist_c < float(P.get('stray_reach', 4.0)) * S.L))
        if len(yy):
            j = rng.integers(0, len(yy), 40 * n_stray)
            x = (xx[j] + 0.5 - mw / 2.0) / px_per_m + cx
            y = -(yy[j] + 0.5 - mh / 2.0) / px_per_m + cy
            c = _candidates(sets, [1.0], x, y, rng)
            sel = blue_noise(np.stack([x, y], 1), 1.6 * S.L, rng)[:n_stray]
            c = {q: v[sel] for q, v in c.items()}
            c['ang'] = rng.uniform(0, 2 * math.pi, len(sel))
            st = _to_placement(c, sets, 0)
            st.stray[:] = True
            pl = Placement.cat([pl, st])

    def allowed(x, y):
        return float(outside_px(np.array([x]), np.array([y]))[0]) <= 0.0

    # per-character boxes (frame fractions) for 2-D reveals
    cols = mask.any(0)
    edges = np.flatnonzero(np.diff(np.concatenate([[0], cols.astype(np.int8), [0]])))
    runs = list(zip(edges[::2], edges[1::2]))
    nchar = len(text.replace('\n', ''))
    while len(runs) > nchar:                                        # merge the narrowest gaps (parts of one character)
        gaps = [runs[j + 1][0] - runs[j][1] for j in range(len(runs) - 1)]
        j = int(np.argmin(gaps))
        runs[j:j + 2] = [(runs[j][0], runs[j + 1][1])]
    boxes = []
    for (c0, c1) in runs:
        rows = np.flatnonzero(mask[:, c0:c1].any(1))
        u0, v0 = frame.uv((c0 - mw / 2.0) / px_per_m + cx, -(rows.min() - mh / 2.0) / px_per_m + cy)
        u1, v1 = frame.uv((c1 - mw / 2.0) / px_per_m + cx, -(rows.max() - mh / 2.0) / px_per_m + cy)
        boxes.append([round(float(u0), 5), round(float(v0), 5), round(float(u1), 5), round(float(v1), 5)])
    ext = frame.extent(1.2 * S.L)
    info = dict(text=text, font=font, thin=thin, engine=engine, px_per_m=px_per_m, stroke_width_m=sw / px_per_m,
                stroke_items_wide=sw / px_per_m / S.Wd, block_m=[mw / px_per_m, mh / px_per_m], char_boxes=boxes, align=align)
    print('[glyph] %r (%s): block %.0f x %.0f mm, stroke %.1f mm = %.1f item widths / %.1f item lengths, align %.2f, %d items' % (
        text, engine, mw / px_per_m * 1e3, mh / px_per_m * 1e3, sw / px_per_m * 1e3, sw / px_per_m / S.Wd,
        sw / px_per_m / S.L, align, len(pl)))
    return pl, dict(extent=ext, allowed=allowed, candidates=int(P.get('candidates', 4)), info=info)


def layout_taiji(frame, sets, P, rng):
    """Taiji disc: sets[0] = yin (dark, e.g. black sesame), sets[1] = yang (light, e.g. coix seed).
    P: centre [u, v] (0.50, 0.72), diameter (fraction of frame height, 0.50), dot (radius / R, 0.17),
    layers, rotate_deg (0 = classic: light on the left, its head at the top)."""
    cu, cv_ = P.get('centre', [0.50, 0.72])
    R = 0.5 * float(P.get('diameter', 0.50)) * frame.H
    dot = float(P.get('dot', 0.17)) * R
    rotd = math.radians(float(P.get('rotate_deg', 0.0)))
    layers = int(P.get('layers', 3))
    cx, cy = frame.xy(cu, cv_)
    ext = (cx - 1.15 * R, cx + 1.15 * R, cy - 1.15 * R, cy + 1.15 * R)
    px = 2 * 1.15 * R / 900.0
    X, Y = np.meshgrid(np.linspace(ext[0], ext[1], 900), np.linspace(ext[3], ext[2], 900))
    xr = (X - cx) * math.cos(rotd) + (Y - cy) * math.sin(rotd)
    yr = -(X - cx) * math.sin(rotd) + (Y - cy) * math.cos(rotd)
    disc = np.hypot(xr, yr) <= R
    up = np.hypot(xr, yr - R / 2) <= R / 2
    dn = np.hypot(xr, yr + R / 2) <= R / 2
    yang = disc & (((xr < 0) & ~dn) | up)                           # light half: left side, head at the top
    yin = disc & ~yang
    dot_up = np.hypot(xr, yr - R / 2) <= dot                        # dark eye in the light head
    dot_dn = np.hypot(xr, yr + R / 2) <= dot
    yang = (yang & ~dot_up) | dot_dn
    yin = (yin & ~dot_dn) | dot_up
    parts = []
    info = dict(centre=[cu, cv_], radius_m=R)
    for si, m in ((0, yin), (1, yang)):
        S = sets[si]
        dt = ndi.distance_transform_edt(m) * px
        fns = [Field2((dt > (0.45 + 0.95 * p) * S.Wd * 0.5 + 0.9 * p * S.Wd).astype(np.float32), ext) for p in range(layers)]
        pl = _scatter_passes(ext, [S], [1.0], fns, rng, k=(0.94, 0.90, 0.88), oversample=3.0, rounds=4)
        pl.iset[:] = si
        pl.group[:] = si
        parts.append(pl)
    pl = Placement.cat(parts)
    return pl, dict(extent=frame.extent(0.02), allowed=None, candidates=1, info=info)


def _dish_profile(R, kind):
    """(r, z) polyline of a small round dish, outside foot -> rim -> inside -> centre.  R = rim radius."""
    if kind == 'wood':
        pts = [(0.0, 0.0), (0.52 * R, 0.0), (0.56 * R, 0.004 * R), (0.80 * R, 0.07 * R), (0.95 * R, 0.17 * R),
               (1.0 * R, 0.235 * R), (0.995 * R, 0.262 * R), (0.975 * R, 0.270 * R), (0.955 * R, 0.262 * R),
               (0.90 * R, 0.20 * R), (0.74 * R, 0.115 * R), (0.50 * R, 0.085 * R), (0.0, 0.080 * R)]
    else:                                                           # celadon: foot ring, thin flaring wall
        pts = [(0.0, 0.03 * R), (0.40 * R, 0.03 * R), (0.42 * R, 0.0), (0.50 * R, 0.0), (0.52 * R, 0.035 * R),
               (0.78 * R, 0.10 * R), (0.95 * R, 0.21 * R), (1.0 * R, 0.275 * R), (0.997 * R, 0.292 * R),
               (0.982 * R, 0.297 * R), (0.968 * R, 0.288 * R), (0.92 * R, 0.225 * R), (0.76 * R, 0.135 * R),
               (0.50 * R, 0.085 * R), (0.0, 0.075 * R)]
    return np.array(pts)


def _smooth_profile(pts, n=160):
    """Chaikin-smoothed, arc-length resampled profile."""
    p = np.asarray(pts, float)
    for _ in range(3):
        q = 0.75 * p[:-1] + 0.25 * p[1:]
        r = 0.25 * p[:-1] + 0.75 * p[1:]
        p = np.concatenate([p[:1], np.stack([q, r], 1).reshape(-1, 2), p[-1:]])
    d = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
    t = np.linspace(0, d[-1], n)
    return np.stack([np.interp(t, d, p[:, 0]), np.interp(t, d, p[:, 1])], 1)


def layout_dishes(frame, sets, P, rng):
    """N small round dishes in a row, each heaped with one ingredient (sets[i] -> dish i).
    P: centre_v (0.72), dish (diameter / frame width, 0.150), pitch (/ frame width, 0.180),
    kinds (list 'wood' | 'celadon'), heap (mound height / dish radius, 0.30), fill (0.80 of the radius)."""
    n = len(sets)
    cv_ = float(P.get('centre_v', 0.72))
    Rd = 0.5 * float(P.get('dish', 0.150)) * frame.W
    pitch = float(P.get('pitch', 0.180)) * frame.W
    kinds = P.get('kinds', ['wood', 'celadon', 'wood', 'celadon', 'wood'])
    heap = float(P.get('heap', 0.30))
    fill = float(P.get('fill', 0.80))
    _, cy = frame.xy(0.5, cv_)
    centres = [((i - (n - 1) / 2.0) * pitch, float(cy)) for i in range(n)]
    profs = [_smooth_profile(_dish_profile(Rd, kinds[i % len(kinds)])) for i in range(n)]
    inner = []
    for pr in profs:                                                # inside surface: from the rim top inwards
        j = int(np.argmax(pr[:, 1]))
        inner.append(pr[j:][::-1])                                  # r ascending from the centre to the rim

    def base(X, Y):
        Hh = np.zeros_like(X, dtype=np.float32)
        for (dx, dy), ins in zip(centres, inner):
            r = np.hypot(X - dx, Y - dy)
            m = r <= ins[-1, 0]
            Hh[m] = np.interp(r[m], ins[:, 0], ins[:, 1])
        return Hh

    parts = []
    for i, S in enumerate(sets):
        dx, dy = centres[i]
        ext = (dx - Rd, dx + Rd, dy - Rd, dy + Rd)
        Rf = fill * Rd
        nl = int(np.clip(round(heap * Rd / max(S.T * 0.72, 1e-6)), 2, 16))       # layers needed for the mound
        fns = []
        for p in range(nl):
            rp = Rf * math.sqrt(max(1.0 - p / float(nl), 0.03))                 # paraboloid mound
            fns.append((lambda x, y, rp=rp, dx=dx, dy=dy: (np.hypot(x - dx, y - dy) < rp).astype(float)))
        pl = _scatter_passes(ext, [S], [1.0], fns, rng, k=(0.94, 0.9, 0.88), oversample=3.0, rounds=3)
        pl.iset[:] = i
        pl.group[:] = i
        parts.append(pl)
    pl = Placement.cat(parts)
    info = dict(centres=[[float(a), float(b)] for a, b in centres], dish_radius_m=Rd, kinds=kinds[:n])
    return pl, dict(extent=frame.extent(0.02), allowed=None, candidates=3, info=info, base=base,
                    dishes=(centres, profs, kinds))


# ============================================================================= ground textures (numpy)
def _draw_fibres(canvas, n, texel, len_m, wid_m, value, curl, rng, direction=None, spread=math.pi, seg=7):
    """Draw n thin curved fibres into a uint8 canvas (anti-aliased polylines, max-blended)."""
    if n <= 0:
        return
    h, w = canvas.shape
    L = rng.uniform(len_m[0], len_m[1], n) / texel
    wd = rng.uniform(wid_m[0], wid_m[1], n) / texel
    th = (rng.uniform(0, 2 * math.pi, n) if direction is None else direction + rng.normal(0, spread, n))
    x = rng.uniform(-0.05 * w, 1.05 * w, n)
    y = rng.uniform(-0.05 * h, 1.05 * h, n)
    pts = np.zeros((n, seg + 1, 2), np.float32)
    pts[:, 0, 0], pts[:, 0, 1] = x, y
    for s in range(seg):
        th = th + rng.normal(0, curl, n)
        pts[:, s + 1, 0] = pts[:, s, 0] + np.cos(th) * L / seg
        pts[:, s + 1, 1] = pts[:, s, 1] + np.sin(th) * L / seg
    ipts = np.round(pts * 16).astype(np.int32)
    thick = np.clip(np.round(wd), 1, 12).astype(int)
    inten = np.clip(value * np.minimum(1.0, wd) * rng.uniform(0.55, 1.0, n), 0, 1)
    qv = np.clip((inten * 6).astype(int), 0, 5)
    tmp = np.zeros_like(canvas)
    for t in np.unique(thick):
        for q in range(6):
            m = (thick == t) & (qv == q)
            if not m.any():
                continue
            tmp[:] = 0
            cv2.polylines(tmp, list(ipts[m][:, :, None, :]), False, int(255 * (q + 0.7) / 6.0), int(t), cv2.LINE_AA, 4)
            np.maximum(canvas, tmp, out=canvas)


def _grid_ink(h, w, texel, x0, y0, grid, rng, fibre_h):
    """Printed grid lines as an ink-coverage map (0-1): slightly uneven, soaked INTO the paper.
    grid: type 'square' | 'columns', pitch_m, line_m, (pitch_x_m, pitch_y_m), offset [x, y] (m),
    border (bool, heavier every `major` lines)."""
    typ = grid.get('type', 'square')
    pxm = float(grid.get('pitch_x_m', grid.get('pitch_m', 0.01)))
    pym = float(grid.get('pitch_y_m', grid.get('pitch_m', 0.01)))
    line = float(grid.get('line_m', 0.00035))
    major = int(grid.get('major', 0))
    ox, oy = grid.get('offset', [0.0, 0.0])
    xs = x0 + (np.arange(w) + 0.5) * texel
    ys = y0 - (np.arange(h) + 0.5) * texel                           # row 0 = top (+y)
    # slow wobble of the plate against the sheet + line weight variation
    wob = cv2.resize(rng.standard_normal((8, 12)).astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC) * 0.10 * line

    def lines(coord, pitch, o, n_major):
        t = (coord - o) / pitch
        k = np.round(t)
        d = np.abs(t - k) * pitch
        wgt = np.full_like(d, 0.5 * line)
        if n_major > 0:
            wgt = np.where(np.mod(k, n_major) == 0, 0.5 * line * 1.9, wgt)
        return d, wgt

    ink = np.zeros((h, w), np.float32)
    soft = max(0.75 * texel, 0.12 * line)
    dxl, wx_ = lines(xs[None, :] + wob, pxm, ox, major)
    ink = np.maximum(ink, 1.0 - C.smoothstep(wx_ - soft, wx_ + soft, np.broadcast_to(dxl, (h, w))))
    if typ == 'square':
        dyl, wy_ = lines(ys[:, None] + wob, pym, oy, major)
        ink = np.maximum(ink, 1.0 - C.smoothstep(wy_ - soft, wy_ + soft, np.broadcast_to(dyl, (h, w))))
    # uneven ink: plate pressure (slow), paper tooth (fine), fibres resist the ink
    slow = 0.80 + 0.20 * np.clip(fbm2(h, w, 0.03 / texel, rng, 3) / 0.6, -1, 1)
    fine = 0.86 + 0.14 * np.clip(fbm2(h, w, max(3.0, 0.0006 / texel), rng, 2) / 0.6, -1, 1)
    ink = ink * slow * fine * (1.0 - 0.45 * fibre_h)
    return np.clip(ink, 0, 1)


def make_ground_maps(kind, frame, margin, texel, seed, P):
    """Numpy texture set for the ground plane, covering frame + margin at `texel` metres per pixel.
    Returns dict(rgb (h,w,3) uint16, ink (h,w) uint16 or None, size_m (w, h)).
      paper : R fibre relief, G fibre tint (0.5 neutral, >0.5 pale strands, <0.5 dark flecks), B formation cloud
      slate : R cleft relief, G mineral speckle, B pale veins / scratches
      walnut: R grain (0 = dark latewood), G pores, B figure (slow colour drift)
      linen : R weave relief, G yarn tint, B slubs"""
    rng = np.random.default_rng(1234 + seed * 7)
    Wm, Hm = frame.W + 2 * margin, frame.H + 2 * margin
    w, h = int(round(Wm / texel)), int(round(Hm / texel))
    x0, y0 = -Wm / 2, Hm / 2
    ink = None
    if kind == 'paper':
        amt = float(P.get('fibres', 1.0))
        fib = np.zeros((h, w), np.uint8)
        drk = np.zeros((h, w), np.uint8)
        A = Wm * Hm
        # (count per m2, length m, width m, intensity, curl)
        for dens, ln, wd, val, curl in ((2.6e5, (0.0015, 0.005), (0.00003, 0.00007), 0.45, 0.32),      # felt
                                        (7.0e4, (0.005, 0.018), (0.00004, 0.00010), 0.70, 0.13),      # fibres
                                        (7.0e3, (0.020, 0.070), (0.00007, 0.00016), 1.00, 0.07)):     # long kozo strands
            if wd[1] / texel < 0.18:
                continue
            _draw_fibres(fib, int(min(dens * A * amt, 1.2e6)), texel, ln, wd, val, curl, rng, seg=9)
        _draw_fibres(drk, int(min(900 * A * amt, 2e5)), texel, (0.0008, 0.004), (0.00008, 0.00022), 1.0, 0.5, rng)
        nfl = int(min(500 * A * amt, 1e5))                           # bark flecks
        fx, fy = rng.uniform(0, w, nfl), rng.uniform(0, h, nfl)
        fr = np.maximum(rng.uniform(0.00010, 0.00045, nfl) / texel, 0.6)
        for i in range(nfl):
            cv2.ellipse(drk, (int(fx[i] * 16), int(fy[i] * 16)), (int(fr[i] * 16), int(fr[i] * rng.uniform(0.4, 1.0) * 16)),
                        float(rng.uniform(0, 180)), 0, 360, int(rng.uniform(90, 255)), -1, cv2.LINE_AA, 4)
        fibf = cv2.GaussianBlur(fib, (0, 0), 0.7).astype(np.float32) / 255.0
        drkf = cv2.GaussianBlur(drk, (0, 0), 0.6).astype(np.float32) / 255.0
        cloud = fbm2(h, w, 0.012 / texel, rng, 5, 0.6) / 0.6
        cloud += 0.5 * fbm2(h, w, 0.07 / texel, rng, 3, 0.5) / 0.6
        if P.get('laid', True) and 0.0011 / texel >= 2.5:            # laid lines of the papermaker's screen (帘纹)
            ys = (np.arange(h) + 0.5) * texel
            xs = (np.arange(w) + 0.5) * texel
            laid = 0.5 * np.cos(2 * math.pi * ys / 0.0011)[:, None] * np.ones((1, w), np.float32)
            chain = np.exp(-((np.mod(xs, 0.024) - 0.012) / 0.0006) ** 2)[None, :]
            cloud = cloud + 0.16 * laid + 0.35 * chain
        tint = 0.5 + 0.5 * fibf * (0.55 + 0.45 * np.clip(fbm2(h, w, 0.004 / texel, rng, 2) / 0.6 + 0.3, 0, 1)) - 0.5 * drkf
        relief = np.clip(fibf + 0.6 * drkf, 0, 1)
        rgb = np.stack([relief, np.clip(tint, 0, 1), np.clip(0.5 + 0.22 * cloud, 0, 1)], -1)
        grid = P.get('grid')
        if grid:
            ink = _grid_ink(h, w, texel, x0, y0, grid, rng, fibf)
    elif kind == 'slate':
        base = fbm2(h, w, 0.09 / texel, rng, 5, 0.55) / 0.6
        warp = fbm2(h, w, 0.03 / texel, rng, 4, 0.5) / 0.6
        t = base * 2.2 + 0.35 * warp
        k = np.floor(t)
        fr = t - k
        terr = k + C.smoothstep(0.78, 0.98, fr)                      # riven cleft planes with soft steps
        terr = (terr - terr.min()) / max(np.ptp(terr), 1e-6)
        fine = fbm2(h, w, max(0.0025 / texel, 2.0), rng, 4, 0.6) / 0.6
        relief = np.clip(0.72 * terr + 0.10 * fine + 0.14, 0, 1)
        speck = np.clip(0.5 + 0.5 * fbm2(h, w, max(0.0007 / texel, 1.6), rng, 3, 0.7) / 0.6, 0, 1)
        veins = np.zeros((h, w), np.uint8)
        _draw_fibres(veins, int(60 * Wm * Hm) + 3, texel, (0.03, 0.16), (0.00015, 0.0005), 0.9, 0.10, rng,
                     direction=rng.uniform(0, math.pi), spread=0.35, seg=10)
        _draw_fibres(veins, int(900 * Wm * Hm), texel, (0.004, 0.03), (0.00006, 0.00016), 0.6, 0.05, rng, seg=4)
        rgb = np.stack([relief, speck, cv2.GaussianBlur(veins, (0, 0), 0.8).astype(np.float32) / 255.0], -1)
    elif kind == 'walnut':
        ys = (np.arange(h)[:, None] + 0.5) * texel
        xs = (np.arange(w)[None, :] + 0.5) * texel
        warp = cv2.resize(rng.standard_normal((int(Hm / 0.05) + 3, int(Wm / 0.35) + 3)).astype(np.float32), (w, h),
                          interpolation=cv2.INTER_CUBIC)
        warp2 = fbm2(h, w, 0.02 / texel, rng, 3, 0.5) / 0.6
        ringpos = (ys + 0.030 * warp + 0.0025 * warp2 + 0.02 * np.sin(xs / 0.9 + 1.0)) / float(P.get('ring_m', 0.0065))
        fr = ringpos - np.floor(ringpos)
        ring = np.where(fr < 0.82, (fr / 0.82) ** 1.6, 1.0 - (fr - 0.82) / 0.18)        # slow early wood, sharp late wood line
        streak = cv2.resize(rng.standard_normal((int(Hm / 0.0012) + 3, int(Wm / 0.12) + 3)).astype(np.float32), (w, h),
                            interpolation=cv2.INTER_LINEAR)
        grain = np.clip(0.55 * ring + 0.25 + 0.12 * streak, 0, 1)
        pores = np.zeros((h, w), np.uint8)
        _draw_fibres(pores, int(min(1.6e6 * Wm * Hm, 1.2e6)), texel, (0.0006, 0.0045), (0.00005, 0.00016), 1.0, 0.02, rng,
                     direction=0.0, spread=0.05, seg=3)
        figure = np.clip(0.5 + 0.5 * fbm2(h, w, 0.10 / texel, rng, 3, 0.5) / 0.6
                         + 0.2 * cv2.resize(rng.standard_normal((int(Hm / 0.02) + 3, 3)).astype(np.float32), (w, h),
                                            interpolation=cv2.INTER_CUBIC), 0, 1)
        rgb = np.stack([grain, cv2.GaussianBlur(pores, (0, 0), 0.6).astype(np.float32) / 255.0, figure], -1)
    elif kind == 'linen':
        pitch = float(P.get('thread_m', 0.00048))
        ppx = pitch / texel
        ys = (np.arange(h)[:, None] + 0.5) / ppx
        xs = (np.arange(w)[None, :] + 0.5) / ppx
        nwx, nwy = int(w / ppx) + 3, int(h / ppx) + 3
        # per-thread properties: thickness, tint, lateral wander
        warp_t = rng.normal(1.0, 0.16, nwx).astype(np.float32)
        weft_t = rng.normal(1.0, 0.16, nwy).astype(np.float32)
        warp_c = rng.normal(0.0, 1.0, nwx).astype(np.float32)
        weft_c = rng.normal(0.0, 1.0, nwy).astype(np.float32)
        wander = fbm2(h, w, 0.012 / texel, rng, 3) * 0.22
        u = xs + wander
        v = ys + wander.T[:h, :w] if wander.T.shape[0] >= h and wander.T.shape[1] >= w else ys + 0.0 * wander
        iu, iv = np.floor(u).astype(int) % nwx, np.floor(v).astype(int) % nwy
        fu, fv = u - np.floor(u) - 0.5, v - np.floor(v) - 0.5
        slub = np.clip(fbm2(h, w, 0.004 / texel, rng, 3) / 0.6, -1, 1)
        slub_w = cv2.resize(rng.standard_normal((int(Hm / 0.02) + 3, nwx)).astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
        slub_f = cv2.resize(rng.standard_normal((nwy, int(Wm / 0.02) + 3)).astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
        tw = np.clip(warp_t[iu] * (1 + 0.22 * slub_w), 0.5, 1.7)
        tf = np.clip(weft_t[iv] * (1 + 0.22 * slub_f), 0.5, 1.7)
        pw = np.clip(1.0 - (fu / (0.46 * tw)) ** 2, 0, 1) ** 0.5       # warp thread cross profile (runs along y)
        pf = np.clip(1.0 - (fv / (0.46 * tf)) ** 2, 0, 1) ** 0.5       # weft thread cross profile (runs along x)
        par = ((iu + iv) % 2).astype(np.float32)                       # plain weave: who is on top
        hw_ = pw * (0.55 + 0.45 * np.cos(math.pi * fv) * (2 * par - 1))
        hf_ = pf * (0.55 - 0.45 * np.cos(math.pi * fu) * (2 * par - 1))
        top_w = hw_ >= hf_
        relief = np.maximum(hw_, hf_)
        tint = np.where(top_w, warp_c[iu] + 0.6 * slub_w, weft_c[iv] + 0.6 * slub_f)
        if ppx < 2.2:                                                  # threads not resolvable: keep the yarn streaks only
            relief = 0.5 + 0.0 * relief
        rgb = np.stack([np.clip(relief, 0, 1), np.clip(0.5 + 0.17 * tint, 0, 1), np.clip(0.5 + 0.5 * slub, 0, 1)], -1)
    else:
        raise ValueError('unknown ground type %r' % kind)
    out = dict(rgb=(np.clip(rgb, 0, 1) * 65535).astype(np.uint16), size_m=(Wm, Hm), ink=None)
    if ink is not None:
        out['ink'] = (ink * 65535).astype(np.uint16)
    return out


def _save_tex(arr, path):
    if arr.ndim == 3:
        arr = arr[..., ::-1]
    cv2.imwrite(path, arr, [cv2.IMWRITE_PNG_COMPRESSION, 1])
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = 'Non-Color'
    return img


def build_ground(frame, G_, exposure, seed, tex_px, margin, tag):
    """Create the ground plane (frame + margin) with its material, plus a plain 'table' far around it
    that only catches bounce light.  G_ = the shot's ground dict.  Returns the list of temp files."""
    kind = G_.get('type', 'paper')
    texel = frame.W / float(tex_px)
    maps = make_ground_maps(kind, frame, margin, texel, seed, G_)
    Wm, Hm = maps['size_m']
    os.makedirs(os.path.join(TMP_DIR, 'tex'), exist_ok=True)
    stem = os.path.join(TMP_DIR, 'tex', '%s_%d' % (tag, os.getpid()))
    files = [stem + '_rgb.png']
    img = _save_tex(maps['rgb'], files[0])
    ink_img = None
    if maps['ink'] is not None:
        files.append(stem + '_ink.png')
        ink_img = _save_tex(maps['ink'], files[1])
    col = albedo_for_display(G_.get('colour', [40, 40, 40]), exposure)
    col = tuple(float(v) for v in col)
    m = C.Mat('ground_' + kind)
    uv = m.coords('UV')
    tex = m.node('ShaderNodeTexImage', {'Vector': uv}, image=img, interpolation='Cubic', extension='EXTEND')
    sep = m.node('ShaderNodeSeparateColor', {0: tex.outputs['Color']})
    cR, cG, cB = sep.outputs[0], sep.outputs[1], sep.outputs[2]
    pos = m.position()
    if kind == 'paper':
        lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2]
        pale = tuple(float(min(0.95, (c + 0.15 * (lum - c)) * (1.0 + 0.55 * (1.0 - lum) ** 2) + 0.004)) for c in col)   # strands take less dye
        fleck = tuple(float(c * 0.22 + 0.006) for c in (col[0] * 1.2, col[1] * 0.9, col[2] * 0.7))
        cl = float(G_.get('cloud', 0.07))
        base = m.hsv(col, 0.5, m.map_range(cB, 0, 1, 1.0 + 0.5 * cl, 1.0 - 0.5 * cl), m.map_range(cB, 0, 1, 1 - cl, 1 + cl))
        base = m.mix(base, pale, m.map_range(cG, 0.5, 1.0, 0.0, float(G_.get('fibre_contrast', 0.65))))
        base = m.mix(base, fleck, m.map_range(cG, 0.5, 0.0, 0.0, 0.85))
        if ink_img is not None:
            gi = G_['grid']
            it = m.node('ShaderNodeTexImage', {'Vector': uv}, image=ink_img, interpolation='Cubic', extension='EXTEND')
            ink_col = tuple(float(v) for v in albedo_for_display(gi.get('colour', [170, 40, 30]), exposure))
            base = m.mix(base, ink_col, m.math('MULTIPLY', it.outputs['Color'], float(gi.get('opacity', 0.85))))
        rough = m.map_range(cR, 0, 1, float(G_.get('roughness', 0.66)), float(G_.get('roughness', 0.66)) - 0.20)
        cock = m.noise(scale=1.0 / 0.085, detail=2.0, roughness=0.45, vector=pos)
        nrm = m.bump(cock, strength=1.0, distance=float(G_.get('cockle_m', 0.0022)))
        nrm = m.bump(cR, strength=0.8, distance=0.000028, normal=nrm)
        nrm = m.bump(cB, strength=0.5, distance=0.00006, normal=nrm)
        nrm = m.micro_bump(scale=5200, strength=0.55, distance=0.000035, vector=pos, normal=nrm)
        m.set(base_color=base, roughness=rough, specular=float(G_.get('specular', 0.22)), sheen=float(G_.get('sheen', 0.10)),
              sheen_roughness=0.5, normal=nrm)
    elif kind == 'slate':
        dust = tuple(float(min(0.9, c * 1.9 + 0.012)) for c in col)
        deep = tuple(float(c * 0.55) for c in col)
        base = m.mix(deep, col, m.map_range(cR, 0.1, 0.8))
        base = m.mix(base, dust, m.math('MULTIPLY', m.map_range(cG, 0.62, 0.95), 0.35))
        base = m.mix(base, dust, m.math('MULTIPLY', cB, 0.5))
        rough = m.map_range(cG, 0.2, 0.9, 0.42, 0.66)
        nrm = m.bump(cR, strength=1.0, distance=float(G_.get('cleft_m', 0.0011)))
        nrm = m.micro_bump(scale=2600, strength=0.6, distance=0.00006, vector=pos, normal=nrm)
        m.set(base_color=base, roughness=rough, specular=0.40, normal=nrm)
    elif kind == 'walnut':
        dark = tuple(float(c * 0.42) for c in col)
        lite = tuple(float(min(0.9, c * 1.55 + 0.004)) for c in (col[0], col[1] * 1.04, col[2] * 1.1))
        base = m.mix(dark, lite, m.map_range(cR, 0.15, 0.95))
        base = m.hsv(base, m.map_range(cB, 0, 1, 0.490, 0.512), m.map_range(cB, 0, 1, 1.1, 0.85), m.map_range(cB, 0, 1, 0.80, 1.22))
        base = m.mix(base, tuple(float(c * 0.18) for c in col), m.math('MULTIPLY', cG, 0.85))
        rough = m.mixf(m.map_range(cR, 0, 1, 0.34, 0.46), 0.75, cG)
        nrm = m.bump(cG, strength=1.0, distance=0.00009, invert=True)
        nrm = m.bump(cR, strength=0.35, distance=0.00005, normal=nrm)
        nrm = m.micro_bump(scale=4000, strength=0.25, distance=0.00002, vector=pos, normal=nrm)
        m.set(base_color=base, roughness=rough, specular=0.45, coat=0.25, coat_roughness=0.30, normal=nrm)
    elif kind == 'linen':
        base = m.hsv(col, 0.5, m.map_range(cG, 0, 1, 1.12, 0.84), m.map_range(cG, 0, 1, 0.62, 1.50))
        base = m.mix(base, tuple(float(c * 0.45) for c in col), m.map_range(cR, 0.45, 0.0, 0.0, 0.75))      # gaps between threads
        base = m.mix(base, tuple(float(min(0.9, c * 2.2 + 0.01)) for c in col), m.map_range(cB, 0.72, 1.0, 0.0, 0.30))
        nrm = m.bump(cR, strength=1.0, distance=float(G_.get('thread_m', 0.00048)) * 0.42)
        fuzz = m.noise(scale=9000, detail=3, roughness=0.7, vector=m.mapping(pos, scale=(1.0, 0.25, 1.0)))
        nrm = m.bump(fuzz, strength=0.5, distance=0.00003, normal=nrm)
        fold = m.noise(scale=1.0 / 0.16, detail=2.0, roughness=0.5, vector=pos)
        nrm = m.bump(fold, strength=1.0, distance=float(G_.get('cockle_m', 0.004)), normal=nrm)
        m.set(base_color=base, roughness=0.78, specular=0.25, sheen=0.6, sheen_roughness=0.5, normal=nrm)
    v = np.array([[-Wm / 2, -Hm / 2, 0], [Wm / 2, -Hm / 2, 0], [Wm / 2, Hm / 2, 0], [-Wm / 2, Hm / 2, 0]], float)
    C.mesh_from_arrays('ground', v, np.array([[0, 1, 2, 3]]), smooth=False, material=m,
                       uvs=np.array([[0, 0], [1, 0], [1, 1], [0, 1]], float))
    big = 5.0 * frame.W
    vb = np.array([[-big, -big, -0.0003], [big, -big, -0.0003], [big, big, -0.0003], [-big, big, -0.0003]], float)
    C.mesh_from_arrays('table', vb, np.array([[0, 1, 2, 3]]), smooth=False,
                       material=C.simple_material('table', tuple(col), 0.7))
    return files


# ============================================================================= camera + light
def topdown_camera(frame):
    cam = C._make_camera('cam', (0.0, 0.0, frame.D), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0), frame.lens,
                         clip=(0.3 * frame.D, 3.0 * frame.D))
    cam.data.dof.use_dof = False                                     # the whole plate is sharp
    return cam


def window_light(frame, P=None):
    """Top-down product light.  Irradiance budget on a white card at the frame centre (scene-linear,
    sums to LIGHT_E = 2.0):
      key     1.46  soft window from the upper-left (az 135 deg, el 42 deg), 16 x 11.5 deg seen from the
                    plate: soft directional shadows towards the lower-right, wrinkles still read
      kicker  0.22  small hard source next to the window: crisp glints on waxy / glossy crests and a
                    defined core in the contact shadows (too weak to make a hotspot on the paper)
      fill    0.26  very large, from the opposite side, DIFFUSE ONLY (invisible to glossy rays): opens
                    the shadows without a veiling reflection on dark paper or waxy skins
      ambient 0.06  even world
    Powers scale with frame.W^2, so exposure is the same for a 6 cm and a 1.5 m wide plate; the falloff
    across the frame is about +-9 %.  P (the shot's optional 'light' dict): key, kicker, fill, ambient
    multipliers; az, el (deg); size, dist (window width / distance in frame widths); key_color."""
    P = P or {}
    s = frame.W
    az = math.radians(float(P.get('az', 135.0)))
    el = math.radians(float(P.get('el', 42.0)))
    dist = float(P.get('dist', 10.0)) * s
    size = float(P.get('size', 2.8)) * s
    kcol = P.get('key_color', (1.0, 0.965, 0.915))

    def direction(a, e):
        return np.array([math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)])

    k = float(P.get('key', 1.0))
    key = C._area_light('key', tuple(direction(az, el) * dist), (0, 0, 0), size, 1.0, kcol, shape='RECTANGLE')
    key.data.size_y = size * 0.72
    key.data.energy = 15.64 * 1.36 * k * dist * dist * math.sin(math.radians(44.0)) / math.sin(el)
    kk = float(P.get('kicker', 1.0))
    if kk > 0:
        az2, el2 = az + math.radians(float(P.get('kicker_daz', -16.0))), math.radians(float(P.get('kicker_el', 50.0)))
        kl = C._area_light('kicker', tuple(direction(az2, el2) * dist), (0, 0, 0), float(P.get('kicker_size', 0.35)) * s, 1.0,
                           kcol, shape='DISK')
        kl.data.energy = 15.64 * 0.22 * kk * dist * dist * math.sin(math.radians(44.0)) / math.sin(el2)
    f = float(P.get('fill', 1.0))
    if f > 0:
        fl = C._area_light('fill', tuple(direction(az + math.pi, math.radians(62.0)) * 6.0 * s), (0, 0, 0), 7.0 * s, 1.0,
                           P.get('fill_color', (0.90, 0.95, 1.0)), shape='DISK')
        fl.data.energy = 15.67 * 0.26 * f * (6.0 * s) ** 2
        fl.visible_glossy = bool(P.get('fill_glossy', False))
    a = 1.2 * 0.06 * float(P.get('ambient', 1.0))
    C.world_gradient(horizon=(a * 0.6,) * 3, zenith=(a,) * 3, ground=(a * 0.3,) * 3)
    return key


# ============================================================================= dish meshes / materials
def _dish_materials(kind, seed):
    if kind == 'wood':
        m = C.Mat('dish_wood_%d' % seed)
        P = m.mapping(m.coords('Object'), scale=(1.0, 14.0, 14.0), rotation=(0.0, 0.0, 0.35 + seed))
        ringn = m.noise(scale=55, detail=4, roughness=0.6, distortion=0.6, vector=P)
        fine = m.noise(scale=1400, detail=3, roughness=0.6, vector=m.mapping(m.coords('Object'), scale=(0.12, 1.0, 1.0),
                                                                           rotation=(0.0, 0.0, 0.35 + seed)))
        col = m.ramp(ringn, [(0.30, (0.050, 0.022, 0.010)), (0.52, (0.105, 0.050, 0.022)), (0.72, (0.170, 0.088, 0.040))])
        col = m.mix(col, (0.035, 0.016, 0.008), m.map_range(fine, 0.60, 0.80, 0.0, 0.5))
        m.set(base_color=col, roughness=m.map_range(fine, 0.3, 0.8, 0.30, 0.50), specular=0.45, coat=0.30, coat_roughness=0.22,
              normal=m.bump(fine, 0.5, 0.00006))
        return m
    m = C.Mat('dish_celadon_%d' % seed, sss_method='BURLEY')
    n = m.noise(scale=30, detail=3, roughness=0.5)
    col = m.mix((0.36, 0.50, 0.40), (0.43, 0.56, 0.46), n)
    crack = m.voronoi(scale=260, feature='DISTANCE_TO_EDGE', randomness=1.0)
    col = m.mix(col, (0.16, 0.20, 0.15), m.math('MULTIPLY', m.map_range(crack, 0.0, 0.012, 1.0, 0.0), 0.35))
    m.set(base_color=col, roughness=0.10, specular=0.55, ior=1.52, sss=0.35, sss_radius=(0.5, 1.0, 0.6), sss_scale=0.0012,
          coat=0.6, coat_roughness=0.04, normal=m.bump(m.noise(scale=90, detail=2), 0.25, 0.00012))
    return m


def build_dishes(dishes):
    centres, profs, kinds = dishes
    for i, ((dx, dy), pr) in enumerate(zip(centres, profs)):
        nv = 256
        ph = np.linspace(0, 2 * math.pi, nv, endpoint=False)[None, :]
        r, z = pr[:, 0][:, None], pr[:, 1][:, None]
        v = np.stack([r * np.cos(ph) + dx, r * np.sin(ph) + dy, z * np.ones_like(ph)], -1).reshape(-1, 3)
        C.mesh_from_arrays('dish%d' % i, v, C.grid_faces(len(pr), nv, wrap_v=True), smooth=True,
                           material=_dish_materials(kinds[i % len(kinds)], i))


# ============================================================================= 2-D plan (no render)
def draw_plan(frame, place, sets, res, path, px=1920, ground=(60, 60, 60), boxes=None, window=None):
    """Schematic top view of the settled layout (oriented ellipses shaded by height) - a 2 s check of
    legibility / clear zones before spending render time."""
    Hp = int(px / ASPECT)
    im = np.zeros((Hp, px, 3), np.uint8)
    im[:] = ground[::-1]
    pal = [(40, 40, 200), (230, 230, 225), (60, 150, 230), (60, 190, 120), (200, 120, 60), (170, 70, 170)]
    s = px / frame.W
    zmax = float(res['zc'].max()) + 1e-9 if len(place) else 1.0
    for i in np.argsort(res['zc']):
        S = sets[place.iset[i]]
        k = place.var[i]
        R = res['rot'][i]
        com = res['loc'][i] + R @ (S.com[k] * place.scale[i])
        ax = R @ np.array([math.cos(S.theta[k]), math.sin(S.theta[k]), 0.0])
        ang = math.degrees(math.atan2(-ax[1], ax[0]))
        cxp, cyp = (com[0] + frame.W / 2) * s, (frame.H / 2 - com[1]) * s
        a, b = S.a[k] * place.scale[i] * s, S.b[k] * place.scale[i] * s
        sh = 0.55 + 0.45 * res['zc'][i] / zmax
        c = tuple(int(v * sh) for v in pal[place.iset[i] % len(pal)])
        cv2.ellipse(im, (int(cxp * 16), int(cyp * 16)), (int(a * 16), int(b * 16)), ang, 0, 360, c, -1, cv2.LINE_AA, 4)
        cv2.ellipse(im, (int(cxp * 16), int(cyp * 16)), (int(a * 16), int(b * 16)), ang, 0, 360, (15, 15, 25), 1, cv2.LINE_AA, 4)
    for b in (boxes or []):
        cv2.rectangle(im, (int(b[0] * px), int(b[1] * Hp)), (int(b[2] * px), int(b[3] * Hp)), (0, 255, 255), 1)
    if window:
        u, v, w, h = window
        cv2.ellipse(im, (int(u * px), int(v * Hp)), (int(w * px / 2), int(h * Hp / 2)), 0, 0, 360, (0, 255, 255), 1)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    cv2.imwrite(path, im)
    return path


# ============================================================================= main
def parse_cli(argv=None):
    if argv is None:
        argv = sys.argv[1:]
        if '--' in argv:
            argv = argv[argv.index('--') + 1:]
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument('--shot', required=True)
    p.add_argument('--items', default=None, help='override the ingredient module(s): ID or ID,ID,.. (stand-in)')
    p.add_argument('--width', type=float, default=None, help='physical frame width in metres (overrides the table)')
    p.add_argument('--empty', action='store_true', help='render the ground only (same paper, no items)')
    p.add_argument('--plan', default=None, help='write a 2-D schematic of the layout to this PNG')
    p.add_argument('--plan-only', action='store_true', help='stop after the plan (no render)')
    p.add_argument('--jpg', default=None, help='also write an 8-bit JPEG preview (<= 1920 px wide)')
    p.add_argument('--text', default=None, help='override the glyph string of a glyph/landing shot')
    p.add_argument('--ground', default=None, help="override the ground: a type name (paper|slate|walnut|linen) or a JSON dict")
    p.add_argument('--set', action='append', default=[], help='override a layout parameter: key=json (repeatable)')
    a, rest = p.parse_known_args(argv)
    return a, rest


def main(argv=None):
    cli, rest = parse_cli(argv)
    shot = load_shot_b(cli.shot)
    args = C.parse_args(rest, seed=int(shot.get('seed', 1)))
    if args.quality == 'final' and not args.res and shot.get('final_res'):
        args.q['res'] = tuple(shot['final_res'])
    layout = shot['layout']
    P = dict(shot.get('params', {}))
    for kv in cli.set:
        k, v = kv.split('=', 1)
        P[k] = json.loads(v)
    if cli.ground:
        g = json.loads(cli.ground) if cli.ground.strip().startswith('{') else dict(type=cli.ground)
        shot['ground'] = dict(shot.get('ground', {}), **g)
    exposure = float(shot.get('exposure', 0.0))
    scene = C.setup_scene(args, look=shot.get('look', 'AgX - Punchy'), exposure=exposure)
    scene.render.film_transparent = False
    rng = np.random.default_rng(1000 + args.seed)
    t_build = time.time()

    if layout == 'bespoke':
        # hook for b02_cabinet / b04_bowl: a small separate script builds the whole scene and renders;
        # it gets (cli, args, shot) and may use Frame / build_ground / window_light / topdown_camera.
        path = os.path.join(HERE, shot['script'])
        if not os.path.exists(path):
            raise SystemExit('%s is a bespoke scene and %s is not written yet (hook: build_and_render(cli, args, shot, '
                             'flatlay_module))' % (shot['id'], path))
        spec = importlib.util.spec_from_file_location('ysty_bespoke', path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.build_and_render(cli, args, shot, sys.modules[__name__])

    # ---- ingredients
    src = shot.get('source') or []
    src = [src] if isinstance(src, str) else list(src)
    standin = None
    if cli.items:
        over = cli.items.split(',')
        standin = over
        src = [over[i % len(over)] for i in range(max(len(src), len(over)))]
    sets = []
    width = float(shot['frame_width_m'])
    if not cli.empty:
        cache = {}
        for i, sid in enumerate(src):
            if sid in cache:
                sets.append(cache[sid])
                continue
            if shot.get('optional_sources') and not standin and not os.path.exists(os.path.join(SHOT_DIR, sid + '.py')):
                print('[items] %s not written yet - skipped (optional source)' % sid)
                continue
            S = ItemSet(sid, seed=0)
            cache[sid] = S
            sets.append(S)
        if not sets:
            raise SystemExit('no ingredient module available for %s' % shot['id'])
        # the table's width was chosen for an assumed item size; follow the real one when it differs
        assumed = shot.get('item_mm')
        if assumed and cli.width is None and not shot.get('lock_width'):
            assumed = assumed if isinstance(assumed, (list, tuple)) else [assumed]
            ratios = [sets[i].L * 1e3 / float(assumed[i % len(assumed)]) for i in range(len(sets))]
            k = float(np.median(ratios)) if layout != 'glyph' and layout != 'landing' else ratios[0]
            if layout in ('glyph', 'landing') and shot.get('size_by', 'width') == 'width':
                aw = shot.get('item_w_mm')                         # legibility is governed by the item WIDTH
                if aw:
                    k = sets[0].Wd * 1e3 / float(aw)
            if abs(k - 1.0) > 0.15:
                print('[frame] item size differs from the table (x%.2f): frame width %.3f -> %.3f m' % (k, width, width * k))
                width *= k
    if cli.width:
        width = cli.width
    frame = Frame(width)
    print('[frame] %s  layout=%s  %.3f x %.3f m  camera %.2f m above, %d mm' % (shot['id'], layout, frame.W, frame.H,
                                                                              frame.D, int(frame.lens)))

    # ---- layout + settle
    meta = dict(shot=shot['id'], layout=layout, frame_width_m=frame.W, frame_height_m=frame.H, items=[s.id for s in sets],
                seed=args.seed, empty=bool(cli.empty))
    place, res, extra = Placement(0), None, {}
    if not cli.empty:
        if layout == 'wreath':
            place, extra = layout_wreath(frame, sets, P, rng)
        elif layout in ('glyph', 'landing'):
            place, extra = layout_glyph(frame, sets, P, rng, cli.text or shot['text'], seed=args.seed)
        elif layout == 'taiji':
            place, extra = layout_taiji(frame, sets, P, rng)
        elif layout == 'dishes':
            place, extra = layout_dishes(frame, sets, P, rng)
        else:
            raise SystemExit('unknown layout %r' % layout)
        res = settle(place, sets, extra['extent'], rng, base=extra.get('base'), candidates=extra.get('candidates', 1),
                     allowed=extra.get('allowed'), tilt=bool(P.get('tilt', True)), sink=float(P.get('sink', 0.05)))
        meta.update(extra.get('info', {}))
        meta['n_items'] = int(len(place))
        meta['layers_max'] = int(res['layer'].max()) if len(place) else 0
        meta['heap_top_mm'] = float(res['hf'].H.max() * 1e3)
        if cli.plan:
            gcol = shot.get('ground', {}).get('colour', [60, 60, 60])
            draw_plan(frame, place, sets, res, cli.plan, ground=tuple(int(v) for v in gcol),
                      boxes=meta.get('char_boxes'), window=meta.get('window'))
            print('[plan]', cli.plan)
        if cli.plan_only:
            return meta
        for si, S in enumerate(sets):
            if S in sets[:si]:
                continue
            sel = np.array([sets[j] is S for j in place.iset], bool) if len(place) else np.zeros(0, bool)
            if not sel.any():
                continue
            n = int(sel.sum())
            attrs = {'inst_rand': rng.random(n)}
            for nm, fn in S.inst_attrs.items():
                attrs[nm] = np.asarray(fn(rng, n), np.float32)
            scl = res['scale'][sel] * S.user_scale
            C.instance_on_points('items_%d_%s' % (si, S.id), S.objects, loc=res['loc'][sel],
                                 quat=C._quat_from_matrix(res['rot'][sel]), scale=scl, var=place.var[sel], attrs=attrs)
        if extra.get('dishes'):
            build_dishes(extra['dishes'])

    # ---- ground, camera, light
    Lmax = max([s.L for s in sets], default=0.0)
    margin = max(0.06 * frame.W, 1.6 * Lmax)
    tex_px = int(np.clip(1.25 * args.q['res'][0], 2400, 5200))
    tmp_files = build_ground(frame, shot.get('ground', {}), exposure, args.seed, tex_px, margin, shot['id'])
    topdown_camera(frame)
    window_light(frame, shot.get('light'))
    print('[build] %.1f s' % (time.time() - t_build))

    # ---- render
    r = C.render(args)
    meta['render_seconds'] = round(r['seconds'], 1)
    meta['resolution'] = list(args.q['res'])
    for f in tmp_files:
        try:
            os.remove(f)
        except OSError:
            pass
    if not args.region:
        with open(os.path.splitext(args.out)[0] + '_layout.json', 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=1)
    if cli.jpg:
        im = cv2.imread(args.out, cv2.IMREAD_UNCHANGED)[..., :3]
        im = (im / 257.0 + 0.5).astype(np.uint8) if im.dtype == np.uint16 else im
        if args.region:
            x0, y0, x1, y1 = args.region
            hh, ww = im.shape[:2]
            im = im[int(y0 * hh):int(y1 * hh), int(x0 * ww):int(x1 * ww)]
        if im.shape[1] > 1920:
            im = cv2.resize(im, (1920, int(round(im.shape[0] * 1920.0 / im.shape[1]))), interpolation=cv2.INTER_AREA)
        os.makedirs(os.path.dirname(os.path.abspath(cli.jpg)), exist_ok=True)
        cv2.imwrite(cli.jpg, im, [cv2.IMWRITE_JPEG_QUALITY, 93])
        print('[jpg]', cli.jpg)
    return meta


if __name__ == '__main__':
    main()
