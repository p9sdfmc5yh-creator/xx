# -*- coding: utf-8 -*-
"""common.py - shared photoreal rendering foundation for the film 《药食同源》.

Every ingredient shot is ONE Cycles still (RGBA, transparent sky) of real-world-scale
geometry (units = METRES) framed as a "planet horizon".  The 2D compositor adds sky,
text and a slow push-in afterwards.

Quick tour (see README.md for the recipe and templates):

    import common as C
    args  = C.parse_args()                      # --quality --out --region --threads --seed ...
    scene = C.setup_scene(args)                 # Cycles CPU, AgX, OIDN, transparent film
    sol   = C.planet_solve(R=0.30)              # pure maths: where the camera goes, what it sees
    heap  = C.pack_heap(R=0.30, extent=sol['patch'], shapes=[(a, b, c), ...], seed=args.seed)
    C.instance_on_points('heap', variant_objects, heap)
    cam, info = C.planet_camera(heap.R_top)     # camera fitted to the real top of the heap
    C.auto_dof(cam, info)
    C.studio_lights(info, tint=(1.0, 0.9, 0.8))
    C.render(args)                              # png (+ _depth.npy at final quality)
    C.quick_comp(args.out, 'm02_gouqi', '/path/preview.jpg')

Conventions
  * +Z is up (gravity), the camera sits on the -Y side and looks towards +Y.
  * A "planet" is a sphere of radius R centred on `center` (default origin); only a small cap
    around the top (+Z pole) is visible, so only that cap has to be populated.
  * Item meshes: long axis = local X, width = local Y, thickness = local Z, centred on origin.
"""
import os
os.environ.setdefault('OPENCV_IO_ENABLE_OPENEXR', '1')
import sys, time, json, math, argparse, struct, warnings
import numpy as np

warnings.filterwarnings('ignore', category=DeprecationWarning)

import bpy                                                     # noqa: E402
from mathutils import Matrix, Vector                           # noqa: E402

# ----------------------------------------------------------------------------- paths / constants
HERE = os.path.dirname(os.path.abspath(__file__))
FILM_DIR = os.path.dirname(HERE)
SHOTS_JSON = os.path.join(FILM_DIR, 'shots.json')
RENDER_DIR = os.path.join(FILM_DIR, 'renders')
SCRATCH = os.environ.get('YSTY_SCRATCH',
                         '/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad')
REF_DIR = os.path.join(SCRATCH, 'ref')
FONT_DIR = os.path.join(SCRATCH, 'fonts')
PREVIEW_DIR = os.path.join(SCRATCH, 'previews')

FILM_W, FILM_H = 1920, 1080
FINAL_W, FINAL_H = 2112, 1188          # film frame x 1.1 (compositor pushes in and downsamples)
SENSOR_MM = 36.0

# Framing contract (fractions of frame height, measured from the top)
APEX_RANGE = (0.50, 0.56)
EDGE_RANGE = (0.62, 0.74)
SKY_LIMIT = 0.47

# Quality presets: resolution, max samples, adaptive noise threshold, adaptive min samples.
# Timings measured on the 4-core CPU box are listed in README.md.
QUALITY = {
    'draft':   dict(res=(960, 540),   spp=16,  thr=0.10, min_spp=8),
    'preview': dict(res=(1280, 720),  spp=40,  thr=0.05, min_spp=16),
    'final':   dict(res=(FINAL_W, FINAL_H), spp=128, thr=0.015, min_spp=48),
}


# ============================================================================= a. CLI + scene
def parse_args(argv=None, **defaults):
    """Parse the common shot command line.

    --quality draft|preview|final   preset (see QUALITY)
    --out PATH                      output PNG (16-bit RGBA, straight alpha)
    --region x0,y0,x1,y1            border render, fractions of the frame, origin TOP-LEFT
                                    (image convention).  The PNG keeps the full frame size.
    --threads N                     CPU threads (default 4)
    --seed N                        random seed for the shot (default 1)
    --spp N / --res WxH             override preset samples / resolution (e.g. look at a final-density
                                    crop cheaply: --quality draft --res 2112x1188 --region ...)
    --depth                         also write <out>_depth.npy (always on at final quality, full frame)
    --comp PATH                     the shot may write its quick_comp preview here
    --no-denoise                    skip OIDN (to judge raw noise)

    Works both for `python shot.py ...` (bpy module) and `blender -b -P shot.py -- ...`.
    `defaults` override argparse defaults, e.g. parse_args(out='/x/y.png').
    """
    if argv is None:
        argv = sys.argv[1:]
        if '--' in argv:
            argv = argv[argv.index('--') + 1:]
    p = argparse.ArgumentParser(description='ysty shot renderer')
    p.add_argument('--quality', choices=list(QUALITY), default='draft')
    p.add_argument('--out', default=None)
    p.add_argument('--region', default=None)
    p.add_argument('--threads', type=int, default=4)
    p.add_argument('--seed', type=int, default=1)
    p.add_argument('--spp', type=int, default=None)
    p.add_argument('--res', default=None)
    p.add_argument('--depth', action='store_true')
    p.add_argument('--comp', default=None)
    p.add_argument('--no-denoise', dest='denoise', action='store_false')
    p.set_defaults(**defaults)
    a = p.parse_args(argv)
    q = dict(QUALITY[a.quality])
    if a.res:
        w, h = a.res.lower().split('x')
        q['res'] = (int(w), int(h))
    if a.spp:
        q['spp'] = a.spp
        q['min_spp'] = min(q['min_spp'], a.spp)
    a.q = q
    if a.region:
        a.region = tuple(float(v) for v in a.region.split(','))
        assert len(a.region) == 4, '--region needs x0,y0,x1,y1'
    if a.out is None:
        a.out = os.path.join(SCRATCH, 'tmp_render', 'out_%s.png' % a.quality)
    a.out = os.path.abspath(a.out)
    return a


def setup_scene(args, look='AgX - Punchy', exposure=0.0):
    """Reset to an empty factory scene and configure Cycles for photoreal stills.

    * Cycles CPU, `args.threads` threads, adaptive sampling, light-path limits tuned for food
      (SSS + glossy; no caustics), indirect clamp against fireflies.
    * film_transparent=True: the still is foreground RGBA only.
    * OpenImageDenoise, albedo+normal guides, accurate prefilter, high quality.
    * AgX view transform.  `look` = 'AgX - Punchy' gives rich, natural food colour (measured: a
      saturated red keeps its chroma; base AgX looks washed out).  Use 'AgX - Medium High Contrast'
      for pale subjects if Punchy crushes the shadows.  `exposure` in stops.
    * 16-bit RGBA PNG output.
    Returns the scene.
    """
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    q = args.q
    r = sc.render
    r.engine = 'CYCLES'
    r.resolution_x, r.resolution_y = q['res']
    r.resolution_percentage = 100
    r.film_transparent = True
    r.threads_mode = 'FIXED'
    r.threads = max(1, int(args.threads))
    r.use_persistent_data = False
    r.filter_size = 1.5
    c = sc.cycles
    c.device = 'CPU'
    c.samples = q['spp']
    c.use_adaptive_sampling = True
    c.adaptive_threshold = q['thr']
    c.adaptive_min_samples = q['min_spp']
    c.max_bounces = 8
    c.diffuse_bounces = 3
    c.glossy_bounces = 4
    c.transmission_bounces = 8
    c.transparent_max_bounces = 8
    c.volume_bounces = 0
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.blur_glossy = 0.5
    c.sample_clamp_direct = 0.0
    c.sample_clamp_indirect = 6.0
    c.use_denoising = bool(args.denoise)
    if args.denoise:
        c.denoiser = 'OPENIMAGEDENOISE'
        c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
        c.denoising_prefilter = 'ACCURATE' if args.quality == 'final' else 'FAST'
        try:
            c.denoising_quality = 'HIGH' if args.quality == 'final' else 'BALANCED'
        except Exception:
            pass
    c.seed = int(args.seed)
    if args.region:
        x0, y0, x1, y1 = args.region
        r.use_border = True
        r.use_crop_to_border = False
        r.border_min_x, r.border_max_x = x0, x1
        r.border_min_y, r.border_max_y = 1.0 - y1, 1.0 - y0
    vs = sc.view_settings
    vs.view_transform = 'AgX'
    try:
        vs.look = look
    except Exception:
        vs.look = 'None'
    vs.exposure = exposure
    vs.gamma = 1.0
    sc.display_settings.display_device = 'sRGB'
    _png_settings(sc)
    sc.view_layers[0].use_pass_z = True
    sc.unit_settings.system = 'METRIC'
    return sc


def _png_settings(sc):
    ims = sc.render.image_settings
    try:
        ims.media_type = 'IMAGE'
    except Exception:
        pass
    ims.file_format = 'PNG'
    ims.color_mode = 'RGBA'
    ims.color_depth = '16'
    ims.compression = 30


def render(args, scene=None, depth=None):
    """Render the still described by the scene and write it to args.out (16-bit RGBA PNG).

    At --quality final (or with --depth / depth=True) a camera-space depth map is written next
    to it as <out_basename>_depth.npy: float32, shape (H, W), metres along the camera axis
    (planar Z, not ray length), **0.0 where there is no geometry** (use the PNG alpha as mask).
    Returns dict(out=..., depth=..., seconds=...).
    """
    sc = scene or bpy.context.scene
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    want_depth = (args.quality == 'final' and not args.region) or args.depth or bool(depth)
    t0 = time.time()
    bpy.ops.render.render(write_still=False)
    secs = time.time() - t0
    rr = bpy.data.images['Render Result']
    _png_settings(sc)
    rr.save_render(args.out, scene=sc)
    res = dict(out=args.out, depth=None, seconds=secs)
    if want_depth:
        tmp = os.path.splitext(args.out)[0] + '_tmp_passes.exr'
        ims = sc.render.image_settings
        try:
            ims.media_type = 'MULTI_LAYER_IMAGE'
            ims.file_format = 'OPEN_EXR_MULTILAYER'
            ims.exr_codec = 'NONE'
            ims.color_depth = '32'
            rr.save_render(tmp, scene=sc)
            ch = read_exr(tmp)
            key = [k for k in ch if k.endswith('Depth.Z') or k.endswith('.Z') or k == 'Z']
            z = ch[key[0]].astype(np.float32)
            z[~np.isfinite(z) | (z > 1e9)] = 0.0
            dpath = os.path.splitext(args.out)[0] + '_depth.npy'
            np.save(dpath, z)
            res['depth'] = dpath
        finally:
            _png_settings(sc)
            if os.path.exists(tmp):
                os.remove(tmp)
    print('[render] %s  %dx%d  spp<=%d  %.1f s%s' % (args.out, sc.render.resolution_x, sc.render.resolution_y,
                                                    sc.cycles.samples, secs,
                                                    ('  depth=' + res['depth']) if res['depth'] else ''))
    return res


def read_exr(path):
    """Minimal reader for UNCOMPRESSED scanline OpenEXR (as written by render()).
    Returns {channel_name: float32 array (H, W)}."""
    with open(path, 'rb') as f:
        d = f.read()
    assert struct.unpack_from('<I', d, 0)[0] == 20000630, 'not an EXR'
    flags = struct.unpack_from('<I', d, 4)[0]
    multipart = bool(flags & 0x1000)
    pos = 8

    def cstr(p):
        e = d.index(b'\0', p)
        return d[p:e].decode('latin1'), e + 1

    headers = []
    while True:
        hdr = {}
        while d[pos] != 0:
            name, pos = cstr(pos)
            typ, pos = cstr(pos)
            size = struct.unpack_from('<i', d, pos)[0]
            pos += 4
            hdr[name] = d[pos:pos + size]
            pos += size
        pos += 1
        headers.append(hdr)
        if not multipart:
            break
        if d[pos] == 0:
            pos += 1
            break
    out = {}
    tables = []
    for hdr in headers:
        assert hdr['compression'][0] == 0, 'EXR must be uncompressed'
        xmin, ymin, xmax, ymax = struct.unpack('<4i', hdr['dataWindow'])
        w, h = xmax - xmin + 1, ymax - ymin + 1
        chans = []
        cp = 0
        cl = hdr['channels']
        while cl[cp] != 0:
            e = cl.index(b'\0', cp)
            nm = cl[cp:e].decode('latin1')
            ptype = struct.unpack_from('<i', cl, e + 1)[0]
            chans.append((nm, ptype))
            cp = e + 1 + 16
        offs = np.frombuffer(d, '<u8', h, pos)
        pos += 8 * h
        tables.append((offs, w, h, ymin, chans))
    for offs, w, h, ymin, chans in tables:
        dts = {0: ('<u4', 4), 1: ('<f2', 2), 2: ('<f4', 4)}
        arrs = {nm: np.zeros((h, w), np.float32) for nm, _ in chans}
        for o in offs:
            o = int(o) + (4 if multipart else 0)
            y, _size = struct.unpack_from('<2i', d, o)
            p = o + 8
            for nm, pt in chans:
                dt, bs = dts[pt]
                arrs[nm][y - ymin] = np.frombuffer(d, dt, w, p)
                p += w * bs
        out.update(arrs)
    return out


# ============================================================================= b. framing
def _f_px(lens_mm, W):
    return W * lens_mm / SENSOR_MM


def planet_solve(R, lens_mm=85.0, apex=0.53, edge=0.68, limb_past_pole_deg=5.0,
                 center=(0.0, 0.0, 0.0), aspect=FILM_W / FILM_H):
    """Pure maths (no bpy objects): camera placement so that a sphere of radius R centred on
    `center` projects to the planet-horizon arc: silhouette apex at y = apex*H (x = W/2) and
    silhouette at the left/right frame edges at y = edge*H.

    `limb_past_pole_deg`: the visible limb (horizon) point lies this many degrees beyond the
    top pole (+Z), i.e. we look across the very top of the dome where items rest under gravity.

    Returns a dict:
      D          camera distance from the sphere centre          alpha   angular radius of sphere
      pitch      angle between optical axis and line to centre   cam_pos, cam_fwd, cam_up (world)
      limb_dist  camera distance to the horizon apex point       near_dist  distance to the surface
                                                                 seen at the bottom frame edge
      focus_dist suggested focus distance (0.42 of the way from limb to near)
      patch      (xmin, xmax, ymin, ymax) world rectangle (relative to centre, generous margin)
                 that contains everything the camera sees on the sphere: populate at least this.
      scale      visible width of the scene at the limb in metres (for light sizes)
    """
    from scipy.optimize import brentq
    R = float(R)
    hw = SENSOR_MM / 2.0 / lens_mm                 # tan(half horizontal fov)
    hh = hw / aspect
    py_apex = (0.5 - apex) * 2.0 * hh              # image-plane y (focal length = 1), up positive
    py_edge = (0.5 - edge) * 2.0 * hh

    def edge_y(alpha):
        phi = alpha - math.atan(py_apex)
        ca, sp, cp = math.cos(alpha), math.sin(phi), math.cos(phi)
        # (-py*sp + cp)^2 = ca^2 (hw^2 + py^2 + 1)  -> quadratic in py, take the upper root
        A = sp * sp - ca * ca
        B = -2.0 * sp * cp
        Cc = cp * cp - ca * ca * (hw * hw + 1.0)
        disc = B * B - 4 * A * Cc
        if disc < 0:
            return -10.0
        r1 = (-B + math.sqrt(disc)) / (2 * A)
        r2 = (-B - math.sqrt(disc)) / (2 * A)
        cands = [r for r in (r1, r2) if (-r * sp + cp) > 0]
        return max(cands) if cands else -10.0

    alpha = brentq(lambda a: edge_y(a) - py_edge, math.radians(3), math.radians(85))
    phi = alpha - math.atan(py_apex)
    D = R / math.sin(alpha)
    theta_c = (math.pi / 2 - alpha) - math.radians(limb_past_pole_deg)   # camera polar angle (towards -Y)
    C0 = np.array(center, float)
    n_c = np.array([0.0, -math.sin(theta_c), math.cos(theta_c)])
    cam_pos = C0 + D * n_c
    to_c = -n_c
    # rotate `to_c` about +X by +phi (tilts the optical axis upwards, away from the centre)
    cph, sph = math.cos(phi), math.sin(phi)
    fwd = np.array([0.0, to_c[1] * cph - to_c[2] * sph, to_c[1] * sph + to_c[2] * cph])
    up = np.array([0.0, -fwd[2], fwd[1]])
    if up[2] < 0:
        up = -up
    right = np.array([1.0, 0.0, 0.0])
    # visible patch: cast a grid of rays through the frame, intersect with the sphere
    xs = np.linspace(-hw, hw, 41)
    ys = np.linspace(-hh, py_apex + 0.02 * hh, 41)
    gx, gy = np.meshgrid(xs, ys)
    dirs = gx[..., None] * right + gy[..., None] * up + fwd
    dirs /= np.linalg.norm(dirs, axis=-1, keepdims=True)
    oc = cam_pos - C0
    b = dirs @ oc
    disc = b * b - (oc @ oc - R * R)
    hit = disc > 0
    t = -b - np.sqrt(np.where(hit, disc, 0))
    P = oc + dirs * t[..., None]
    P = P[hit]
    limb_dist = D * math.cos(alpha)
    near_dist = float(t[0][hit[0]].min()) if hit[0].any() else float(t[hit].min())
    mx = 0.10 * (P[:, 0].max() - P[:, 0].min())
    # silhouette / far side: extend beyond the limb so items behind the horizon exist
    limb_y = float(R * math.sin(math.radians(limb_past_pole_deg)))
    ymax = max(P[:, 1].max(), limb_y) + 0.16 * R
    patch = (float(P[:, 0].min() - mx), float(P[:, 0].max() + mx), float(P[:, 1].min() - mx), float(ymax))
    scale = 2.0 * hw * limb_dist
    return dict(R=R, lens_mm=lens_mm, apex=apex, edge=edge, D=D, alpha=alpha, pitch=phi, theta_c=theta_c,
                center=tuple(C0), cam_pos=cam_pos, cam_fwd=fwd, cam_up=up, limb_dist=limb_dist,
                near_dist=near_dist, focus_dist=limb_dist - 0.42 * (limb_dist - near_dist),
                patch=patch, scale=scale, kind='planet',
                target=tuple(C0 + np.array([0, R * math.sin(math.radians(-2.0)), R])))


def _make_camera(name, pos, fwd, up, lens_mm, clip=(0.01, 100.0)):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens_mm
    cd.sensor_width = SENSOR_MM
    cd.sensor_fit = 'HORIZONTAL'
    cd.clip_start, cd.clip_end = clip
    cam = bpy.data.objects.new(name, cd)
    f = np.array(fwd, float)
    f /= np.linalg.norm(f)
    u = np.array(up, float)
    r = np.cross(f, u)
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    M = Matrix(((r[0], u[0], -f[0], pos[0]),
                (r[1], u[1], -f[1], pos[1]),
                (r[2], u[2], -f[2], pos[2]),
                (0, 0, 0, 1)))
    cam.matrix_world = M
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def fit_planet_radius(heap, lens_mm=85.0, apex=0.53, edge=0.68, limb_past_pole_deg=5.0, top_margin=0.015,
                      aspect=FILM_W / FILM_H):
    """Find the sphere radius R_fit for planet_solve such that the HIGHEST bump of the heap's real
    surface (its heightfield), seen within the central 60 % of the frame width, projects to
    y = (apex - top_margin) * H.  The mean horizon then sits around `apex` and the sky above
    stays empty.  Pure maths (bisection over planet_solve + point projection)."""
    C0 = np.array(heap.center, float)
    st = max(1, int(min(heap.height.shape) / 400))
    X, Y = np.meshgrid(heap.gx[::st] - C0[0], heap.gy[::st] - C0[1])
    Z = heap.height[::st, ::st] - C0[2]
    xmin, xmax, ymin, ymax = heap.extent
    keep = (X > xmin) & (X < xmax) & (Y > ymin) & (Y < ymax)
    P = np.stack([X[keep], Y[keep], Z[keep]], 1) + C0
    hw = SENSOR_MM / 2.0 / lens_mm
    hh = hw / aspect
    target = apex - top_margin

    def top_y(Rf):
        sol = planet_solve(Rf, lens_mm, apex, edge, limb_past_pole_deg, heap.center, aspect)
        v = P - sol['cam_pos']
        z = v @ sol['cam_fwd']
        x = v[:, 0] / z / hw                       # -1..1 across the frame
        y = 0.5 - (v @ sol['cam_up']) / z / hh / 2  # fraction from the top
        m = (np.abs(x) < 0.6) & (z > 0)
        return float(y[m].min())

    lo, hi = heap.R_base * 0.98, heap.R_base + 4.0 * (heap.R_top - heap.R_base) + 0.02 * heap.R_base
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        if top_y(mid) < target:        # heap pokes too high -> pretend the planet is bigger
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def planet_camera(R=None, lens_mm=85.0, apex=0.53, edge=0.68, limb_past_pole_deg=5.0, center=(0.0, 0.0, 0.0),
                  heap=None, top_margin=0.015):
    """Create + activate a camera so that a sphere (dome / mound) of radius R centred on `center`
    projects to the planet-horizon arc (see planet_solve for parameters and the info dict).

    For heaps pass `heap=<Heap from pack_heap>` instead of R: the radius is then fitted to the
    real bumpy surface (fit_planet_radius) so the highest item in the central 60 % of the width
    lands at (apex - top_margin) * H - inside the contract regardless of heap thickness.
    Returns (camera_object, info).  Verified by rendering a plain sphere: apex 0.528 / edges 0.674
    for the requested 0.53 / 0.68."""
    sc = bpy.context.scene
    aspect = sc.render.resolution_x / sc.render.resolution_y
    if heap is not None:
        center = heap.center
        R = fit_planet_radius(heap, lens_mm, apex, edge, limb_past_pole_deg, top_margin, aspect)
    info = planet_solve(R, lens_mm, apex, edge, limb_past_pole_deg, center, aspect)
    cam = _make_camera('cam', info['cam_pos'], info['cam_fwd'], info['cam_up'], lens_mm,
                       clip=(info['near_dist'] * 0.2, info['D'] * 6))
    return cam, info


def disc_solve(radius, elevation_deg=25.0, lens_mm=85.0, apex=0.53, edge=0.68, center=(0.0, 0.0, 0.0),
               aspect=FILM_W / FILM_H):
    """Pure maths for disc shots: a flat disc (the cut face) of `radius` lies in the XY plane at
    z = center.z; the camera looks across it from the -Y side, `elevation_deg` above the plane,
    and the FAR rim (y = +radius) becomes the horizon arc: apex at y = apex*H, rim at the frame
    edges at y = edge*H.  Solves the camera distance and pitch numerically.
    Larger elevation = flatter curve needs the camera closer; valid range about 12-45 deg.
    Info dict as planet_solve (patch = visible rectangle on the disc plane, far rim included).
    """
    from scipy.optimize import fsolve
    r = float(radius)
    hw = SENSOR_MM / 2.0 / lens_mm
    hh = hw / aspect
    py_apex = (0.5 - apex) * 2.0 * hh
    py_edge = (0.5 - edge) * 2.0 * hh
    e = math.radians(elevation_deg)
    C0 = np.array(center, float)
    F = np.array([0.0, r, 0.0])
    tt = np.linspace(-math.pi / 2, math.pi / 2, 2001)
    rim = np.stack([r * np.sin(tt), r * np.cos(tt), 0 * tt], 1)

    def cam_of(d, pitch):
        pos = F + d * np.array([0.0, -math.cos(e), math.sin(e)])
        ang = -e + pitch                                    # optical axis elevation angle
        fwd = np.array([0.0, math.cos(ang), math.sin(ang)])
        up = np.array([0.0, -math.sin(ang), math.cos(ang)])
        return pos, fwd, up

    def proj(pts, pos, fwd, up):
        v = pts - pos
        z = v @ fwd
        return v[:, 0] / z, (v @ up) / z, z

    def resid(p):
        d, pitch = abs(p[0]) * r, p[1]
        pos, fwd, up = cam_of(d, pitch)
        x, y, z = proj(rim, pos, fwd, up)
        ya = y[len(y) // 2]
        k = np.argmin(np.abs(x[len(x) // 2:] - hw)) + len(x) // 2
        return [ya - py_apex, (y[k] - py_edge) + 5.0 * (x[k] - hw)]

    best = None
    for d0 in (1.2, 2.0, 3.0, 0.8, 4.5):
        sol, _, ok, _ = fsolve(resid, [d0, 0.1], full_output=True)
        if ok == 1 and max(abs(v) for v in resid(sol)) < 1e-4:
            best = sol
            break
    if best is None:
        raise RuntimeError('disc_solve: no solution; change elevation_deg (try 18-35) or lens_mm')
    d, pitch = abs(best[0]) * r, best[1]
    pos, fwd, up = cam_of(d, pitch)
    right = np.array([1.0, 0.0, 0.0])
    xs = np.linspace(-hw, hw, 41)
    ys = np.linspace(-hh, py_apex, 41)
    gx, gy = np.meshgrid(xs, ys)
    dirs = gx[..., None] * right + gy[..., None] * up + fwd
    t = -pos[2] / dirs[..., 2]
    P = pos + dirs * t[..., None]
    ok = (t > 0) & (np.hypot(P[..., 0], P[..., 1]) <= r * 1.001)
    P = P[ok]
    near = float((t * np.linalg.norm(dirs, axis=-1))[ok].min())
    m = 0.06 * r
    patch = (float(P[:, 0].min() - m), float(P[:, 0].max() + m), float(P[:, 1].min() - m), float(r + m))
    return dict(R=r, lens_mm=lens_mm, apex=apex, edge=edge, D=d, pitch=pitch, elevation=e,
                center=tuple(C0), cam_pos=pos + C0, cam_fwd=fwd, cam_up=up, limb_dist=d, near_dist=near,
                focus_dist=d - 0.42 * (d - near), patch=patch, scale=2.0 * hw * d, kind='disc',
                target=tuple(C0 + np.array([0.0, 0.75 * r, 0.0])))


def disc_camera(radius, elevation_deg=25.0, lens_mm=85.0, apex=0.53, edge=0.68, center=(0.0, 0.0, 0.0)):
    """Create + activate the camera for a disc shot (see disc_solve).  Build the slice as a
    cylinder/lathe whose TOP face is the plane z = center.z, radius `radius`, axis +Z, with real
    thickness below; the far rim (peel/skin) is the horizon.  Irregular outlines: pass the mean
    far-rim radius and check with check_framing().  Returns (camera_object, info)."""
    sc = bpy.context.scene
    info = disc_solve(radius, elevation_deg, lens_mm, apex, edge, center,
                      sc.render.resolution_x / sc.render.resolution_y)
    cam = _make_camera('cam', info['cam_pos'], info['cam_fwd'], info['cam_up'], lens_mm,
                       clip=(info['near_dist'] * 0.2, info['D'] * 8))
    return cam, info


def set_dof(cam, focus_dist, fstop):
    """Thin-lens depth of field: focus distance in metres, aperture as f-number."""
    d = cam.data.dof
    d.use_dof = True
    d.focus_distance = float(focus_dist)
    d.aperture_fstop = float(fstop)
    d.aperture_blades = 0


def blur_px(cam_or_lens, focus_dist, dist, fstop, width_px=FINAL_W):
    """Diameter in pixels of the defocus blur disc of a point at `dist` metres when focused at
    `focus_dist` (Cycles' model: lens disc of diameter f/N, rays converge on the focus plane)."""
    f = (cam_or_lens.data.lens if hasattr(cam_or_lens, 'data') else cam_or_lens) / 1000.0
    return (f / fstop) * abs(1.0 / focus_dist - 1.0 / dist) * (width_px * f / (SENSOR_MM / 1000.0))


def auto_dof(cam, info, near_blur_px=7.0, far_blur_px=3.0, focus_frac=None, width_px=FINAL_W):
    """Photographic but detail-preserving DOF.  The f-stop is solved so that the defocus blur disc
    diameter is <= near_blur_px at the bottom frame edge (nearest foreground) and <= far_blur_px
    at the horizon (pixels at 2112 px width; scale-free, so drafts look the same).  Focus sits
    where both limits are met with the widest aperture, or at `focus_frac` of the way from the
    horizon (0) to the nearest visible point (1) when given.
    A real macro lens could never be this deep - fine: we keep the LOOK of a lens (soft nearest
    foreground, slightly soft far limb) while the main body of the subject stays crisp.
    near 6-10 px / far 2.5-4 px keep fine detail everywhere (12/5 already looks soft in the
    mid-ground).  Returns (focus_dist, fstop)."""
    far, near = float(info['limb_dist']), float(info['near_dist'])
    f = cam.data.lens / 1000.0
    if focus_frac is None:
        inv = (near_blur_px * (1 / far) + far_blur_px * (1 / near)) / (near_blur_px + far_blur_px)
        sf = 1.0 / inv
    else:
        sf = far - focus_frac * (far - near)
    k = f * (width_px * f / (SENSOR_MM / 1000.0))
    fstop = max(k * abs(1 / sf - 1 / near) / near_blur_px, k * abs(1 / sf - 1 / far) / far_blur_px, 1.0)
    set_dof(cam, sf, fstop)
    return sf, fstop


def check_framing(png_path, verbose=True):
    """Measure the framing contract on a rendered RGBA still (alpha silhouette).
    Returns dict(apex, edge_left, edge_right, sky_clear, bottom_filled, ok) with apex/edge as
    fractions of H from the top.  Contract: apex in [0.50, 0.56] near x = W/2, edges in
    [0.62, 0.74], nothing above 0.47 H in the central 60 % of the width, bottom row opaque."""
    import cv2
    im = cv2.imread(png_path, cv2.IMREAD_UNCHANGED)
    a = im[..., 3].astype(np.float32) / (65535.0 if im.dtype == np.uint16 else 255.0)
    H, W = a.shape
    solid = a > 0.5

    def top(col_lo, col_hi):
        rows = np.where(solid[:, col_lo:col_hi].any(axis=1))[0]
        return (rows[0] / H) if len(rows) else 1.0

    def top_med(col_lo, col_hi):
        cols = solid[:, col_lo:col_hi]
        first = np.where(cols.any(axis=0), cols.argmax(axis=0), H)
        return float(np.median(first)) / H

    c0, c1 = int(0.40 * W), int(0.60 * W)
    res = dict(apex=top(c0, c1), apex_median=top_med(c0, c1),
               edge_left=top_med(0, max(2, int(0.02 * W))), edge_right=top_med(W - max(2, int(0.02 * W)), W),
               sky_clear=bool(a[:int(SKY_LIMIT * H), int(0.2 * W):int(0.8 * W)].max() < 0.02),
               bottom_filled=bool(a[int(0.93 * H):, :].min() > 0.98))
    res['ok'] = bool(APEX_RANGE[0] <= res['apex'] <= APEX_RANGE[1]
                     and EDGE_RANGE[0] <= res['edge_left'] <= EDGE_RANGE[1]
                     and EDGE_RANGE[0] <= res['edge_right'] <= EDGE_RANGE[1]
                     and res['sky_clear'] and res['bottom_filled'])
    if verbose:
        print('[framing] apex=%.3f (median %.3f)  edges=%.3f/%.3f  sky_clear=%s  bottom_filled=%s  -> %s' % (
            res['apex'], res['apex_median'], res['edge_left'], res['edge_right'], res['sky_clear'],
            res['bottom_filled'], 'OK' if res['ok'] else 'OUT OF CONTRACT'))
    return res


# ============================================================================= c. lighting
def _area_light(name, pos, target, size, power, color, spread=math.pi, shape='DISK'):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = shape
    ld.size = size
    if shape in ('RECTANGLE', 'ELLIPSE'):
        ld.size_y = size
    ld.energy = power
    ld.color = color[:3]
    try:
        ld.spread = spread
    except Exception:
        pass
    ob = bpy.data.objects.new(name, ld)
    p = Vector(pos)
    d = (Vector(target) - p).normalized()
    ob.matrix_world = Matrix.Translation(p) @ d.to_track_quat('-Z', 'Y').to_matrix().to_4x4()
    bpy.context.scene.collection.objects.link(ob)
    return ob


def studio_lights(info=None, target=None, scale=None, tint=(1.0, 1.0, 1.0), key=1.0, fill=1.0, rim=1.0,
                  world=1.0, key_az=-50.0, key_el=42.0, key_size=1.3, key_color=(1.0, 0.96, 0.90),
                  fill_color=(0.92, 0.96, 1.0), rim_az=62.0, top=0.0):
    """Food-photography rig for a horizon shot (camera on -Y looking +Y).  All sizes/powers are
    derived from `scale` (= visible scene width in metres, info['scale']) so exposure is the same
    for a 2 cm millet patch and a 60 cm cinnamon heap.

      key   large soft source, 3/4 BACK-left and above.  Azimuths are measured from the +Y axis
            (straight behind the subject) towards +X: -50 = back-left, +62 = back-right, 180 = at
            the camera; key_el = elevation in degrees.  Back light makes wrinkles,
            pores and translucency read and puts speculars on crests facing the camera.
      fill  very large, dim, from the camera side, slightly right and above: opens the shadows.
      rim   small harder kicker from back-right (rim_az), low: outlines the horizon silhouette.
      top   optional overhead soft box multiplier (0 = off) for flat cut faces (disc shots).
      world dim vertical gradient (never visible: film is transparent), tinted.

    `tint` (rgb) multiplies fill, rim and world so the foreground harmonises with the shot's sky;
    the key stays near-white (photographic).  key/fill/rim/world/top are strength MULTIPLIERS on
    calibrated defaults (see README for measured values).  Returns dict of light objects.
    """
    if info is not None:
        target = target or info['target']
        scale = scale or info['scale']
    assert target is not None and scale is not None
    T = np.array(target, float)
    s = float(scale)
    tint = np.array(tint[:3], float)
    k2 = s * s                                   # power ~ distance^2 for constant irradiance

    def pos(az, el, dist):
        a, e = math.radians(az), math.radians(el)
        return T + dist * s * np.array([math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)])

    L = {}
    if key > 0:
        L['key'] = _area_light('key', pos(key_az, key_el, 2.6), T, key_size * s, 320.0 * key * k2, key_color)
    if fill > 0:
        L['fill'] = _area_light('fill', pos(165.0, 28.0, 3.0), T, 3.2 * s, 70.0 * fill * k2,
                                tuple(np.array(fill_color) * tint))
    if rim > 0:
        L['rim'] = _area_light('rim', pos(rim_az, 16.0, 2.8), T, 0.6 * s, 130.0 * rim * k2,
                               tuple(np.array((1.0, 0.95, 0.88)) * (0.5 + 0.5 * tint)))
    if top > 0:
        L['top'] = _area_light('top', pos(0.0, 86.0, 2.4), T, 2.0 * s, 200.0 * top * k2, key_color)
    world_gradient(horizon=tuple(0.050 * world * tint), zenith=tuple(0.11 * world * (0.4 + 0.6 * tint)),
                   ground=tuple(0.012 * world * tint))
    return L


def world_gradient(horizon=(0.05, 0.05, 0.05), zenith=(0.1, 0.1, 0.1), ground=(0.01, 0.01, 0.01), strength=1.0):
    """Dim three-stop vertical gradient world (lights the scene softly; invisible with transparent film)."""
    sc = bpy.context.scene
    w = bpy.data.worlds.new('world')
    w.use_nodes = True
    sc.world = w
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mr = nt.nodes.new('ShaderNodeMapRange')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    bg = nt.nodes.new('ShaderNodeBackground')
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs[2], mr.inputs[0])
    mr.inputs[1].default_value, mr.inputs[2].default_value = -1.0, 1.0
    nt.links.new(mr.outputs[0], ramp.inputs[0])
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.42, tuple(ground) + (1,)
    el[1].position, el[1].color = 0.52, tuple(horizon) + (1,)
    e = el.new(1.0)
    e.color = tuple(zenith) + (1,)
    nt.links.new(ramp.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = strength
    nt.links.new(bg.outputs[0], out.inputs[0])
    return w


# ============================================================================= d. heap packing
class Heap(object):
    """Result of pack_heap: per-item transforms as numpy arrays.
      loc (N,3) world position   quat (N,4) rotation (w,x,y,z)   scale (N,3)   var (N,) variant index
      rand (N,) uniform 0-1 per item   R_base, R_top (outer envelope radius: give it to planet_camera)
      height (ny,nx) final heightfield (world z), gx, gy its grid axes (world x / y)."""
    def __init__(self, **kw):
        self.__dict__.update(kw)

    def __len__(self):
        return len(self.loc)


def _quat_from_matrix(m):
    """(N,3,3) rotation matrices -> (N,4) quaternions (w,x,y,z)."""
    m = np.asarray(m, float)
    q = np.empty(m.shape[:-2] + (4,))
    t = m[..., 0, 0] + m[..., 1, 1] + m[..., 2, 2]
    q[..., 0] = np.sqrt(np.maximum(0.0, 1 + t)) / 2
    q[..., 1] = np.sqrt(np.maximum(0.0, 1 + m[..., 0, 0] - m[..., 1, 1] - m[..., 2, 2])) / 2
    q[..., 2] = np.sqrt(np.maximum(0.0, 1 - m[..., 0, 0] + m[..., 1, 1] - m[..., 2, 2])) / 2
    q[..., 3] = np.sqrt(np.maximum(0.0, 1 - m[..., 0, 0] - m[..., 1, 1] + m[..., 2, 2])) / 2
    q[..., 1] = np.copysign(q[..., 1], m[..., 2, 1] - m[..., 1, 2])
    q[..., 2] = np.copysign(q[..., 2], m[..., 0, 2] - m[..., 2, 0])
    q[..., 3] = np.copysign(q[..., 3], m[..., 1, 0] - m[..., 0, 1])
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def _rot_axis(axis, ang):
    c, s = math.cos(ang), math.sin(ang)
    if axis == 0:
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == 1:
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def pack_heap(R, extent, shapes, layers=3.0, coverage=0.72, seed=0, weights=None,
              scale_range=(0.88, 1.12), tilt_deg=8.0, roll_deg=20.0, flip=False, candidates=5,
              sink=0.12, max_slope_deg=55.0, grid_res=None, center=(0.0, 0.0, 0.0), count=None,
              rough=0.0, verbose=True):
    """Deterministic "drop & settle on a heightfield" deposition over a spherical dome - a heap
    without physics simulation.

    R        radius of the bare dome the items are dropped on (metres), centred on `center`.
    extent   (xmin, xmax, ymin, ymax) rectangle (relative to centre) to populate - use
             planet_solve(...)['patch'].
    shapes   list of K bounding half-sizes (a, b, c) in metres, one per mesh variant:
             a = half length (local X), b = half width (local Y), c = half thickness (local Z).
             Sphere-like items: a = b = c.  The collision proxy is this ellipsoid, so give the
             TIGHT half-sizes of the mesh (slightly smaller than the bounding box is fine).
    layers   mean number of item layers;  coverage = area fraction one layer covers (0.6-0.8).
             Item count = layers * coverage * area / mean_footprint unless `count` is given.
    weights  optional probabilities per variant.
    scale_range  uniform per-item size jitter.
    tilt_deg     random extra tilt (std-dev) on top of resting on the local slope.
    roll_deg     random roll about the item's long axis (std-dev); flip=True also turns half the
                 items upside down (for slices with two different faces).
    candidates   each item tries this many nearby drop positions and keeps the lowest ("rolls
                 into the hollow") -> dense, even heap instead of towers.  1 = pure random drop.
    sink     fraction of the half thickness an item is pushed down after resting (0.1-0.2 hides
             the gap between a wrinkled mesh and its ellipsoid proxy; 0 = touching proxies).
    rough    amplitude (metres) of a broad random undulation of the base dome so the horizon is
             not a perfect arc (try 0.3-0.6 x item length).
    grid_res heightfield cell size (default min(c)/3).

    Each item: random yaw; rests where its tilted ellipsoid first touches the current heightfield;
    oriented to the least-squares plane of the heightfield under its footprint (clamped to
    max_slope_deg) plus random tilt/roll; then stamped into the heightfield (exact upper surface
    of the rotated ellipsoid).  Items therefore never interpenetrate by more than `sink`.
    Returns a Heap.  Speed: ~25 us x candidates per item (300k grains x 2 candidates = ~1 min).
    """
    rng = np.random.default_rng(seed)
    shapes = np.atleast_2d(np.asarray(shapes, float))
    K = len(shapes)
    xmin, xmax, ymin, ymax = [float(v) for v in extent]
    C0 = np.array(center, float)
    res = float(grid_res or shapes[:, 2].min() / 3.0)
    amax = float(shapes.max() * scale_range[1])
    pad = amax * 1.5
    gx = np.arange(xmin - pad, xmax + pad + res, res)
    gy = np.arange(ymin - pad, ymax + pad + res, res)
    nx, ny = len(gx), len(gy)
    if nx * ny > 40e6:
        raise ValueError('heightfield %dx%d too large - raise grid_res or shrink the extent' % (nx, ny))
    X, Y = np.meshgrid(gx, gy)
    base = np.sqrt(np.maximum(R * R - X * X - Y * Y, 1e-12))
    if rough > 0:
        from scipy.ndimage import gaussian_filter
        n = rng.normal(size=(ny // 8 + 2, nx // 8 + 2))
        sig = max(1.0, amax * 1.2 / (res * 8))
        n = gaussian_filter(n, sig)
        n = n / (n.std() + 1e-9)
        import cv2
        base = base + rough * cv2.resize(n.astype(np.float32), (nx, ny), interpolation=cv2.INTER_CUBIC)
    Hf = base.copy()
    area = (xmax - xmin) * (ymax - ymin)
    w = np.ones(K) / K if weights is None else np.asarray(weights, float) / np.sum(weights)
    smean = 0.5 * (scale_range[0] + scale_range[1])
    foot = float(np.sum(w * math.pi * shapes[:, 0] * shapes[:, 1]) * smean ** 2)
    N = int(count or round(layers * coverage * area / foot))
    # low-discrepancy (R2) base positions -> even coverage, layer after layer
    g = 1.32471795724474602596
    i = np.arange(1, N + 1)
    px = xmin + ((0.5 + i / g) % 1.0) * (xmax - xmin)
    py = ymin + ((0.5 + i / (g * g)) % 1.0) * (ymax - ymin)
    var = rng.choice(K, size=N, p=w)
    scl = rng.uniform(scale_range[0], scale_range[1], N)
    loc = np.zeros((N, 3))
    rot = np.zeros((N, 3, 3))
    tmax = math.tan(math.radians(max_slope_deg))
    t0 = time.time()
    for n in range(N):
        a, b, c = shapes[var[n]] * scl[n]
        jit = 0.9 * a
        best = None
        for k in range(max(1, candidates)):
            x = px[n] + (rng.uniform(-jit, jit) if k else 0.0)
            y = py[n] + (rng.uniform(-jit, jit) if k else 0.0)
            x = min(max(x, xmin), xmax)
            y = min(max(y, ymin), ymax)
            yaw = rng.uniform(0, 2 * math.pi)
            ix, iy = int((x - gx[0]) / res), int((y - gy[0]) / res)
            # --- local slope from a footprint-sized window
            hw_ = max(2, int(0.7 * a / res))
            win = Hf[iy - hw_:iy + hw_ + 1, ix - hw_:ix + hw_ + 1]
            if win.shape != (2 * hw_ + 1, 2 * hw_ + 1):
                continue
            dd = np.arange(-hw_, hw_ + 1) * res
            den = (dd * dd).sum() * len(dd)
            sx = float((win * dd[None, :]).sum() / den)
            sy = float((win * dd[:, None]).sum() / den)
            sl = math.hypot(sx, sy)
            if sl > tmax:
                sx, sy = sx * tmax / sl, sy * tmax / sl
            nrm = np.array([-sx, -sy, 1.0])
            nrm /= np.linalg.norm(nrm)
            # frame with z = nrm (minimal rotation from +Z)
            ax = np.cross([0, 0, 1.0], nrm)
            sa = np.linalg.norm(ax)
            if sa < 1e-9:
                Ra = np.eye(3)
            else:
                ax /= sa
                ang = math.asin(min(1.0, sa))
                Kx = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
                Ra = np.eye(3) + math.sin(ang) * Kx + (1 - math.cos(ang)) * (Kx @ Kx)
            roll = rng.normal(0, math.radians(roll_deg)) + (math.pi if (flip and rng.random() < 0.5) else 0.0)
            pit = rng.normal(0, math.radians(tilt_deg))
            Rm = Ra @ _rot_axis(2, yaw) @ _rot_axis(1, pit) @ _rot_axis(0, roll)
            # --- exact lower/upper surface of the rotated ellipsoid over its bounding window
            S = Rm @ np.diag([a * a, b * b, c * c]) @ Rm.T
            ex, ey = math.sqrt(S[0, 0]), math.sqrt(S[1, 1])
            jx, jy = int(ex / res) + 1, int(ey / res) + 1
            x0, y0 = ix - jx, iy - jy
            sub = Hf[y0:y0 + 2 * jy + 1, x0:x0 + 2 * jx + 1]
            if sub.shape != (2 * jy + 1, 2 * jx + 1):
                continue
            ux = gx[x0:x0 + 2 * jx + 1] - x
            uy = gy[y0:y0 + 2 * jy + 1] - y
            A = np.linalg.inv(S)
            Bq = A[0, 2] * ux[None, :] + A[1, 2] * uy[:, None]
            Cq = A[0, 0] * ux[None, :] ** 2 + 2 * A[0, 1] * ux[None, :] * uy[:, None] + A[1, 1] * uy[:, None] ** 2 - 1.0
            disc = Bq * Bq - A[2, 2] * Cq
            ok = disc > 0
            if not ok.any():
                continue
            sq = np.sqrt(np.where(ok, disc, 0.0))
            zlo = (-Bq - sq) / A[2, 2]
            zhi = (-Bq + sq) / A[2, 2]
            zc = float(np.max(np.where(ok, sub - zlo, -1e9)))
            off = zc - float(base[iy, ix])
            if best is None or off < best[0]:
                best = (off, x, y, zc, Rm, ok, zhi, x0, y0, jx, jy, c)
        if best is None:
            loc[n] = (px[n], py[n], -1e3)
            rot[n] = np.eye(3)
            continue
        off, x, y, zc, Rm, ok, zhi, x0, y0, jx, jy, c = best
        zc -= sink * c
        sub = Hf[y0:y0 + 2 * jy + 1, x0:x0 + 2 * jx + 1]
        np.maximum(sub, np.where(ok, zc + zhi, -1e9), out=sub)
        loc[n] = (x, y, zc)
        rot[n] = Rm
    keep = loc[:, 2] > -1e2
    loc, rot, var, scl = loc[keep], rot[keep], var[keep], scl[keep]
    # outer envelope radius: high percentile of the radial height of the surface over the patch
    inner = (X > xmin) & (X < xmax) & (Y > ymin) & (Y < ymax)
    rad = np.sqrt(X * X + Y * Y + Hf * Hf)[inner]
    R_top = float(np.percentile(rad, 90))
    if verbose:
        print('[pack_heap] %d items, grid %dx%d @ %.2f mm, R_base=%.4f R_top=%.4f (+%.1f mm), %.1f s' % (
            len(loc), nx, ny, res * 1e3, R, R_top, (R_top - R) * 1e3, time.time() - t0))
    return Heap(loc=loc + C0, quat=_quat_from_matrix(rot), rot=rot, scale=np.repeat(scl[:, None], 3, 1),
                var=var.astype(np.int32), rand=rng.random(len(loc)), R_base=float(R), R_top=R_top,
                height=Hf + C0[2], gx=gx + C0[0], gy=gy + C0[1], center=tuple(C0), extent=tuple(extent))


def dome_base(R, material=None, center=(0.0, 0.0, 0.0), cap_deg=75.0, segments=192, name='dome_base'):
    """Smooth spherical cap under a heap: guarantees an opaque frame bottom and plugs any hole
    between items.  Give it a dark, matte material in the colour of the items in deep shadow, and a
    radius slightly below the heap's R_base (e.g. R_base - 0.5 * item thickness)."""
    nu, nv = 48, segments
    th = np.linspace(0, math.radians(cap_deg), nu)[:, None]
    ph = np.linspace(0, 2 * math.pi, nv, endpoint=False)[None, :]
    v = np.stack([R * np.sin(th) * np.cos(ph), R * np.sin(th) * np.sin(ph), R * np.cos(th) * np.ones_like(ph)], -1)
    v = v.reshape(-1, 3) + np.array(center)
    ob = mesh_from_arrays(name, v, grid_faces(nu, nv, wrap_v=True)[:, ::-1], smooth=True, material=material)
    return ob


# ============================================================================= e. instancing
def variants_collection(objects, name='variants'):
    """Move variant objects into a collection that is excluded from direct rendering (they only
    appear through instance_on_points).  Variant order = sorted by object name, so name them
    'xxx_000', 'xxx_001', ... (make_variant_names does it).  Returns the collection."""
    sc = bpy.context.scene
    col = bpy.data.collections.new(name)
    sc.collection.children.link(col)
    for i, ob in enumerate(objects):
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        ob.name = '%s_%03d' % (name, i)
        col.objects.link(ob)
    for vl in sc.view_layers:
        lc = vl.layer_collection.children.get(col.name)
        if lc is not None:
            lc.exclude = True
    return col


def instance_on_points(name, variants, heap=None, loc=None, quat=None, scale=None, var=None, attrs=None,
                       collection_name=None):
    """Instance K variant objects over N transforms with a geometry-nodes "Instance on Points"
    modifier (true Cycles instancing: 200k instances of 3 meshes render in < 3 s with ~0.7 GB).

    variants  list of mesh objects (or an existing collection from variants_collection()).
    heap      a Heap (or pass loc (N,3), quat (N,4 wxyz), scale (N,3) or (N,), var (N,) explicitly).
    attrs     optional {name: (N,) float array or (N,3) vector/colour array}: per-instance values.
              In shaders read them with Mat.attr(name, 'INSTANCER'); `inst_rand` (uniform 0-1) is
              always written.  Object Info > Random (Mat.obj_random()) is also unique per instance.
    Returns the instancer object.
    """
    if heap is not None:
        loc, quat, scale, var = heap.loc, heap.quat, heap.scale, heap.var
        base_rand = heap.rand
    else:
        base_rand = np.random.default_rng(len(loc)).random(len(loc))
    N = len(loc)
    scale = np.asarray(scale, np.float32)
    if scale.ndim == 1:
        scale = np.repeat(scale[:, None], 3, 1)
    col = variants if isinstance(variants, bpy.types.Collection) else variants_collection(
        variants, collection_name or (name + '_variants'))
    me = bpy.data.meshes.new(name + '_pts')
    me.vertices.add(N)
    me.vertices.foreach_set('co', np.asarray(loc, np.float32).ravel())
    a = me.attributes.new('inst_rot', 'QUATERNION', 'POINT')
    a.data.foreach_set('value', np.asarray(quat, np.float32).ravel())
    a = me.attributes.new('inst_scale', 'FLOAT_VECTOR', 'POINT')
    a.data.foreach_set('vector', scale.ravel())
    a = me.attributes.new('inst_var', 'INT', 'POINT')
    a.data.foreach_set('value', np.asarray(var if var is not None else np.zeros(N), np.int32))
    allat = {'inst_rand': base_rand}
    allat.update(attrs or {})
    for k, v in allat.items():
        v = np.asarray(v, np.float32)
        if v.ndim == 1:
            a = me.attributes.new(k, 'FLOAT', 'POINT')
            a.data.foreach_set('value', v)
        else:
            a = me.attributes.new(k, 'FLOAT_VECTOR', 'POINT')
            a.data.foreach_set('vector', v[:, :3].ravel())
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ng = bpy.data.node_groups.new(name + '_gn', 'GeometryNodeTree')
    ng.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    nd = ng.nodes
    gi, go = nd.new('NodeGroupInput'), nd.new('NodeGroupOutput')
    iop = nd.new('GeometryNodeInstanceOnPoints')
    ci = nd.new('GeometryNodeCollectionInfo')
    ci.inputs['Collection'].default_value = col
    ci.inputs['Separate Children'].default_value = True
    ci.inputs['Reset Children'].default_value = True

    def named(nm, dt):
        x = nd.new('GeometryNodeInputNamedAttribute')
        x.data_type = dt
        x.inputs['Name'].default_value = nm
        return x.outputs['Attribute']

    L = ng.links.new
    L(gi.outputs[0], iop.inputs['Points'])
    L(ci.outputs[0], iop.inputs['Instance'])
    iop.inputs['Pick Instance'].default_value = True
    L(named('inst_var', 'INT'), iop.inputs['Instance Index'])
    L(named('inst_rot', 'QUATERNION'), iop.inputs['Rotation'])
    L(named('inst_scale', 'FLOAT_VECTOR'), iop.inputs['Scale'])
    L(iop.outputs[0], go.inputs[0])
    md = ob.modifiers.new('instances', 'NODES')
    md.node_group = ng
    return ob


# ============================================================================= f. mesh + noise
def grid_faces(nu, nv, wrap_v=True, wrap_u=False):
    """Quad index array (M,4) for a vertex grid of nu rows x nv columns stored row-major
    (index = iu * nv + iv).  wrap_v closes the columns (lathe), wrap_u closes the rows (torus)."""
    iu = np.arange(nu if wrap_u else nu - 1)
    iv = np.arange(nv if wrap_v else nv - 1)
    U, V = np.meshgrid(iu, iv, indexing='ij')
    U1, V1 = (U + 1) % nu, (V + 1) % nv
    return np.stack([U * nv + V, U * nv + V1, U1 * nv + V1, U1 * nv + V], -1).reshape(-1, 4)


def mesh_from_arrays(name, verts, faces, smooth=True, material=None, attrs=None, uvs=None,
                     face_mat=None, materials=None, link=True):
    """Build a mesh object from numpy arrays.
      verts (N,3) float;  faces (M,3) or (M,4) int array (or list of such arrays to mix tris/quads)
      attrs  {name: (N,) float or (N,3) colour-ish array} -> per-vertex attributes readable in
             shaders with Mat.attr(name) (e.g. a 'cavity' mask baked from your displacement).
      uvs    (N,2) per-vertex UVs (copied to face corners).
      materials list + face_mat (M,) material slot index per face, or a single `material`.
    Returns the object (linked to the scene collection unless link=False)."""
    me = bpy.data.meshes.new(name)
    verts = np.asarray(verts, np.float32)
    flist = faces if isinstance(faces, (list, tuple)) else [faces]
    flist = [np.asarray(f, np.int32) for f in flist if len(f)]
    nloops = sum(f.size for f in flist)
    nfaces = sum(len(f) for f in flist)
    me.vertices.add(len(verts))
    me.vertices.foreach_set('co', verts.ravel())
    me.loops.add(nloops)
    me.polygons.add(nfaces)
    lv = np.concatenate([f.ravel() for f in flist])
    ls, off = [], 0
    for f in flist:
        ls.append(off + np.arange(len(f), dtype=np.int32) * f.shape[1])
        off += f.size
    lt = np.concatenate([np.full(len(f), f.shape[1], np.int32) for f in flist])
    me.loops.foreach_set('vertex_index', lv)
    me.polygons.foreach_set('loop_start', np.concatenate(ls))
    me.polygons.foreach_set('loop_total', lt)
    if face_mat is not None:
        me.polygons.foreach_set('material_index', np.asarray(face_mat, np.int32))
    me.update(calc_edges=True)
    me.validate(verbose=False)
    if smooth:
        me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), bool))
    for k, v in (attrs or {}).items():
        v = np.asarray(v, np.float32)
        if v.ndim == 1:
            a = me.attributes.new(k, 'FLOAT', 'POINT')
            a.data.foreach_set('value', v)
        else:
            a = me.attributes.new(k, 'FLOAT_VECTOR', 'POINT')
            a.data.foreach_set('vector', v[:, :3].ravel())
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        idx = np.empty(len(me.loops), np.int32)
        me.loops.foreach_get('vertex_index', idx)
        uvl.data.foreach_set('uv', np.asarray(uvs, np.float32)[idx].ravel())
    for m in (materials or ([material] if material is not None else [])):
        me.materials.append(m.mat if isinstance(m, Mat) else m)
    ob = bpy.data.objects.new(name, me)
    if link:
        bpy.context.scene.collection.objects.link(ob)
    return ob


def vertex_normals(verts, faces):
    """Area-weighted vertex normals (N,3) of a tri/quad mesh given as numpy arrays."""
    v = np.asarray(verts, float)
    f = np.asarray(faces)
    n = np.zeros_like(v)
    if f.shape[1] == 4:
        fn = np.cross(v[f[:, 2]] - v[f[:, 0]], v[f[:, 3]] - v[f[:, 1]])
    else:
        fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    for k in range(f.shape[1]):
        np.add.at(n, f[:, k], fn)
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-20)


def lathe(profile_r, profile_x, nv=96, squash=(1.0, 1.0)):
    """Surface of revolution about the X axis.  profile_r / profile_x: (nu,) radius and axial
    position.  Returns (verts (nu*nv,3), faces (M,4), s (nu*nv,) 0..1 along the profile,
    phi (nu*nv,) angle).  squash = (y, z) cross-section scale.  Poles: let the radius go to ~0
    at the ends (a tiny hole there is invisible); or close with your own cap."""
    pr, pxs = np.asarray(profile_r, float), np.asarray(profile_x, float)
    nu = len(pr)
    ph = np.linspace(0, 2 * math.pi, nv, endpoint=False)
    Xg = np.repeat(pxs[:, None], nv, 1)
    Yg = pr[:, None] * np.cos(ph)[None, :] * squash[0]
    Zg = pr[:, None] * np.sin(ph)[None, :] * squash[1]
    v = np.stack([Xg, Yg, Zg], -1).reshape(-1, 3)
    s = np.repeat(np.linspace(0, 1, nu)[:, None], nv, 1).ravel()
    return v, grid_faces(nu, nv, wrap_v=True), s, np.repeat(ph[None, :], nu, 0).ravel()


def superellipsoid(a, b, c, nu=96, nv=96, e_long=1.0, e_round=1.0, taper=0.0):
    """Superellipsoid with half-sizes (a, b, c) along X/Y/Z, long axis X.  e_long < 1 = boxier ends,
    > 1 = pointier (spindle); e_round shapes the YZ cross-section; taper in [-1, 1] makes one end
    fatter (egg / seed shapes).  Returns (verts, faces, s, phi) like lathe()."""
    t = np.linspace(-math.pi / 2, math.pi / 2, nu)
    t[0] += 1e-3
    t[-1] -= 1e-3
    ph = np.linspace(0, 2 * math.pi, nv, endpoint=False)

    def sp(x, e):
        return np.sign(x) * np.abs(x) ** e

    ct, st = sp(np.cos(t), e_long), sp(np.sin(t), e_long)
    cp, spn = sp(np.cos(ph), e_round), sp(np.sin(ph), e_round)
    k = 1.0 + taper * st
    X = a * np.repeat(st[:, None], nv, 1)
    Y = b * (ct * k)[:, None] * cp[None, :]
    Z = c * (ct * k)[:, None] * spn[None, :]
    v = np.stack([X, Y, Z], -1).reshape(-1, 3)
    s = np.repeat(np.linspace(0, 1, nu)[:, None], nv, 1).ravel()
    return v, grid_faces(nu, nv, wrap_v=True), s, np.repeat(ph[None, :], nu, 0).ravel()


def tube(points, radii, nv=12):
    """Tube along a polyline (stems, rootlets, fibres).  points (n,3), radii scalar or (n,).
    Returns (verts, faces) with parallel-transported rings; ends are open (taper radius to ~0)."""
    P = np.asarray(points, float)
    n = len(P)
    r = np.broadcast_to(np.asarray(radii, float), (n,))
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-20
    ref = np.array([0.0, 0.0, 1.0]) if abs(T[0, 2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    N = np.cross(T[0], ref)
    N /= np.linalg.norm(N)
    ph = np.linspace(0, 2 * math.pi, nv, endpoint=False)
    rings = []
    for i in range(n):
        N = N - T[i] * (N @ T[i])
        N /= np.linalg.norm(N) + 1e-20
        B = np.cross(T[i], N)
        rings.append(P[i] + r[i] * (np.cos(ph)[:, None] * N + np.sin(ph)[:, None] * B))
    return np.concatenate(rings, 0), grid_faces(n, nv, wrap_v=True)


def merge_meshes(parts):
    """Concatenate [(verts, faces, material_slot), ...] -> (verts, [face arrays], face_mat) for
    mesh_from_arrays(..., materials=[...], face_mat=face_mat).  Faces of equal arity are grouped."""
    vs, fs, fm, off = [], [], [], 0
    for v, f, slot in parts:
        f = np.asarray(f)
        vs.append(np.asarray(v, float))
        fs.append(f + off)
        fm.append(np.full(len(f), slot, np.int32))
        off += len(v)
    return np.concatenate(vs, 0), fs, np.concatenate(fm)


def patch_grid(extent, R=None, n_max=1200, center=(0.0, 0.0, 0.0)):
    """Dense regular vertex grid over the rectangle `extent` = (xmin, xmax, ymin, ymax) (e.g.
    planet_solve / disc_solve ['patch']) - the canvas for 'surface' and 'disc' shots, where only
    the visible part of ONE big object needs geometry and it needs a lot of it.
      R = None : flat grid in the plane z = center.z (cut faces)
      R = float: grid draped over the top of the sphere of radius R (curved skins, leaves, peel)
    n_max = vertex count along the longer side (1200 -> ~1.2 M verts; cell ~ 1.5 px at final res).
    Returns (verts (ny*nx,3), faces (M,4), normals (ny*nx,3), shape (ny, nx)).  Displace with
    verts += normals * height(verts) using the numpy noise functions, then mesh_from_arrays()."""
    xmin, xmax, ymin, ymax = [float(v) for v in extent]
    cell = max(xmax - xmin, ymax - ymin) / float(n_max - 1)
    nx, ny = int(round((xmax - xmin) / cell)) + 1, int(round((ymax - ymin) / cell)) + 1
    X, Y = np.meshgrid(np.linspace(xmin, xmax, nx), np.linspace(ymin, ymax, ny))
    if R is None:
        Z = np.zeros_like(X)
        nrm = np.zeros((ny * nx, 3))
        nrm[:, 2] = 1.0
    else:
        Z = np.sqrt(np.maximum(R * R - X * X - Y * Y, 1e-12))
        nrm = np.stack([X, Y, Z], -1).reshape(-1, 3) / R
    v = np.stack([X, Y, Z], -1).reshape(-1, 3) + np.array(center, float)
    f = grid_faces(ny, nx, wrap_v=False)                      # counter-clockwise seen from +Z
    return v, f, nrm, (ny, nx)


def add_subdivision(ob, levels=1, simple=False):
    """Catmull-Clark (or simple) subdivision modifier evaluated at render time."""
    m = ob.modifiers.new('subd', 'SUBSURF')
    m.levels = m.render_levels = levels
    m.subdivision_type = 'SIMPLE' if simple else 'CATMULL_CLARK'
    return m


# ---- numpy noise --------------------------------------------------------------------------
def _hash3(ix, iy, iz, seed):
    h = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263 + iz.astype(np.int64) * 2147483647
         + np.int64(seed) * 1274126177) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = ((h ^ (h >> 16)) * 2246822519) & 0xFFFFFFFF
    return (h ^ (h >> 13)) & 0xFFFFFFFF


_GRAD3 = np.array([[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
                   [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [-1, 1, 0], [0, -1, 1], [0, -1, -1]], float)


def perlin3(p, seed=0):
    """Gradient (Perlin) noise at points p (...,3); output roughly in [-1, 1]."""
    p = np.asarray(p, float)
    i0 = np.floor(p).astype(np.int64)
    f = p - i0
    u = f * f * f * (f * (f * 6 - 15) + 10)
    out = 0.0
    for dx in (0, 1):
        wx = u[..., 0] if dx else 1 - u[..., 0]
        for dy in (0, 1):
            wy = u[..., 1] if dy else 1 - u[..., 1]
            for dz in (0, 1):
                wz = u[..., 2] if dz else 1 - u[..., 2]
                g = _GRAD3[_hash3(i0[..., 0] + dx, i0[..., 1] + dy, i0[..., 2] + dz, seed) & 15]
                d = g[..., 0] * (f[..., 0] - dx) + g[..., 1] * (f[..., 1] - dy) + g[..., 2] * (f[..., 2] - dz)
                out = out + wx * wy * wz * d
    return out * 1.05


def fbm3(p, octaves=5, lacunarity=2.0, gain=0.5, seed=0):
    """Fractal Brownian motion of perlin3; roughly [-1, 1].  Multiply p by a frequency first
    (p in metres * cycles-per-metre)."""
    p = np.asarray(p, float)
    amp, tot, out = 1.0, 0.0, 0.0
    for o in range(octaves):
        out = out + amp * perlin3(p, seed + 17 * o)
        tot += amp
        amp *= gain
        p = p * lacunarity
    return out / tot


def ridged3(p, octaves=5, lacunarity=2.0, gain=0.5, seed=0, sharp=1.0):
    """Ridged multifractal in [0, 1]: thin bright ridges (1) on a soft ground.  1 - ridged3 gives
    rounded pillows separated by sharp creases = the classic shrivel / wrinkle height field."""
    p = np.asarray(p, float)
    amp, tot, out = 1.0, 0.0, 0.0
    for o in range(octaves):
        n = 1.0 - np.abs(perlin3(p, seed + 31 * o))
        out = out + amp * n ** (2.0 * sharp)
        tot += amp
        amp *= gain
        p = p * lacunarity
    return out / tot


def cellular3(p, seed=0, jitter=1.0):
    """Worley / Voronoi noise on a unit lattice at points p (N,3).
    Returns (F1, F2, cell_id): distance to nearest and second nearest feature point and a
    uniform 0-1 id of the nearest cell.  F2 - F1 = cell borders (cracks, scales, pores)."""
    p = np.asarray(p, float).reshape(-1, 3)
    i0 = np.floor(p).astype(np.int64)
    f1 = np.full(len(p), 1e9)
    f2 = np.full(len(p), 1e9)
    cid = np.zeros(len(p))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cx, cy, cz = i0[:, 0] + dx, i0[:, 1] + dy, i0[:, 2] + dz
                h1 = _hash3(cx, cy, cz, seed)
                h2 = _hash3(cx, cy, cz, seed + 101)
                h3 = _hash3(cx, cy, cz, seed + 202)
                fp = np.stack([cx + 0.5 + jitter * (h1 / 4294967296.0 - 0.5),
                               cy + 0.5 + jitter * (h2 / 4294967296.0 - 0.5),
                               cz + 0.5 + jitter * (h3 / 4294967296.0 - 0.5)], 1)
                d = np.linalg.norm(p - fp, axis=1)
                closer = d < f1
                f2 = np.where(closer, f1, np.minimum(f2, d))
                cid = np.where(closer, h1 / 4294967296.0, cid)
                f1 = np.where(closer, d, f1)
    return f1, f2, cid


def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ============================================================================= g. materials
_PRINCIPLED_ALIASES = {
    'base_color': 'Base Color', 'color': 'Base Color', 'metallic': 'Metallic', 'roughness': 'Roughness',
    'ior': 'IOR', 'alpha': 'Alpha', 'normal': 'Normal', 'diffuse_roughness': 'Diffuse Roughness',
    'sss': 'Subsurface Weight', 'subsurface': 'Subsurface Weight', 'sss_weight': 'Subsurface Weight',
    'sss_radius': 'Subsurface Radius', 'sss_scale': 'Subsurface Scale', 'sss_ior': 'Subsurface IOR',
    'sss_anisotropy': 'Subsurface Anisotropy', 'specular': 'Specular IOR Level', 'specular_tint': 'Specular Tint',
    'anisotropic': 'Anisotropic', 'transmission': 'Transmission Weight', 'coat': 'Coat Weight',
    'coat_roughness': 'Coat Roughness', 'coat_ior': 'Coat IOR', 'coat_tint': 'Coat Tint',
    'coat_normal': 'Coat Normal', 'sheen': 'Sheen Weight', 'sheen_roughness': 'Sheen Roughness',
    'sheen_tint': 'Sheen Tint', 'emission': 'Emission Color', 'emission_strength': 'Emission Strength',
    'thin_film': 'Thin Film Thickness', 'tangent': 'Tangent',
}


class Mat(object):
    """Small node-building wrapper around one material with a Principled BSDF (Blender 5.x names).

        m = Mat('skin', sss_method='BURLEY')
        n = m.noise(scale=900, detail=4)                      # -> output socket (Fac)
        col = m.ramp(n, [(0.3, (0.5, 0.02, 0.01)), (0.7, (0.8, 0.10, 0.02))])
        m.set(base_color=col, roughness=0.35, sss=0.6, sss_radius=(1, 0.3, 0.1), sss_scale=0.002,
              normal=m.bump(n, strength=0.4, distance=0.0002))

    Every helper returns an OUTPUT SOCKET; any helper argument may be a socket or a constant.
    `m.mat` is the bpy material, `m.bsdf` the Principled node, `m.nt` the node tree.

    sss_method: 'BURLEY' (default: cheap, low noise, fine for opaque-ish flesh / grains /
    powders) or 'RANDOM_WALK' (true volumetric scattering: needed for thin, back-lit,
    translucent things - petals, lily scales, berries; roughly 1.3-2x render time).
    Subsurface Scale is in METRES at real-world scale: 0.0005-0.004 for food.
    """

    def __init__(self, name, sss_method='BURLEY', displacement='BUMP'):
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.nt = nt = self.mat.node_tree
        nt.nodes.clear()
        self.out = nt.nodes.new('ShaderNodeOutputMaterial')
        self.bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        self.bsdf.subsurface_method = sss_method
        try:
            self.bsdf.distribution = 'MULTI_GGX'
        except Exception:
            pass
        nt.links.new(self.bsdf.outputs[0], self.out.inputs['Surface'])
        try:
            self.mat.displacement_method = displacement
        except Exception:
            pass
        self._tc = None
        self._oi = None

    # -- generic plumbing
    def _in(self, sock, value):
        if value is None:
            return
        if isinstance(value, bpy.types.NodeSocket):
            self.nt.links.new(value, sock)
        else:
            try:
                sock.default_value = value
            except Exception:
                v = tuple(value)
                sock.default_value = (v + (1.0,)) if len(v) == 3 else v[:3]

    def node(self, type_, inputs=None, **props):
        """Create any shader node: m.node('ShaderNodeTexNoise', {'Scale': 5, 'Vector': v}, noise_dimensions='3D').
        `inputs` keys are socket names or indices; values constants or sockets.  Returns the node."""
        n = self.nt.nodes.new(type_)
        for k, v in props.items():
            setattr(n, k, v)
        for k, v in (inputs or {}).items():
            self._in(n.inputs[k], v)
        return n

    def set(self, **kw):
        """Set Principled inputs by alias (base_color, roughness, sss, sss_radius, sss_scale, coat,
        coat_roughness, sheen, transmission, specular, ior, normal, alpha, emission, ...) or by the
        exact socket name ('Coat Weight').  Values: constants or sockets."""
        for k, v in kw.items():
            name = _PRINCIPLED_ALIASES.get(k, k)
            self._in(self.bsdf.inputs[name], v)
        return self

    # -- coordinates / per-object values
    def coords(self, kind='Object'):
        """Texture coordinate output: 'Object' (metres, sticks to each instance), 'Generated', 'UV', 'Normal'."""
        if self._tc is None:
            self._tc = self.nt.nodes.new('ShaderNodeTexCoord')
        return self._tc.outputs[kind]

    def position(self):
        """World-space shading position (metres)."""
        return self.node('ShaderNodeNewGeometry').outputs['Position']

    def obj_random(self):
        """Object Info > Random: uniform 0-1, different for every instance."""
        if self._oi is None:
            self._oi = self.nt.nodes.new('ShaderNodeObjectInfo')
        return self._oi.outputs['Random']

    def attr(self, name, kind='GEOMETRY', output='Fac'):
        """Attribute node. kind='GEOMETRY' = per-vertex attribute of the mesh (mesh_from_arrays attrs),
        kind='INSTANCER' = per-instance attribute (instance_on_points attrs, e.g. 'inst_rand').
        output: 'Fac' (float), 'Color' or 'Vector'."""
        n = self.node('ShaderNodeAttribute', attribute_type=kind, attribute_name=name)
        for nm in ((output, 'Factor') if output == 'Fac' else (output,)):
            if nm in n.outputs:
                return n.outputs[nm]
        return n.outputs[0]

    def mapping(self, vector=None, scale=(1, 1, 1), location=(0, 0, 0), rotation=(0, 0, 0)):
        return self.node('ShaderNodeMapping', {'Vector': vector if vector is not None else self.coords(),
                                               'Location': location, 'Rotation': rotation, 'Scale': scale}).outputs[0]

    def per_instance_coords(self, kind='Object', spread=50.0):
        """Object coordinates shifted by a random per-instance offset so that instances of the same
        mesh variant do not share the same procedural texture pattern."""
        r = self.obj_random()
        off = self.node('ShaderNodeCombineXYZ', {0: self.math('MULTIPLY', r, spread),
                                                 1: self.math('MULTIPLY', r, spread * 1.7),
                                                 2: self.math('MULTIPLY', r, spread * 2.3)}).outputs[0]
        return self.node('ShaderNodeVectorMath', {0: self.coords(kind), 1: off}, operation='ADD').outputs[0]

    # -- textures (return sockets)
    def noise(self, scale=5.0, detail=3.0, roughness=0.5, distortion=0.0, vector=None, lacunarity=2.0,
              color=False, noise_type='FBM', w=None):
        """Noise texture (Fac 0-1, or Color).  scale is cycles per coordinate unit: with Object
        coordinates in metres use 200 (5 mm features) ... 20000 (0.05 mm micro grain)."""
        n = self.node('ShaderNodeTexNoise', {'Scale': scale, 'Detail': detail, 'Roughness': roughness,
                                             'Lacunarity': lacunarity, 'Distortion': distortion},
                      noise_dimensions='4D' if w is not None else '3D')
        try:
            n.noise_type = noise_type
        except Exception:
            pass
        self._in(n.inputs['Vector'], vector if vector is not None else self.coords())
        if w is not None:
            self._in(n.inputs['W'], w)
        return n.outputs[1] if color else n.outputs[0]

    def voronoi(self, scale=5.0, feature='F1', randomness=1.0, vector=None, output='Distance', smoothness=0.5,
                distance='EUCLIDEAN'):
        """Voronoi texture. feature: 'F1', 'F2', 'SMOOTH_F1', 'DISTANCE_TO_EDGE'; output: 'Distance', 'Color', 'Position'."""
        n = self.node('ShaderNodeTexVoronoi', {'Scale': scale, 'Randomness': randomness}, feature=feature,
                      distance=distance)
        if feature == 'SMOOTH_F1':
            n.inputs['Smoothness'].default_value = smoothness
        self._in(n.inputs['Vector'], vector if vector is not None else self.coords())
        return n.outputs[output]

    def wave(self, scale=5.0, distortion=0.0, detail=2.0, detail_scale=1.0, vector=None, wave_type='BANDS',
             direction='X', profile='SIN'):
        """Wave texture (bands or rings) -> Fac.  Good for fibres / growth rings / knife marks."""
        n = self.node('ShaderNodeTexWave', {'Scale': scale, 'Distortion': distortion, 'Detail': detail,
                                            'Detail Scale': detail_scale}, wave_type=wave_type, wave_profile=profile)
        if wave_type == 'BANDS':
            n.bands_direction = direction
        else:
            n.rings_direction = direction
        self._in(n.inputs['Vector'], vector if vector is not None else self.coords())
        return n.outputs['Fac'] if 'Fac' in n.outputs else n.outputs[1]

    # -- shaping
    def ramp(self, fac, stops, interpolation='LINEAR'):
        """Colour ramp.  stops = [(position, grey_or_rgb), ...] (2 or more).  Returns Color socket
        (usable as a float too).  interpolation: LINEAR | EASE | B_SPLINE | CARDINAL | CONSTANT."""
        n = self.node('ShaderNodeValToRGB', {0: fac})
        cr = n.color_ramp
        cr.interpolation = interpolation
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for e, (pos, col) in zip(cr.elements, sorted(stops, key=lambda s: s[0])):
            e.position = pos
            col = (col, col, col) if np.isscalar(col) else tuple(col)[:3]
            e.color = col + (1.0,)
        return n.outputs[0]

    def map_range(self, value, from_min=0.0, from_max=1.0, to_min=0.0, to_max=1.0, clamp=True, smooth=False):
        n = self.node('ShaderNodeMapRange', {0: value, 1: from_min, 2: from_max, 3: to_min, 4: to_max},
                      clamp=clamp, interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR')
        return n.outputs[0]

    def math(self, op, a, b=None, c=None, clamp=False):
        """Math node: op = ADD, SUBTRACT, MULTIPLY, DIVIDE, POWER, MINIMUM, MAXIMUM, GREATER_THAN, SMOOTH_MIN, ..."""
        n = self.node('ShaderNodeMath', {0: a}, operation=op, use_clamp=clamp)
        if b is not None:
            self._in(n.inputs[1], b)
        if c is not None:
            self._in(n.inputs[2], c)
        return n.outputs[0]

    def mix(self, a, b, fac=0.5, blend='MIX'):
        """Colour mix (blend = MIX, MULTIPLY, ADD, OVERLAY, SOFT_LIGHT, ...).  a, b colours/sockets."""
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type=blend, clamp_factor=True)
        self._in(n.inputs[0], fac)
        self._in(n.inputs[6], a)
        self._in(n.inputs[7], b)
        return n.outputs[2]

    def mixf(self, a, b, fac=0.5):
        """Float mix: a*(1-fac) + b*fac."""
        n = self.node('ShaderNodeMix', data_type='FLOAT', clamp_factor=True)
        self._in(n.inputs[0], fac)
        self._in(n.inputs[2], a)
        self._in(n.inputs[3], b)
        return n.outputs[0]

    def hsv(self, color, hue=0.5, saturation=1.0, value=1.0):
        """Hue/Saturation/Value. hue 0.5 = unchanged (+-0.02 = small hue shift)."""
        return self.node('ShaderNodeHueSaturation', {'Hue': hue, 'Saturation': saturation, 'Value': value,
                                                     'Color': color}).outputs[0]

    def jitter(self, color, hue=0.015, saturation=0.12, value=0.18, source=None):
        """Per-instance colour variation: random hue shift (+-hue), saturation and value scale
        (1 +- x) driven by Object Info Random (or `source` socket).  Uses three decorrelated hashes."""
        r = source if source is not None else self.obj_random()
        wn = self.node('ShaderNodeTexWhiteNoise', {'W': self.math('MULTIPLY', r, 913.7)}, noise_dimensions='1D')
        sep = self.node('ShaderNodeSeparateColor', {0: wn.outputs['Color']})
        h = self.map_range(sep.outputs[0], 0, 1, 0.5 - hue, 0.5 + hue)
        s = self.map_range(sep.outputs[1], 0, 1, 1 - saturation, 1 + saturation)
        v = self.map_range(sep.outputs[2], 0, 1, 1 - value, 1 + value)
        return self.hsv(color, h, s, v)

    def bump(self, height, strength=0.5, distance=0.0002, normal=None, invert=False):
        """Bump node -> Normal socket.  `distance` is the real height range in METRES (micro
        relief 0.00002-0.0003).  Chain several by passing the previous result as `normal`."""
        n = self.node('ShaderNodeBump', {'Height': height, 'Strength': strength, 'Distance': distance}, invert=invert)
        if normal is not None:
            self._in(n.inputs['Normal'], normal)
        return n.outputs[0]

    def micro_bump(self, scale=6000.0, strength=0.3, distance=0.00005, detail=3.0, normal=None, vector=None):
        """Fine pore/grain bump from an fBm noise: breaks up plastic-looking highlights."""
        return self.bump(self.noise(scale=scale, detail=detail, roughness=0.6, vector=vector), strength, distance, normal)

    def displace(self, height, scale=0.001, midlevel=0.5):
        """True (render-time) displacement from a shader height socket; needs dense geometry
        (add_subdivision).  Sets the material to DISPLACEMENT+BUMP ('BOTH')."""
        n = self.node('ShaderNodeDisplacement', {'Height': height, 'Scale': scale, 'Midlevel': midlevel})
        self.nt.links.new(n.outputs[0], self.out.inputs['Displacement'])
        self.mat.displacement_method = 'BOTH'
        return n


def simple_material(name, color, roughness=0.6, **kw):
    """One-liner Principled material with constant values (kw as in Mat.set)."""
    m = Mat(name)
    m.set(base_color=color, roughness=roughness, **kw)
    return m.mat


# ============================================================================= h. preview composite
def load_shot(shot_id):
    """Return the shots.json entry for shot_id (dict) or None."""
    with open(SHOTS_JSON, encoding='utf-8') as f:
        d = json.load(f)
    for s in d['shots']:
        if s['id'] == shot_id:
            return s
    return None


def sky_from_ref(shot_id, W, H):
    """Sky gradient (H, W, 3 float 0-1, sRGB) sampled from the shot's reference frame: per-row
    median colour of the far-left and far-right 2 % columns above the horizon, smoothed
    vertically, interpolated across the width and extended downwards."""
    import cv2
    ref = cv2.imread(os.path.join(REF_DIR, shot_id + '.jpg'))
    if ref is None:
        g = np.linspace(0.02, 0.10, H)[:, None, None]
        return np.repeat(np.repeat(g, W, 1), 3, 2).astype(np.float32)
    ref = cv2.cvtColor(ref, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    rh, rw = ref.shape[:2]
    sw = max(4, int(0.02 * rw))
    y1 = int(0.52 * rh)
    from scipy.ndimage import gaussian_filter1d
    cols = []
    for strip in (ref[:y1, :sw], ref[:y1, rw - sw:]):
        c = np.median(strip, axis=1)
        c = gaussian_filter1d(c, 12, axis=0, mode='nearest')
        slope = (c[-1] - c[-40]) / 40.0
        ext = c[-1] + slope[None, :] * np.minimum(np.arange(1, rh - y1 + 1), 80)[:, None]
        cols.append(np.clip(np.concatenate([c, ext], 0), 0, 1))
    ys = np.linspace(0, rh - 1, H)
    L = np.stack([np.interp(ys, np.arange(rh), cols[0][:, k]) for k in range(3)], 1)
    Rr = np.stack([np.interp(ys, np.arange(rh), cols[1][:, k]) for k in range(3)], 1)
    t = np.linspace(0, 1, W)[None, :, None]
    return (L[:, None, :] * (1 - t) + Rr[:, None, :] * t).astype(np.float32)


def quick_comp(fg_png, shot_id, out_jpg, guides=False, text=True, width=1920, crop=None, quality=92):
    """Fast preview composite: RGBA still over the reference sky gradient + the shot's label text
    (Noto Serif CJK SC Bold; big label centred at y = 0.405 H, em = 0.118 H with wide tracking as in
    the original; small label at y = 0.925 H; white with soft shadow for text='light' shots, dark
    brown for 'dark' shots).  guides=True draws the framing contract (apex band, edge band, sky
    limit).  `crop` = (x0, y0, x1, y1) fractions writes just that region at the still's NATIVE
    resolution (for pixel-peeping).  The picture is otherwise resized to `width` px.
    This is the image on which realism is judged.  Returns out_jpg."""
    import cv2
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    im = cv2.imread(fg_png, cv2.IMREAD_UNCHANGED)
    assert im is not None, fg_png
    mx = 65535.0 if im.dtype == np.uint16 else 255.0
    im = im.astype(np.float32) / mx
    rgb, a = im[..., 2::-1], im[..., 3:4]
    H, W = a.shape[:2]
    sky = sky_from_ref(shot_id, W, H)
    comp = np.clip(rgb * a + sky * (1 - a), 0, 1)
    pil = Image.fromarray((comp * 255 + 0.5).astype(np.uint8))
    shot = load_shot(shot_id) or {}
    if text and shot.get('label_big'):
        light = shot.get('text', 'light') == 'light'
        col = (255, 255, 255) if light else (58, 30, 14)

        def draw_label(img, s, cy, em, tracking):
            font = ImageFont.truetype(os.path.join(FONT_DIR, 'NotoSerifCJKsc-Bold.otf'), int(em))
            adv = [font.getlength(ch) for ch in s]
            tot = sum(adv) + tracking * em * (len(s) - 1)
            x = (W - tot) / 2.0
            sh = Image.new('L', img.size, 0)
            d2 = ImageDraw.Draw(sh)
            xs = []
            for ch, ad in zip(s, adv):
                xs.append(x)
                d2.text((x, cy), ch, font=font, fill=255, anchor='lm')
                x += ad + tracking * em
            if light:
                blur = sh.filter(ImageFilter.GaussianBlur(em * 0.06))
                img.paste((0, 0, 0), (0, int(em * 0.02)), blur.point(lambda v: int(v * 0.55)))
            img.paste(col, (0, 0), sh)

        draw_label(pil, shot['label_big'], 0.405 * H, 0.118 * H, 0.22)
        if shot.get('label_small'):
            draw_label(pil, shot['label_small'], 0.925 * H, 0.037 * H, 0.35)
    if guides:
        d = ImageDraw.Draw(pil, 'RGBA')
        for y, c in ((APEX_RANGE[0], (0, 255, 0, 150)), (APEX_RANGE[1], (0, 255, 0, 150)),
                     (EDGE_RANGE[0], (255, 200, 0, 150)), (EDGE_RANGE[1], (255, 200, 0, 150)),
                     (SKY_LIMIT, (255, 0, 255, 150))):
            d.line([(0, y * H), (W, y * H)], fill=c, width=max(1, H // 540))
        d.line([(0.2 * W, 0), (0.2 * W, SKY_LIMIT * H)], fill=(255, 0, 255, 110), width=1)
        d.line([(0.8 * W, 0), (0.8 * W, SKY_LIMIT * H)], fill=(255, 0, 255, 110), width=1)
    if crop:
        x0, y0, x1, y1 = crop
        pil = pil.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
    elif width and width != W:
        pil = pil.resize((width, int(round(H * width / W))), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(out_jpg)), exist_ok=True)
    pil.save(out_jpg, quality=quality, subsampling=0)
    return out_jpg
