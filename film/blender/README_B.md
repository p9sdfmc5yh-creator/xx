# film/blender - VERSION B: top-down specimen plates + ingredient typography

## CURRENT STATE (b-stills pass) - read this first

**Look.** The user found the first (dark-ground) version gloomy ("像鬼片"), so every plate is now BRIGHT, warm and
clean: light or mid-tone vintage card stock with visible fibre, one colour per plate chosen for contrast with the
ingredient, never near-black.  First page (b00) and last page (b31) are warm WHITE paper with a faint ruled grid.
One exposure for the whole film (`exposure: 0.6`); papers paler than a 0.90 albedo can render under AgX get a
display-space gain (`display_gain`, <= 1.25, written to `<id>_layout.json`).

**Timeline -> stills** (`film/renders_b/<id>.png`, 1920x1080, opaque 16-bit, + `<id>_depth.npy`, `<id>_layout.json`):

| frames | id | what |
|---|---|---|
| 0-192 | `b00_intro` | white grid paper, sparse border of 12 ingredients, centre clear |
| 192-256 | `b01_yinyang` | taiji of black sesame / coix seed on terracotta, text zone above |
| 256-320 | `b02_cabinet` | "四气·五味": wreath of herbs & spices in patches on cream (id kept, no cabinet any more) |
| 320-384 | `b03_grains` | "五谷为养": seven grains / seeds, one per SECTOR around the window, on sage |
| 384-448 | `b04_bowl` | "药食同源": goji + jujube + chrysanthemum + lotus seed + longan + yam on slate-blue (id kept) |
| 448-608 | `b05`..`b14` | ten single-ingredient wreath plates, window 46 % W x 30 % H at (0.50, 0.42) |
| 608-736 | `b15`..`b30` | sixteen glyph plates: 药 x4, 食 x4, 同 x4, 源 x4; calm label strip at y 0.925 H |
| 736-1248 | `b31_landing` + `b31_empty` | 药食同源 in one row poured from goji on white grid paper (block centre 0.50 W / 0.40 H, width 0.80 W) and the same page without the characters (identical camera / light / paper) for the stop-motion reveal; `b31_landing_layout.json` has `char_boxes` |

**Render everything** (one still at a time through the machine-wide render lock, make-style):

```
nohup film/blender/b_render_all.sh > $S/b_logs/runner.out 2>&1 &     # all stale stills
film/blender/b_render_all.sh b17 b31 b31_empty                       # only these
FORCE=1 film/blender/b_render_all.sh b17                             # regardless of the stored key
python film/blender/b_sheets.py                                      # QA sheets -> $S/previews/b_sheet_NN.jpg (6 stills each, zones outlined)
```

Logs: `$S/b_logs/queue.log` (START / DONE / FAIL), `$S/b_logs/<id>.log`, a JPEG of every finished still in
`$S/b_logs/<id>.jpg`.  A still is up to date when the hash of its table entry (`$S/b_logs/<id>.key`) is unchanged
and it is newer than its ingredient modules (`IGNORE_MODULES=1` skips the second test - the version-A agents keep
editing the modules, so a plain run re-renders every plate whose ingredient file was touched since).  NEVER edit b_render_all.sh while a runner is active (bash reads
scripts incrementally).

**New since the first write-up** (all in flatlay.py):

* `--speed fast` (default; `full` = common.py's settings): Burley SSS, bounces 5/1/2/5, adaptive threshold 0.09,
  min 8 samples, FAST denoise prefilter.  1080p / 32 spp on the shared box (one render gets about one of the four
  cores: every agent session is its own scheduler autogroup): glyph plates 40-110 s, wreaths 65-250 s.
* `--lock FILE`: flock around the Cycles render only (the scene build runs outside the lock).
* frame width derived from the MEASURED items: `params.stroke_items` (glyph / landing: regular stroke width in
  item widths) and `params.lengths_across` (wreath) - robust against edits of the ingredient modules.
* glyphs: `NotoSansCJKsc-Bold` + per-character `thin` (药 0.16, 食 0.24, 同 0.10, 源 0.24; +0.04 for big items) -
  the Black weight closes the counters of 食 / 源 once built from objects.  Engine `packed` for every glyph.
  `passes[0].thick = true` for big whole items (longan, mulberry, monk fruit, cinnamon): thrown at 0.76 coverage,
  no footprint overlap, so nothing is perched on a neighbour.  Pass-0 items may now slide (roll0).
* wreath `mix: 'sectors'` (+ `sector_start` deg, `sector_blur`): one ingredient per sector around the window.
* `item_scale` (shot key): uniform scale of a module's items (lotus leaf pieces 0.6, cinnamon 0.75).
* `variation` (shot key, `macro_variation`): per-instance value / saturation / hue offsets + mottling + speckle
  multiplied into the base colour - cut slices (yam, ginger, liquorice, turmeric, hawthorn, reishi, poria) look
  like paper cut-outs from above without it.  A preset dict, or `{source id: preset}` on mixed plates.
  Optional `tint` [r, g, b] + `tint_amt` + `tint_mm`: warm stained patches (chalk-white yam slices).
* paper: the fibre / cloud STRUCTURE is drawn as if the sheet were `PAPER_REF_W` (0.45 m) wide, whatever the
  physical frame (a 3 m plate of monk fruit shows the same paper as a 30 cm plate of seeds); pale strands get
  less contrast on mid-tone sheets.  Saturated mid-tones come out a little lighter / pinker than the table asks
  (AgX is not per-channel) - the palette in shots_b_src.py is pre-compensated by eye.

Everything below is the original description; where it disagrees with this section (dark grounds, 4K default,
bespoke cabinet / bowl scenes, Black font, table columns), this section wins.

---


Same film, same audio, same cut grid as version A, but every scene is shot **straight down** like
a specimen plate / knolling photograph, and the montage ends by rebuilding the four title
characters 药 食 同 源 out of sixteen different ingredients before landing on the full title.

| file | what |
|---|---|
| `film/shots_b_src.py` -> `film/shots_b.json` | the B shot table (32 scenes, frame ranges = A's cuts). Edit the `.py`, run it. |
| `film/blender/flatlay.py` | ONE generic builder for every B scene |
| `film/blender/shots/<id>.py` | the ingredient modules of version A; B only calls their `make_items()` |
| `film/blender/glyph_layout.py` | text rasteriser + disc stroke fill (used for the mask of every glyph, and as the fill engine for round items) |

## Run

```
PY=/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad/bvenv/bin/python
cd film/blender
$PY flatlay.py --shot b06 --quality draft   --out $TMP/b06.png --jpg $TMP/b06.jpg            # whole plate, 960x540
$PY flatlay.py --shot b06 --plan $TMP/plan.png --plan-only                                   # 2-D schematic of the layout, ~8 s, no render
$PY flatlay.py --shot b17 --quality final --region 0.44,0.30,0.62,0.52 --out $TMP/c.png --jpg $TMP/c.jpg   # exact final pixels of a crop
$PY flatlay.py --shot b16 --items m02_gouqi --width 0.44 --quality preview --out $TMP/x.png  # goji as a stand-in ingredient
$PY flatlay.py --shot b31 --quality final --out film/renders/b31_landing.png                 # 4K still + _depth.npy + _layout.json
$PY flatlay.py --shot b31 --quality final --empty --out film/renders/b31_landing_empty.png   # same paper, no items (2-D reveal)
```

`--shot` takes `b17` or the full id.  All of common.py's options work (`--quality --out --region
--threads --seed --spp --res --depth --no-denoise`).  Extra options:

| option | meaning |
|---|---|
| `--items ID[,ID..]` | replace the ingredient module(s) (stand-in).  The frame is rescaled so that the stand-in is as big in the picture as the planned ingredient would be (see "frame width"). |
| `--width M` | physical frame width in metres (overrides table + rescaling) |
| `--empty` | ground only: identical paper / grid / light, no items |
| `--plan PNG` / `--plan-only` | write the 2-D schematic (oriented footprints shaded by height, character boxes, window) / stop there |
| `--jpg JPG` | also write an 8-bit JPEG (<= 1920 px; with `--region` only the crop) |
| `--text STR` | another glyph string for a glyph / landing shot |
| `--ground TYPE or JSON` | override the ground, e.g. `--ground linen` or `--ground '{"type":"paper","colour":[20,60,80]}'` |
| `--set key=json` | override one layout parameter, e.g. `--set thin=0.05 --set 'window=[0.5,0.42,0.5,0.3]'` |

Outputs: `<out>.png` (16-bit, OPAQUE - film is not transparent; alpha = 1), at final quality
`<out>_depth.npy` (float32 HxW, metres along the camera axis; the ground is at the camera height
`frame_width * 135 / 36`), and `<out>_layout.json` (frame size in metres, item count, heap height,
for glyphs the stroke width in items and `char_boxes` = one `[u0, v0, u1, v1]` box per character in
frame fractions - the 2-D stop-motion reveal of b31 uses them).

Final resolution is 3840x2160; b00-b04 carry `final_res: [4032, 2268]` in the table (5 % oversize
for the slow push-in) and get it automatically at `--quality final`.

## What an ingredient module must provide

```python
def make_items(seed=0):
    return dict(
        objects=[...],        # template MESH objects, real-world scale (metres), each in a natural RESTING pose:
                              # lowest point on z = 0, origin at the centre of the top-down footprint.
                              # 6-10 different ones.  Mesh data must already be in final coordinates
                              # (object transforms are ignored by the instancer).
        footprint_r=[...],    # per object: radius of the top-down footprint (m)         } informative only: flatlay
        half_height=[...],    # per object: half height when lying in this pose (m)      } measures the meshes itself
        name='枸杞子',
        # optional, all understood by flatlay.py:
        weights=[...],        # probability of each variant (e.g. berries with a stem are rare)
        inst_attrs={'dark': lambda rng, n: ...},   # per-instance shader attributes (read with Mat.attr(name, 'INSTANCER'))
    )
```

* `inst_rand` and Object Info > Random are written / unique per instance, so `Mat.jitter` and
  `Mat.per_instance_coords` keep working exactly as in the hero heaps.
* flatlay samples 6000 surface points per template and derives everything else: principal axes of
  the footprint (the long axis does NOT have to be X), half length / width / height, the real
  footprint area, the centre of mass, and the point-cloud collision proxy.
* Put different resting poses into different templates (face up / face down / on its side): a
  template is never flipped or rolled by the layout, only yawed, and tilted when it lands on others.
* Reference implementation: `shots/m02_gouqi.py::make_items` (nine berries, two with a stem that
  droops onto the ground).

## How a plate is built

1. **Frame.** `frame_width_m` from the table -> `Frame` (W x H metres on the ground plane z = 0,
   centre = origin, +X right, +Y up in the picture).  Frame fractions (u, v) are measured from the
   top-left: `x = (u - 0.5) W`, `y = (0.5 - v) H`.
2. **Layout** -> a `Placement` (x, y, yaw, ingredient, variant, size, pouring pass) - see below.
3. **Drop & settle** (`settle`).  Items are dropped pass by pass onto a height field (cell = item
   thickness / 4.4).  The collision proxy is a POINT CLOUD sampled from the real mesh, so cupped
   scales, warped slices and flower heads rest the way their shape dictates.  An item that lands on
   bare ground keeps its template pose; one that lands on others tries a few nearby positions and
   keeps the lowest, then lowers its centre of mass by tilting (pattern search over two tilt
   angles, max 38 deg) - a berry lying across another ends with one end on the paper.  Its cloud
   is then stamped into the height field.  No interpenetration beyond `sink` (5 % of the thickness).
4. **Instancing** with `common.instance_on_points` (one instancer per ingredient).
5. **Ground** (`build_ground`): one quad + a numpy-generated 16-bit texture set at 1.25 texels per
   final pixel, real-scale features:
   * `paper` - handmade paper: three classes of fibres (felt 1.5-5 mm, fibres 5-18 mm, long kozo
     strands 20-70 mm; drawn as anti-aliased curves, relief + paler tint), bark flecks, formation
     cloud, laid / chain lines of the screen (帘纹) when resolvable, cockle (2 mm waves, bump only so
     items do not float), tooth, soft sheen.  Optional printed `grid` (朱丝栏): the ink is a
     coverage map multiplied by plate pressure, paper tooth and the fibres (ink sits IN the paper).
   * `slate` (riven cleavage planes, mineral speck, pale veins), `walnut` (plain-sawn rings, open
     pores, oil finish), `linen` (plain weave with per-yarn thickness / dye variation and slubs).
   * `colour` in the table is the DISPLAY colour (sRGB 0-255) the lit ground should have;
     `albedo_for_display` inverts the measured AgX-Punchy curve.  Pale grounds need `exposure: 0.9`
     (AgX maps a white card at exposure 0 to only ~200/255).
6. **Camera** straight down, 135 mm, no DOF (everything sharp), height = 3.75 x frame width.
7. **Light** (`window_light`): soft window from the upper-left (shadows fall to the lower-right),
   a small hard kicker beside it (glints + defined contact shadows), a huge diffuse-only fill
   (invisible to glossy rays, so dark paper stays dark and waxy skins stay saturated), dim ambient.
   White card = 2.0 scene-linear at exposure 0; +-9 % falloff across the plate.

## Layouts and their parameters (`params` in shots_b.json, `--set` on the CLI)

**wreath** (b00, b05-b14) - dense along the frame edges, thinning towards a clear rounded window.
`window [u, v, w, h]` (default `[0.50, 0.42, 0.46, 0.30]`, superellipse n = 3; nothing may reach
within `clear_m` of it), `layers` (2.4: 1-3 at the edges), `reach` (0.55: how far the closed
ground layer reaches from the edge towards the window), `rough` (0.16: irregularity of the inner
boundary), `strays` (9 single items between band and window), `mix` (`'patches'` = each
ingredient in organic patches with equal area share - b00; `'random'`; or a weight list).
Items beyond the frame edge are populated (1.2 item lengths), so the frame crops them.

**glyph** (b15-b30) and **landing** (b31) - text poured from the ingredient.
`centre [u, v]`, `height` (block height / frame height, 0.72) or `width` (block width / frame
width, 0.80 for b31), `font` (NotoSansCJKsc-Black), `tracking`, `thin` (0.10: stroke erosion as a
fraction of the stroke width - opens the counters), `align` ('auto': elongated items follow the
stroke direction), `edge_tol` (0.22 item widths an item may stick out), `strays`, `engine`:

* `packed` (default for item aspect > 1.3): oriented footprints (chains of discs).  Pass 0 is
  thrown in at 90 % area coverage and RELAXED (soft-particle push-apart + push-inside-the-outline
  + weak alignment torque, 140 iterations), which gives ~0.8 coverage and outlines made of item
  sides instead of ~0.55 and ragged edges from dart throwing; pass 1 is a sparser second layer,
  inset by 0.7 item widths (`passes: [{mode:'relax', pack:0.9}, {mode:'rsa', inset:0.7, fill:0.6}]`).
* `glyph_layout` (default for round items): `glyph_layout.glyph_layout()` once per pouring pass
  with a growing inset (`passes: [{inset:0.55}, {inset:1.5}, {inset:2.6, fill:0.7}]`), so the
  strokes become mounds, not slabs.  Its z / tilt are replaced by `settle`.

Both use the tool's rasteriser for the mask (thinned by `thin`).  The log line `[glyph]` prints
the stroke width in item widths - keep it >= 3 for big items, >= 5 for seeds.

**taiji** (b01) - `centre`, `diameter` (/ frame height), `dot`, `layers`, `rotate_deg`;
`source[0]` = yin (dark), `source[1]` = yang (light).
**dishes** (b03) - `centre_v`, `dish` and `pitch` (/ frame width), `kinds` (`wood` | `celadon`),
`heap` (mound height / dish radius), `fill`; `source[i]` goes into dish i.  The dish interior is the
base of the height field, so the grains really lie in the bowl.
**bespoke** (b02, b04) - `script` names a file next to flatlay.py that exposes
`build_and_render(cli, args, shot, flatlay_module)`; it may use `Frame`, `build_ground`,
`window_light`, `topdown_camera`, `settle`.  NOT WRITTEN YET.

## Frame width

`frame_width_m` is chosen per ingredient so that items are as large as legibility allows:

* wreath: about 24 item lengths across the frame;
* glyph: `width = n * item_width / (0.0543 * (1 - thin))` with n = strokes in item widths (the
  stroke of a NotoSans-Black glyph at 0.72 H is 5.43 % of the frame width): n = 2.5-3 for big
  items, 5 for seeds, 8 for sesame; long sticks (cinnamon, reishi slices) are sized by length
  (`size_by: 'length'`) so that the shortest strokes are still longer than a stick.

The table stores the item size the width was derived for (`item_mm`, `item_w_mm`).  When the real
module (or a stand-in) differs by more than 15 %, flatlay rescales the frame and says so in the
log (`lock_width: true` or `--width` disable this).  Most k-modules do not exist yet, so the
glyph widths in the table are estimates - check the `[glyph]` log line when they arrive.

## Known limits / ingredients that need special handling

* **Honey (m10)** cannot be scattered.  Give `make_items` solid pieces (honeycomb chunks, 25-40 mm)
  or build a bespoke plate (comb slab + a honey spoon); a liquid needs its own scene.
* **Lotus leaf (k08)**: one leaf is larger than the glyph.  Either `make_items` returns torn /
  cut pieces (30-50 mm, flat, curled edges) or the glyph should be CUT OUT of a leaf (a mask on a
  leaf surface) - the second needs a bespoke script.
* **Turmeric (k10)**: slices work as items; POWDER does not (it is a continuous heap).  A powder
  glyph needs a displaced mesh over the stroke mask (not implemented; `_glyph_mask` gives the mask).
* **Mint (k05)**, lily scales, petals: very thin items - the point-cloud proxy handles them, but
  they should come with a clearly cupped / curled resting pose or they shade as flat paper cut-outs.
* **Monk fruit (k13, 50 mm spheres)** and **longan (k03)**: at 2.5 item widths per stroke the glyph
  is blobby; halves / shell fragments + seeds, or a wider frame (n = 3.5), read better.
* **Cinnamon (k14)**: 80 mm quills only work aligned along the strokes and at a 1.4 m frame.
* Items are rigid: nothing bends over its neighbour (long thin petals would in reality).
* The height field is 2.5-D: an item cannot slide UNDER an overhang.
* `settle` runs ~0.3 ms per bare-ground item and ~1.5 ms per stacked item (single thread).
* Paper cockle is bump-only (items would float over real waves); grid lines are straight (a
  printed plate), their unevenness is in the ink, not in the geometry.

## Timings

see the table at the end of this file (measured on the shared 4-core box).
