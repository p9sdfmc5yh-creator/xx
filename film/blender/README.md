# film/blender - photoreal ingredient stills for 《药食同源》

One Cycles still per ingredient shot (real-world scale, **units = metres**), rendered as
**foreground RGBA only** (transparent sky).  The 2D compositor adds sky, stars, text and a slow
push-in.  `common.py` is the shared library, `shots/m02_gouqi.py` is the reference shot - copy it.

```
PY=/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad/bvenv/bin/python
$PY film/blender/shots/m02_gouqi.py --quality draft   --out $TMP/g.png          # whole frame, ~20 s
$PY film/blender/shots/m02_gouqi.py --quality draft   --res 2112x1188 --spp 32 \
        --region 0.36,0.56,0.64,0.86 --out $TMP/gc.png                          # final-density crop, ~25 s
$PY film/blender/shots/m02_gouqi.py --quality final   --out film/renders/m02_gouqi.png
```

Outputs of a final render: `<out>.png` (2112x1188, 16-bit RGBA, straight alpha, AgX display
referred sRGB) and `<out>_depth.npy` (float32 HxW, metres along the camera axis, **0.0 = no
geometry**; use the PNG alpha as the mask).  The shot also writes a judging composite
(`quick_comp`) to `<scratch>/previews/<shot>_comp.jpg`.

## Framing contract (every still)

Fractions of frame height from the top: silhouette apex **0.50-0.56** near x = W/2; silhouette at
the left/right frame edges **0.62-0.74**; nothing above **0.47** in the central 60 % of the width
(text lives there); frame bottom completely covered.  `check_framing(png)` measures it on the alpha
channel and prints `OK` / `OUT OF CONTRACT` - run it on every full-frame render.

World convention: +Z up, camera on the -Y side looking towards +Y, subject centred on the origin.
A "planet" is a sphere of radius R centred on the origin: only a cap around the +Z pole is seen
(visible width at the horizon = 0.66 R with the 85 mm lens), so only `sol['patch']` is populated.

## Quality presets (measured, 4 threads, goji shot: 1450 instances x 60k-triangle meshes, random-walk SSS, DOF)

| preset  | resolution | max spp | adaptive thr | denoise prefilter | wall time (goji) |
|---------|-----------:|--------:|-------------:|-------------------|------------------|
| draft   | 960x540    | 16      | 0.10         | fast              | __DRAFT__ |
| preview | 1280x720   | 40      | 0.05         | fast              | __PREVIEW__ |
| final   | 2112x1188  | 128     | 0.015        | accurate, high    | __FINAL__ |
| crop    | 2112x1188, `--spp 32 --region` 28 % x 30 % | | | | __CROP__ |

Scene build (9 berry meshes + packing 1450 items) costs ~4 s of that.  The plain sphere / disc
framing tests render in 1 s.  200 000 instances of 3 meshes: 2.8 s render at 480x270, 0.7 GB.
Other agents share the 4 cores: pass `--threads 2` when you run two jobs at once.

## API (all in `common.py`, every function has a docstring)

```
args  = parse_args(argv=None, **defaults)        --quality --out --region --threads --seed --spp --res --depth --comp --no-denoise
scene = setup_scene(args, look='AgX - Punchy', exposure=0.0)
res   = render(args, scene=None, depth=None)     -> {'out','depth','seconds'}
read_exr(path)                                   -> {channel: array}  (uncompressed EXR only)

sol        = planet_solve(R, lens_mm=85, apex=0.53, edge=0.68, limb_past_pole_deg=5, center=(0,0,0))     # maths only
cam, info  = planet_camera(R=None, lens_mm=85, apex=0.53, edge=0.68, limb_past_pole_deg=5, center=(0,0,0), heap=None, top_margin=0.015)
R_fit      = fit_planet_radius(heap, ...)        # used by planet_camera(heap=...)
sol        = disc_solve(radius, elevation_deg=25, lens_mm=85, apex=0.53, edge=0.68, center=(0,0,0))       # maths only
cam, info  = disc_camera(radius, elevation_deg=25, lens_mm=85, apex=0.53, edge=0.68, center=(0,0,0))
             info keys: cam_pos cam_fwd cam_up D limb_dist near_dist focus_dist patch(xmin,xmax,ymin,ymax) scale target
set_dof(cam, focus_dist, fstop);  blur_px(cam, focus_dist, dist, fstop, width_px=2112)
focus, fstop = auto_dof(cam, info, near_blur_px=7, far_blur_px=3, focus_frac=None)
check_framing(png)                               -> {'apex','edge_left','edge_right','sky_clear','bottom_filled','ok'}

studio_lights(info=None, target=None, scale=None, tint=(1,1,1), key=1, fill=1, rim=1, world=1,
              key_az=-50, key_el=42, key_size=1.3, key_color=(1,.96,.90), fill_color=(.92,.96,1), rim_az=62, top=0)
world_gradient(horizon, zenith, ground, strength=1)

heap = pack_heap(R, extent, shapes, layers=3.0, coverage=0.72, seed=0, weights=None, scale_range=(0.88,1.12),
                 tilt_deg=8, roll_deg=20, flip=False, candidates=5, sink=0.12, max_slope_deg=55, grid_res=None,
                 center=(0,0,0), count=None, rough=0.0)
       -> Heap: .loc (N,3) .quat (N,4 wxyz) .scale (N,3) .var (N,) .rand (N,) .R_base .R_top .height .gx .gy
dome_base(R, material=None, center=(0,0,0), cap_deg=75, segments=192)
variants_collection(objects, name)               # hidden collection of variant meshes
instance_on_points(name, variants, heap=None, loc=None, quat=None, scale=None, var=None, attrs=None)

mesh_from_arrays(name, verts, faces, smooth=True, material=None, attrs=None, uvs=None, face_mat=None, materials=None)
grid_faces(nu, nv, wrap_v=True, wrap_u=False);  vertex_normals(verts, faces)
lathe(profile_r, profile_x, nv=96, squash=(1,1))            -> verts, faces, s, phi
superellipsoid(a, b, c, nu=96, nv=96, e_long=1, e_round=1, taper=0) -> verts, faces, s, phi
tube(points, radii, nv=12) -> verts, faces;   merge_meshes([(verts, faces, slot), ...]) -> verts, [faces], face_mat
patch_grid(extent, R=None, n_max=1200, center=(0,0,0))      -> verts, faces, normals, (ny, nx)   # dense canvas for surface/disc shots
add_subdivision(obj, levels=1, simple=False)
perlin3(p, seed) fbm3(p, octaves, lacunarity, gain, seed) ridged3(p, ...) cellular3(p, seed, jitter) -> F1, F2, id;  smoothstep(e0, e1, x)

m = Mat(name, sss_method='BURLEY'|'RANDOM_WALK')            # Principled BSDF wrapper; helpers return sockets
m.set(base_color=, roughness=, sss=, sss_radius=, sss_scale=, sss_anisotropy=, specular=, ior=, coat=, coat_roughness=,
      sheen=, sheen_roughness=, transmission=, alpha=, normal=, emission=, emission_strength=, ...)
m.coords('Object'|'Generated'|'UV') m.position() m.per_instance_coords() m.mapping(vector, scale, location, rotation)
m.obj_random() m.attr(name, 'GEOMETRY'|'INSTANCER', output='Fac'|'Color'|'Vector')
m.noise(scale, detail, roughness, distortion, vector, color=False) m.voronoi(scale, feature, randomness, vector, output) m.wave(...)
m.ramp(fac, [(pos, grey_or_rgb), ...]) m.map_range(v, a, b, c, d, smooth=False) m.math(op, a, b) m.mix(a, b, fac, blend) m.mixf(a, b, fac)
m.hsv(color, hue, saturation, value) m.jitter(color, hue=.015, saturation=.12, value=.18)
m.bump(height, strength, distance, normal=None) m.micro_bump(scale, strength, distance, normal=None) m.displace(height, scale)
m.node(type, {input: value_or_socket}, **props)             # escape hatch for any other node
simple_material(name, color, roughness, **kw)

quick_comp(fg_png, shot_id, out_jpg, guides=False, text=True, width=1920, crop=None)   # sky from ref frame + label text
sky_from_ref(shot_id, W, H); load_shot(shot_id)
```

## Templates

### pile (mound of many items) - see `shots/m02_gouqi.py` for the full, commented version

```python
import common as C, numpy as np
args = C.parse_args(); C.setup_scene(args)
mat = make_material()                                  # a C.Mat
variants, shapes = [], []
for i in range(8):                                     # 6-10 DIFFERENT meshes, long axis X, flat side Z
    verts, faces, attrs, half = make_item(i)           # numpy; half = (a, b, c) tight half-sizes in metres
    variants.append(C.mesh_from_arrays('it%d' % i, verts, faces, attrs=attrs, material=mat)); shapes.append(half)
R = 0.26                                               # choose R so the item is 120-220 px long: px ~= 2900 * size / R (1920 frame, at the horizon)
sol  = C.planet_solve(R)
heap = C.pack_heap(R, sol['patch'], shapes, layers=3.2, seed=args.seed, candidates=6, sink=0.16, rough=0.1 * item_len)
C.instance_on_points('heap', variants, heap, attrs={'dark': some_per_item_array})
C.dome_base(R - 0.3 * item_thickness, C.simple_material('base', dark_shadow_colour, 0.9))
cam, info = C.planet_camera(heap=heap)                 # fitted to the bumpy top of the heap
C.auto_dof(cam, info); C.studio_lights(info, tint=sky_tint)
C.render(args); C.check_framing(args.out); C.quick_comp(args.out, SHOT, comp_jpg)
```

### surface (macro across the curved skin of ONE object / leaf)

```python
R = 0.035                                              # local radius of curvature of the hero surface (cheat it larger if the real object is tiny)
sol = C.planet_solve(R)
v, f, n, (ny, nx) = C.patch_grid(sol['patch'], R=R, n_max=1400)     # only what the camera sees, ~1.5 px cells
h = wrinkles(v)                                        # numpy height in metres (C.fbm3 / ridged3 / cellular3 of v * frequency)
v = v + n * h[:, None]
ob = C.mesh_from_arrays('skin', v, f, attrs={'cav': mask}, material=mat)
cam, info = C.planet_camera(R + h.max() * 0.7)         # then check_framing and nudge R or apex
```
Things that stick out past the silhouette (rootlets, hairs, a curled peel edge, neighbouring fruit)
are separate meshes placed with `info['patch']`, they make the horizon believable.

### disc (macro across the cut face of a thick round slice; far rim = horizon)

```python
r = 0.022                                              # slice radius (far-rim radius if the outline is lobed)
sol = C.disc_solve(r, elevation_deg=25)
v, f, n, _ = C.patch_grid(sol['patch'], R=None, n_max=1400)         # the cut face, plane z = 0
inside = np.hypot(v[:, 0], v[:, 1]) <= r               # shape the outline, drop / pull down outside verts,
v[:, 2] += knife_marks_and_fibres(v)                   # micro relief 0.02-0.2 mm
# + a lathe()/tube() skin wall hanging below the rim (the peel is what the horizon is made of)
cam, info = C.disc_camera(r, elevation_deg=25); C.studio_lights(info, top=0.6)
```
Valid elevations ~12-35 deg (25 is the default look).  The camera is only 2-5 slice radii away,
so the DOF helper matters: keep `auto_dof` defaults.

## Photoreal recipe (lessons from the goji shot)

**Scale / framing**
* Work at true size.  Pick the dome radius so one item is 120-220 px long in the 1920 frame
  (`px ~= 2900 * item_len / R` at the horizon, x1.4 in the foreground).  Goji 14 mm -> R = 0.26 m.
  Tiny grains (millet 1.6 mm) -> R ~ 0.03 m; do not render 300 k grains just because you can.
* `planet_camera(heap=heap)` - never the bare R: a 3-layer heap is 15 mm thicker than its dome and
  its bumps would poke into the text zone.  Always read the `[framing]` line.

**Geometry (this is 70 % of the realism)**
* Wrinkles, folds, dimples must be REAL vertex displacement at 0.05-0.1 mm vertex spacing
  (goji: 230 x 132 vertices per berry).  Bump maps only for relief below ~0.15 mm.
* Height field that reads as "shrivelled": billow noise `abs(perlin3(q)) ** 0.5` (broad taut crests,
  narrow V creases), amplitude 0.30 x radius, second octave 0.13, sampled on a domain-warped
  (0.55) cylinder so folds run lengthwise but branch and die out, modulated by a slow mask
  (`how`) so some zones stay smooth.  First attempt (folds running the whole length, amplitude
  constant) looked like fluted pumpkin seeds - regularity is the #1 CG tell.
* Break the primitive: asymmetric profile (blunt one end, pointier other), bend + twist of the
  centre line, flattened cross-section, big soft dents.  Ends rounded (`sin(pi s)^0.45-0.65`), a
  cone-like exponent (0.9) reads as a rhombus.
* 8-10 mesh variants + per-item scale 0.82-1.12 + free yaw/roll: no repetition visible.
* Bake masks while you build the geometry (`cav` crease depth, `scar`, `seedb`) as vertex
  attributes and drive colour AND roughness with them in the shader.

**Heap**
* `layers=3.2, coverage=0.72, candidates=6, sink=0.16, roll_deg=28, tilt_deg=9, rough=1.6 mm`.
  `candidates=1` gives towers and holes; `rough` > 0.3 x item length gives lumpy hills that break
  the framing.  `sink` 0.15 hides the air gap between wrinkled meshes and their ellipsoid proxies.
* Always add `dome_base` (dark version of the item colour, roughness 0.9) under the heap.

**Material (dried fruit skin)**
* Base colour in LINEAR values, much darker and more saturated than you think: crests
  (0.40-0.52, 0.011-0.034, 0.010), creases (0.12, 0.003, 0.005).  The first try at (0.6, 0.07, 0.02)
  with strong SSS rendered salmon / gummy-candy.  AgX desaturates bright reds: keep exposure down
  instead of pushing colour.
* SSS: `sss=0.6, sss_radius=(1.0, 0.18, 0.08), sss_scale=0.0011` (metres!) random-walk.  0.0022
  made the berries glow like wax; < 0.0005 looks like painted clay.  Opaque/starchy things
  (grains, seeds, powdery slices): BURLEY, scale 0.0003-0.001.  Thin translucent things (petals,
  lily scales, honeycomb wax): RANDOM_WALK, scale 0.002-0.006.
* Roughness is a map, never a constant: 0.26-0.50 from a 1500/m noise, +0.2 in creases, +-0.1 per
  instance.  Specular 0.42 (IOR 1.47).  Constant roughness 0.3 = plastic.
* Micro relief: stretched crinkle noise (scale 2600, mapping (0.22,1,1), bump distance 0.13 mm,
  strength 0.8) + grain (scale 9000, distance 0.04 mm, strength 0.5).  Use
  `m.per_instance_coords()` so instances of one mesh do not share the pattern.
* Colour variation at three scales: inside an item (mottle noise 420/m + crease mask), between
  items (`m.jitter(col, hue=0.012, saturation=0.08, value=0.22)`), and a few outliers (10 % darker
  /browner via an instancer attribute).

**Light**
* `studio_lights(info, tint=sky_tint, key=0.85, fill=0.75, rim=1.1, key_size=0.9)`.
  Key = 3/4 back-left, 42 deg up, soft box 0.9-1.3 x scene width at 2.6 x scene width;
  fill from the camera side, 3.2 x scene width, ~1/4 of the key; small rim back-right at 16 deg.
  Calibrated powers for scale s (scene width in m): key 320 s^2 W, fill 70 s^2 W, rim 130 s^2 W
  (goji: s = 0.17 m -> 9.6 / 2.1 / 3.9 W).  Back light is what makes wrinkles and translucency read;
  front light flattens everything.
* Exposure: judge on the quick_comp, the lit crests should sit around 60-75 % - not white.

**Camera / DOF**
* 85 mm, `auto_dof(cam, info, near_blur_px=7, far_blur_px=3)` -> f/40-ish.  12/5 px already made
  the mid-ground look soft at 1080p.  Keep a little foreground blur: it is the lens cue.

**Render / denoise**
* Never judge texture on a 16-spp draft: OIDN smears micro detail below ~32 spp.  Use the
  final-density crop command (`--res 2112x1188 --spp 32 --region ...`) and
  `quick_comp(..., crop=region, text=False)` to pixel-peep.
* Final: 128 spp, adaptive 0.015, OIDN with albedo+normal guides and ACCURATE prefilter keeps the
  bump-level detail (the normal guide carries it).  Clamp indirect 6 -> no fireflies seen.
* AgX 'Punchy' look.  Base AgX is flat/washed out for food; Standard clips the reds.

**Typical mistakes**
* perfect symmetry / identical items / constant amplitude noise; * colours too light;
* SSS scale in the wrong unit (0.1 instead of 0.001); * constant roughness; * front lighting;
* item count far above what is visible (pack only `sol['patch']`); * forgetting `dome_base`;
* judging on drafts; * silhouette poking above 0.47 H (run `check_framing`).
