# -*- coding: utf-8 -*-
"""Master shot table for 《药食同源》. Run this file to (re)generate film/shots.json.
Frame numbers are 0-based frame indices at 30 fps (1920x1080, 1248 frames, 41.6 s).
The cut grid comes from frame-accurate analysis of the original film (cuts land on a
64 / 16 / 8-frame musical grid) and MUST NOT change: the original audio track is reused."""
import json, os

FPS, W, H, NFRAMES = 30, 1920, 1080, 1248

# kind: 'pile'    = mound of many small items forming a dome ("planet made of X")
#       'disc'    = macro across the cut face of one thick round slice; far rim (with peel) is the horizon arc
#       'surface' = macro across the curved outer surface of one object / leaf
#       'special' = bespoke scene
# text: 'light' = white text on dark sky ; 'dark' = dark text on light sky
SHOTS = [
 # ---- long shots (64 frames each) ----
 dict(id='s02_cabinet', cn='百子柜（中药柜）', en='traditional Chinese apothecary drawer cabinet', start=256, end=320, kind='special', text='light',
      look="Antique Chinese medicine cabinet (百子柜): a huge convex wall of small square drawers curving away like a planet horizon. "
           "Aged dark rosewood/elm: real wood grain along each drawer front, slightly different tone per drawer, worn lighter edges, hairline gaps with dark shadow between drawers, "
           "frame rails between rows. Each drawer: one antique brass ring/knob pull with patina and a round backplate, plus a rectangular aged-paper label (cream, slightly yellowed, fibrous) "
           "with a herb name in black ink brush/kai calligraphy. Warm low-key light raking across so the grain, knobs and paper catch highlights. Label names must be real 食药物质, e.g. "
           "茯苓 菊花 甘草 薄荷 芡实 桑椹 荷叶 乌梅 山楂 紫苏 桔梗 栀子 沙棘 佛手 木瓜 麦芽 昆布 白果 玉竹 葛根 覆盆子 小茴香 藿香 白芷 桑叶 蜂蜜 刀豆 罗汉果 山药 枸杞 大枣 百合 莲子 陈皮 肉桂 灵芝 黄精 砂仁 丁香 八角 花椒 黑芝麻 决明子 薏苡仁 赤小豆 龙眼肉 酸枣仁 金银花 蒲公英 鱼腥草 淡竹叶 益智仁."),
 dict(id='s03_millet', cn='小米（五谷）', en='foxtail millet grains', start=320, end=384, kind='pile', text='light', item_mm=1.6,
      look="A sea / mound of hulled foxtail millet (小米). Each grain ~1.5 mm, a slightly flattened sphere/ovoid, warm golden-yellow to pale straw yellow, matte with a soft satin sheen, "
           "with a small paler off-white germ notch/dimple (胚) and a faint crease on one side. Natural variation: a few paler, a few darker/orange, the odd unhulled brown grain and broken grain, a little flour dust. "
           "Grains must look like real cereal (subsurface warmth, not plastic beads, not metallic gold)."),
 dict(id='s04_bowl', cn='青花瓷碗·药膳汤', en='blue-and-white porcelain bowl of herbal broth with goji', start=384, end=448, kind='special', text='light',
      look="The far rim of a large blue-and-white porcelain bowl (青花瓷) arcs across the frame like a planet horizon; we look over the near (out of frame) edge into the bowl. "
           "Porcelain: slightly bluish-white, thick glassy glaze with crisp soft-box reflections, subtle glaze waviness, cobalt-blue hand-painted 回纹 (meander/Greek-key) band between two thin blue lines on the outer+inner rim, "
           "blue slightly bleeding/uneven like real underglaze cobalt. Inside: clear amber-brown herbal broth/tea (real liquid: refraction, meniscus climbing the wall, reflections of the rim), "
           "with plump rehydrated red goji berries floating (wet, glossy, slightly translucent, each making a tiny meniscus dimple), optionally 1-2 red jujube slices. A few tiny bubbles at the wall. "
           "Steam is NOT needed."),
 # ---- 16-frame shots: big centered label = ingredient name ----
 dict(id='m01_shanyao', cn='山药', en='Chinese yam (fresh cut cross-section)', start=448, end=464, kind='disc', text='light', label_big='山药',
      look="Macro across the freshly cut face of a thick Chinese yam (铁棍山药). Flesh: bright ivory-white, moist with a faint mucilaginous sheen (tiny wet specular sparkles), very fine granular/starchy texture, "
           "sparse tiny translucent vascular dots, a slightly more translucent thin band just under the skin. Skin at the far rim: thin (<1 mm) tan-brown, earthy, with tiny dark root-hair nubs and a few fine whisker rootlets sticking out past the silhouette. "
           "Knife marks: extremely subtle parallel micro ridges. Not paper, not plaster."),
 dict(id='m02_gouqi', cn='枸杞子', en='dried goji berries (wolfberry)', start=464, end=480, kind='pile', text='light', label_big='枸杞子', item_mm=14,
      look="Mound of dried Ningxia goji berries. Each 10-18 mm long, 5-8 mm wide, spindle/elongated-oval and slightly flattened, often gently curved. Skin: leathery, deep red to orange-red, "
           "with irregular longitudinal wrinkles and shrivel folds (real displacement), semi-gloss waxy sheen with broken highlights along wrinkle crests, flesh slightly translucent (warm SSS glow at thin edges). "
           "One end carries a small pale yellowish-white stem scar (果梗痕) dot ~1 mm; a few berries keep a short brown stem. Colour varies berry to berry (crimson, orange-red, a few darker brownish). "
           "Faint bumps where the flat seeds press under the skin."),
 dict(id='m03_dazao', cn='大枣', en='dried red jujube (Chinese date)', start=480, end=496, kind='surface', text='dark', label_big='大枣',
      look="Macro across real dried red jujubes: the top of a big hero jujube forms the horizon arc (other jujubes may sit beside/behind, soft). Skin: deep maroon / wine red-brown, thin glossy cuticle with sharp but broken specular highlights, "
           "strongly wrinkled: broad irregular shrivel folds plus fine secondary crinkles, slightly paler red-orange on fold crests, almost black-red in creases, tiny pale lenticel specks, a little dust. "
           "Thin skin shows slight translucency at grazing light. If an end is visible: sunken stem cavity with a short woody stem. It must NOT look like red cloth/leather sheet."),
 dict(id='m04_shengjiang', cn='生姜', en='fresh ginger (cut cross-section)', start=496, end=512, kind='disc', text='light', label_big='生姜',
      look="Macro across the freshly cut face of a ginger rhizome. Flesh: pale yellow to cream-yellow, juicy/moist with wet glints, visibly fibrous: many tiny vascular bundle dots and short fibre ends (slightly darker yellow), "
           "a distinct thin ring (endodermis) at ~75-80% radius separating cortex from the denser-dotted central stele. Thin corky skin at the far rim: beige-tan, papery, slightly peeling flakes. "
           "A few fine fibres stand up from the cut. Slightly irregular (lobed) outline, not a perfect circle."),
 dict(id='m05_jupi', cn='橘皮', en='dried tangerine peel (chenpi)', start=512, end=528, kind='surface', text='light', label_big='橘皮',
      look="Macro across the outer surface of sun-dried tangerine peel. Colour orange to orange-red drifting to reddish-brown in patches. Surface densely covered with sunken oil-gland pits (油室): "
           "small round dimples 0.3-0.8 mm, irregularly spaced, each with a darker floor and a tiny glint on the rim; between them fine dry wrinkles; waxy semi-matte sheen. "
           "At the far rim the peel edge curls so a sliver of the pale yellowish-white spongy inner side (pith with faint fibre strands) is visible. Slight translucency (orange glow) where light grazes."),
 dict(id='m06_lianzi', cn='莲子', en='dried white lotus seeds', start=528, end=544, kind='pile', text='light', label_big='莲子', item_mm=14,
      look="Mound of dried white lotus seeds (去芯白莲). Each 12-16 mm, short oval/near-spherical, ivory to pale cream, matte fine-powdery surface with faint longitudinal striations and occasional shallow cracks. "
           "Apex: a small red-brown nipple/cap remnant of seed coat surrounded by a darker ring; base: a round hole where the green plumule was pushed out (dark opening ~2 mm). "
           "Some seeds are split halves showing the hollow groove; a few retain patches of thin red-brown skin."),
 dict(id='m07_baihe', cn='百合', en='dried lily bulb scales', start=544, end=560, kind='pile', text='light', label_big='百合', item_mm=30,
      look="Mound of dried lily bulb scales (百合干). Each scale 20-45 mm long, 10-18 mm wide, an elongated oval boat/spoon shape, curved along its length and cupped across, thick in the middle thinning to wavy translucent edges. "
           "Colour ivory to pale yellow-white, some with light tan/brown edges or tips; horny semi-translucent body (strong warm SSS when backlit), surface semi-matte with several fine parallel longitudinal veins/ridges. "
           "Random orientations, overlapping, some broken pieces."),
 dict(id='m08_shanzha', cn='山楂', en='dried hawthorn slices', start=560, end=576, kind='pile', text='light', label_big='山楂', item_mm=20,
      look="Mound of dried hawthorn slices (山楂片). Each a round slice 15-25 mm across, 2-4 mm thick, warped/curled like a crisp. Outer skin edge: deep red to dark red, wrinkled, with tiny pale grey-white dots. "
           "Cut face: tan to yellow-brown dried flesh, matte, slightly rough/grainy and shrunken so the skin rim stands proud. Centre: five seed cavities in a star/rosette; some hold pale yellow hard seeds, many are empty holes; "
           "a few slices are end-caps showing the dark puckered calyx. Mix of faces up and down."),
 dict(id='m09_juhua', cn='菊花', en='dried chrysanthemum flowers', start=576, end=592, kind='pile', text='light', label_big='菊花', item_mm=25,
      look="Mound of dried chrysanthemum flower heads (杭白菊/贡菊 for tea). Each head 15-30 mm, flattened-globular: many overlapping layers of ligulate ray petals, white to cream-ivory, yellowing toward the base, "
           "thin, papery, shrivelled, curled and twisted, slightly translucent; centre a dense button of golden-yellow tubular disc florets (often partly hidden); underside pale green-brown involucre bracts with a short stem stub. "
           "Heads face random directions; loose petals lie between. Must read as real dried flowers, not spikes."),
 dict(id='m10_fengmi', cn='蜂蜜', en='honey in honeycomb', start=592, end=608, kind='special', text='light', label_big='蜂蜜',
      look="A gently domed slab of real honeycomb dripping with honey. Beeswax cells: hexagonal ~5.2 mm across flats, thin slightly uneven hand-built walls with rounded rims, pale yellow to golden wax with soft subsurface scattering. "
           "Most cells brim with clear golden-amber honey (true refractive, absorbing liquid: deeper cells darker amber, bright caustic glints, curved menisci); some cells capped with pale ivory wax cappings (slightly wrinkled domes), a few empty dark cells. "
           "A glossy sheet/drip of honey flows across part of the comb with bulging edges and specular highlights. Backlight to make honey glow."),
 # ---- 8-frame shots: big centered text is the phrase word, small bottom label = ingredient ----
 dict(id='k01_fuling', cn='茯苓', en='poria (Wolfiporia cocos) cut face', start=608, end=616, kind='disc', text='light', label_big='厨房里', label_small='茯苓',
      look="Macro across the cut face of a poria sclerotium. Flesh: chalk-white to faintly pinkish-white, dry, matte, fine granular/powdery like compressed starch, with faint pale-pink to light-brown marbling veins, "
           "a few hairline cracks and tiny pits, slightly uneven knife-cut facets, loose white powder. Skin at the far rim: dark brown to black-brown, thick, rough and deeply wrinkled like bark (茯苓皮), 1-3 mm."),
 dict(id='k02_yiyiren', cn='薏苡仁', en='coix seeds (Job\'s tears kernels)', start=616, end=624, kind='pile', text='light', label_big='厨房里', label_small='薏苡仁', item_mm=6,
      look="Mound of coix seed kernels (薏米). Each 4-8 mm, broad ovoid/rounded with one flatter side, milky white to ivory, smooth matte-satin surface slightly powdery, "
           "with one wide deep longitudinal groove (腹沟) on the ventral side whose floor is pale brown; one end slightly truncated with a brownish dot (hilum); occasional yellow-brown seed-coat remnants. Slight translucency."),
 dict(id='k03_guiyuan', cn='桂圆', en='dried longan (in shell)', start=624, end=632, kind='pile', text='light', label_big='厨房里', label_small='桂圆', item_mm=22,
      look="Mound of dried whole longan (带壳桂圆干). Each 18-25 mm sphere, slightly dented; shell thin, brittle, yellowish-tan to light brown, matte, finely pebbled/reticulated with tiny raised scale-like bumps and faint lines, "
           "a darker round stem scar, some with a short twig. A few are cracked open showing sticky glossy dark amber-brown translucent flesh wrapped around a shiny black seed."),
 dict(id='k04_heizhima', cn='黑芝麻', en='black sesame seeds', start=632, end=640, kind='pile', text='dark', label_big='厨房里', label_small='黑芝麻', item_mm=3,
      look="Mound of black sesame seeds, macro. Each ~3 mm long, 1.8 mm wide, a flat teardrop/ovate with one pointed end carrying a tiny pale-brown hilum dot; charcoal black to very dark brown, "
           "matte with a subtle oily sheen, fine reticulate/pebbled micro texture and a faint raised edge ridge. Some seeds brownish or greyish; seeds lie flat in random directions, some on edge."),
 dict(id='k05_bohe', cn='薄荷', en='fresh mint leaves', start=640, end=648, kind='surface', text='dark', label_big='藏着', label_small='薄荷',
      look="Macro of fresh mint (peppermint/spearmint) leaves overlapping to form a dome. Leaf blade: vivid fresh green (darker in sunken veins, brighter yellow-green where back-lit and translucent), "
           "strongly rugose/quilted: a pinnate midrib and lateral veins sunk into the surface with the tissue between puffed up, fine reticulate vein network, serrated margin with small forward-pointing teeth, "
           "short fine hairs along veins and edges, tiny oil-gland dots, soft satin sheen with wet-looking highlights on the puffed areas. Thin leaves: real translucency."),
 dict(id='k06_sangshen', cn='桑椹', en='mulberries', start=648, end=656, kind='pile', text='dark', label_big='藏着', label_small='桑椹', item_mm=20,
      look="Mound of ripe mulberries. Each 15-25 mm long, 8-12 mm wide, oblong aggregate of many small tightly packed drupelets (each 2-3 mm, slightly irregular, glossy, juicy). "
           "Colour: mostly deep purple-black, some dark red-purple and a few red (less ripe); each drupelet has a tiny dark style remnant hair/dot; a short green-to-brown stalk on some berries. "
           "Juicy translucency in the red ones, sharp little highlights on every drupelet."),
 dict(id='k07_chixiaodou', cn='赤小豆', en='rice beans / adzuki (chi xiao dou)', start=656, end=664, kind='pile', text='light', label_big='藏着', label_small='赤小豆', item_mm=7,
      look="Mound of 赤小豆 (rice bean). Each 5-8 mm long, 3-5 mm wide, elongated cylindrical-oblong with rounded ends, dark red to purplish maroon, smooth, semi-gloss with soft highlights, "
           "one side has a narrow white linear hilum (种脐) about half the bean length, slightly sunken with a faint central line. Small colour variation, a few wrinkled or paler beans."),
 dict(id='k08_heye', cn='荷叶', en='lotus leaf with water droplets', start=664, end=672, kind='surface', text='light', label_big='藏着', label_small='荷叶',
      look="Macro across a fresh lotus leaf. Surface: matte velvety blue-green to mid green with a waxy bloom (very rough, slight sheen at grazing angle), gently undulating; "
           "prominent pale green veins radiating from the centre and forking dichotomously toward the rim, with a faint finer vein mesh between; the far rim is wavy and thin, slightly translucent yellow-green. "
           "Several water droplets sit as near-perfect spheres/flattened beads (super-hydrophobic): clear, refractive, bright caustic spot beneath, sky reflection on top; a few tiny droplets."),
 dict(id='k09_gancao', cn='甘草', en='licorice root slices', start=672, end=680, kind='disc', text='light', label_big='本草', label_small='甘草',
      look="Macro across the cut face of a licorice root slice. Cut face: pale yellow to yellow, dry, fibrous and slightly powdery, with a clear cambium ring and strong radial medullary rays "
           "(菊花心 radiating pattern) and radial fissures/cracks, tiny pores (vessels) aligned along rays; coarse fibres slightly raised. Bark at the far rim: reddish-brown to grey-brown, longitudinally wrinkled, ~1 mm."),
 dict(id='k10_jianghuang', cn='姜黄', en='turmeric rhizome (cut cross-section)', start=680, end=688, kind='disc', text='light', label_big='本草', label_small='姜黄',
      look="Macro across the cut face of a turmeric rhizome. Flesh: intense deep orange-yellow to golden orange, dense, waxy/horny lustre (角质样) with soft specular sheen, "
           "a distinct paler-yellow endodermis ring at ~70% radius, scattered tiny vascular dots, slightly darker orange core. Skin at the far rim: yellow-brown to khaki, thin, wrinkled with ring-node scars and fine rootlet stubs. Some yellow powder dust."),
 dict(id='k11_shaji', cn='沙棘', en='sea buckthorn berries', start=688, end=696, kind='pile', text='light', label_big='本草', label_small='沙棘', item_mm=8,
      look="Mound of sea buckthorn berries. Each 6-9 mm, oval/near-round, bright orange to golden-orange (some yellow-orange, some red-orange), thin taut skin, juicy and translucent (strong orange SSS glow, soft internal shading), "
           "glossy with soft highlights, speckled with minute brownish/silvery scale dots, a tiny dark brown stigma dot at the tip and a small stem scar at the base; a few short brown stalks and a narrow silvery-green leaf or two."),
 dict(id='k12_juemingzi', cn='决明子', en='cassia seeds (jue ming zi)', start=696, end=704, kind='pile', text='dark', label_big='本草', label_small='决明子', item_mm=5,
      look="Mound of cassia seeds. Each 3-7 mm long, 2-4 mm wide, rhomboid-cylindrical (菱方形) short rods with obliquely truncated ends (one end pointed), "
           "greenish-brown to dark olive-brown / coffee brown, smooth, hard and glossy; each has a raised ridge line down two opposite sides and a paler narrow sunken line beside the ridge. Colour variation among seeds."),
 dict(id='k13_luohanguo', cn='罗汉果', en='dried monk fruit (luo han guo)', start=704, end=712, kind='surface', text='dark', label_big='本草', label_small='罗汉果',
      look="Macro across a whole dried monk fruit (a 5-6 cm sphere): its top is the horizon arc. Shell: thin, hard, brittle; colour mottled brown / yellowish-brown with olive-green-brown patches and darker brown blotches; "
           "satin-matte with a faint sheen; covered with very short fine pale yellowish fuzz (visible as a soft halo on the silhouette and a velvety sheen); 6-11 faint darker longitudinal lines running pole to pole; "
           "tiny pits/dents and a small round stem scar. Not a smooth plastic ball."),
 dict(id='k14_rougui', cn='肉桂', en='cassia cinnamon bark', start=712, end=720, kind='pile', text='light', label_big='本草', label_small='肉桂', item_mm=80,
      look="Mound of cassia cinnamon bark quills and chunks (肉桂). Thick bark 2-6 mm rolled into scrolls/troughs 6-10 cm long. Outer surface: grey-brown, rough, with fine transverse lenticel ridges and pale lichen-grey patches; "
           "inner surface: warm red-brown, smoother, with fine longitudinal striations and a slight oily sheen; broken ends show a granular layered cross-section with a paler line. "
           "Rolled ends show the scroll/spiral. Pieces overlap in a natural heap; some splinters and bark dust."),
 dict(id='k15_qianshi', cn='芡实', en='euryale seeds (fox nut)', start=720, end=728, kind='pile', text='light', label_big='本草', label_small='芡实', item_mm=7,
      look="Mound of dried euryale seeds (芡实), mostly broken halves plus whole ones. Whole: 5-8 mm spheres. About two-thirds of the surface is covered by a thin red-brown to dark purplish-brown seed coat with faint irregular net veining; "
           "one end (about one-third) is yellowish-white with a small dimple (hilum). Broken halves show a flat chalk-white, floury, slightly rough fracture face. Matte, starchy."),
 dict(id='k16_lingzhi', cn='灵芝', en='reishi / lingzhi mushroom cap', start=728, end=736, kind='surface', text='light', label_big='本草', label_small='灵芝',
      look="Macro across the top of a real lingzhi (Ganoderma lucidum) cap: the far margin is the horizon arc. Surface: lacquered/varnished crust with strong glossy highlights, concentric growth zones and ridges/furrows (ring grooves of varying width), "
           "fine radial wrinkles. Colour bands from the margin inward: pale cream-yellow / ochre growing edge, then orange, red-orange, red-brown, to deep mahogany/purple-brown; margin slightly thick, rounded and wavy. "
           "Patches dusted with matte cocoa-brown spore powder that kill the gloss; a few small dents and scratches."),
]

LONG = [
 dict(id='s00_intro', start=0, end=192, kind='2d'),
 dict(id='s01_yinyang', start=192, end=256, kind='2d'),
 dict(id='e01_outro', start=736, end=1248, kind='2d'),
]

def main():
    out = dict(fps=FPS, width=W, height=H, nframes=NFRAMES, shots=SHOTS, scenes2d=LONG,
               producer_name_old='肖玟玥', producer_name_new='肖汶玥')
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots.json')
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('wrote', p, len(SHOTS), 'shots')

if __name__ == '__main__':
    main()
