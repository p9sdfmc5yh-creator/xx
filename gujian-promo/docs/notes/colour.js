export const meta = {
  name: 'promo-colour-script',
  description: 'Film-level colour script: two colourists with different lenses propose per-shot palettes, a supervisor merges them',
  phases: [
    { title: 'Propose', detail: 'two independent colourists look at the whole film and propose a colour journey' },
    { title: 'Merge', detail: 'colour supervisor writes the final per-shot colour script' },
  ],
}
const PROJECT = '/home/user/kashing/gujian-promo'
const film = args.film
const topic = { arch: '中国古建筑', coins: '中国古钱币', antiques: '中国古玩', tcm: '中医' }[film]
const contactDir = film === 'arch' ? `${PROJECT}/build/contact` : `${PROJECT}/build/${film}/contact`
const previewDir = film === 'arch' ? `${PROJECT}/build/preview` : `${PROJECT}/build/${film}/preview`
const storyboard = film === 'arch' ? `${PROJECT}/docs/storyboard.json` : `${PROJECT}/docs/storyboard-${film}.json`
const REF = '/tmp/claude-0/-home-user-kashing/82b55bb9-0385-5108-b6bb-ac0899659655/scratchpad/ref/shots'

const COMMON = `我们在做系列宣传短片之《${topic}》：20 秒、37 个快切镜头（约 1 秒 → 0.5 秒 → 0.2 秒越切越快），所有画面共用同一条居中隆起的弧线，每一刀剪辑都换题材、换媒介、换颜色。全部画面是 Canvas 2D 程序化绘制的，现在每个镜头都有了初稿。**客户明确要求：色调尽可能有趣。** 接下来每个镜头会有专人按"调色脚本"去打磨颜色，所以这份脚本要具体到色值。

请先看素材（用 Read 工具）：
- 全片当前的镜头总览（每张 9 格，左上角标了镜头号；深红色空格表示该镜头暂时还没有画面）：
  ${contactDir}/sheet_mid_01.jpg  ${contactDir}/sheet_mid_02.jpg  ${contactDir}/sheet_mid_03.jpg  ${contactDir}/sheet_mid_04.jpg  ${contactDir}/sheet_mid_05.jpg
  想看某个镜头的大图：${previewDir}/sNN_mid.jpg
- 分镜任务单（每个镜头原定的内容与配色 palette）：${storyboard}
- 参考广告片的镜头总览（看它如何用颜色制造节奏：青绿撞橙红、洋红撞黑、明黄撞黑白……几乎每一刀都是色相与明度的大跳）：
  ${REF}/shots_01.jpg  ${REF}/shots_02.jpg  ${REF}/shots_03.jpg  ${REF}/shots_04.jpg

要做的判断：
1. 把 37 个镜头当前的主色（背景色 / 主体色 / 点缀色）排成一行看：哪里连续几个镜头色相或明度太接近？哪些镜头发灰、发闷、偏脏、或者只是"棕色 + 米色"的安全配色？全片冷暖、深浅、浓淡的起伏有没有节奏？最后 13 个 0.2—0.3 秒的镜头（s25—s37）是否像一串烟花那样每一下颜色都不同？
2. 为每个镜头给出目标配色：背景、主体、点缀各一到两个十六进制色值，并用一句话说明"改什么"（例如"天空从松石绿改成更深的孔雀蓝 #0f6e7a，墙帽的黄提亮到 #f2c21a，加一线朱红"）。已经很好的镜头就写"保持"，不要为改而改。
3. 颜色必须贴题、可信：器物/建筑本身的固有色不能乱改（例如黄琉璃瓦不能变蓝），可以大胆处理的是背景色、光的颜色、阴影的色相、点缀色、媒介（纸、绢、布、夜色）的颜色。优先使用有来历的中国传统色，给出色名和色值（色名拿不准就只给色值，不要生造名字）。
4. 带标语的镜头（s15—s37）：弧顶上方的文字区要保持均匀，并保证文字（白字或墨字）的对比度；不要把背景改成与字色接近的中间调。
5. 相邻镜头必须在色相**和**明度上都有明显反差（硬切时"啪"地一下）；同时全片要有 2—3 个贯穿的"记忆色"作为系列识别。`

const PROP_SCHEMA = {
  type: 'object',
  properties: {
    filePath: { type: 'string' },
    journey: { type: 'string', description: 'the colour journey of the whole film in 4-6 sentences' },
    weakest: { type: 'array', items: { type: 'string' }, description: 'shot ids whose colour most needs work, worst first' },
    signatureColours: { type: 'array', items: { type: 'string' } },
  },
  required: ['filePath', 'journey', 'weakest'],
}
const FORMAT = `输出一个 JSON 文件：
{ "film": "${film}", "journey": "全片色彩走向的一段话", "signatureColours": ["色名 #hex", …], "globalGrade": "对整片统一调色的建议（饱和度、对比、颗粒、暗角等，可为空）",
  "shots": [ { "id": "s01", "observed": "现在看到的主色", "verdict": "keep | tweak | recolour", "target": { "background": "色名 #hex", "subject": "色名 #hex", "accent": "色名 #hex" }, "direction": "一句话：改什么、怎么改", "contrastWithPrev": "与上一个镜头的反差点", "priority": 1 }, … s01 到 s37 共 37 条 ] }
priority：1 = 颜色问题最大、必须改；2 = 值得改；3 = 基本保持。写完后用 node -e 检查 JSON 能解析且恰好 37 条。`

phase('Propose')
const props = (await parallel([
  () => agent(`你是一位精通中国传统色的色彩顾问（熟悉传统色名、矿物与植物颜料、釉色、织物染色）。${COMMON}

你的侧重：让每个镜头的颜色"有来历、有气韵"——像一套传统色谱在 20 秒里依次点亮，同时保证相邻镜头的反差。

${FORMAT}
把文件写到 ${PROJECT}/docs/drafts/colour-${film}-a.json（目录不存在就创建）。只创建这一个文件。`, { label: `colourist-a:${film}`, phase: 'Propose', schema: PROP_SCHEMA, agentType: 'general-purpose' }),
  () => agent(`你是一位广告与时尚大片的调色师，以大胆、干净、有冲击力的撞色著称。${COMMON}

你的侧重：节奏与冲击 —— 每一刀硬切都要让观众的眼睛"被电一下"；敢用高饱和的纯色背景、互补色、冷暖对撞，但绝不脏、不俗、不花。

${FORMAT}
把文件写到 ${PROJECT}/docs/drafts/colour-${film}-b.json（目录不存在就创建）。只创建这一个文件。`, { label: `colourist-b:${film}`, phase: 'Propose', schema: PROP_SCHEMA, agentType: 'general-purpose' }),
])).filter(Boolean)
if (!props.length) return { error: 'no proposals' }

phase('Merge')
const merged = await agent(`你是这支片子的调色总监。${COMMON}

两位调色师已经各自提交了方案：
${props.map(p => `- ${p.filePath} —— ${p.journey}`).join('\n')}

请通读两份方案并亲自看镜头总览，逐个镜头择优或折中，合成**最终调色脚本**。把关要点：
- 把 37 个镜头的目标主色排成一行检查：相邻镜头色相与明度都要有明显反差；全片冷暖浓淡有起伏；s25—s37 每一下颜色都不同。
- 固有色不乱改；带标语镜头的文字区对比度有保证；"keep" 的镜头不要强行改。
- direction 要具体到打磨的美术程序员拿到就能执行（改哪一块、改成什么色值）。
- 给出 2—3 个贯穿全片的记忆色（signatureColours），以及对整片统一调色的建议（globalGrade）。

${FORMAT}
把最终文件写到 ${PROJECT}/docs/colour-${film}.json。只创建这一个文件。`, { label: `colour-supervisor:${film}`, phase: 'Merge', schema: PROP_SCHEMA, agentType: 'general-purpose' })
return { film, proposals: props, final: merged }
