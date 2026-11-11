export const meta = {
  name: 'promo-author-film',
  description: 'Author procedural Canvas scenes for one film of the series (one agent per shot, each self-reviews rendered previews)',
  phases: [{ title: 'Author', detail: 'one agent per shot: write the scene module, render previews, look at them, iterate' }],
}

const PROJECT = '/home/user/kashing/gujian-promo'
const SCRATCH = '/tmp/claude-0/-home-user-kashing/82b55bb9-0385-5108-b6bb-ac0899659655/scratchpad'
const film = args.film                 // 'coins' | 'antiques'
const ids = args.ids
const MODEL = args.model || undefined        // model override for every agent (omit to inherit the session model)
const topic = { arch: '中国古建筑', coins: '中国古钱币', antiques: '中国古玩', tcm: '中国中医药' }[film]
const scenesDir = `${PROJECT}/src/films/${film}/scenes`
const previewDir = `${PROJECT}/build/${film}/preview`
const storyboard = `${PROJECT}/docs/storyboard-${film}.json`
const researchGlob = `${PROJECT}/docs/research/${film}-*.json`

const SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    file: { type: 'string' },
    status: { type: 'string', enum: ['done', 'partial', 'failed'] },
    iterations: { type: 'integer' },
    initMs: { type: 'number' },
    drawMs: { type: 'number' },
    previewClean: { type: 'boolean' },
    whatItShows: { type: 'string' },
    selfCritique: { type: 'string' },
    arcAligned: { type: 'boolean' },
    textZoneClean: { type: 'boolean' },
    factsUsed: { type: 'array', items: { type: 'string' } },
    libIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'file', 'status', 'previewClean', 'whatItShows', 'selfCritique'],
}

const OPENING = `
**这个镜头是全片的开场，也是片尾回归的画面，有额外的接口要求**（片名卡会复用它：镜头先上仰到你画面上方那片干净的深色空间、叠上白色片名，再摇回开场画面，首尾相接循环）：
- 除了默认导出，场景文件还必须具名导出三样东西：
  \`export function initOpening(env)\`（预渲染图层，可重复调用，内部自己判断是否已初始化）；
  \`export function drawOpening(ctx, env, { tilt = 0, k = 0 } = {})\`：tilt 是镜头上仰的像素数（整幅画面向下平移 tilt 像素，上方露出更多"天空"），k ∈ [0,1] 是画面自身的时间进度（光的变化、缓慢运动）；
  \`export const TITLE_TILT = 720\`（片名卡上仰的距离，可在 600—800 之间按你的画面调整）。
- 默认导出的 draw(ctx, env, p) 只需调用 \`drawOpening(ctx, env, { tilt: 0, k: p })\`。
- 当 tilt = TITLE_TILT 时，整个画面（1920×1080）必须是一片**干净、深色、均匀**的空间（可以在画面最底部留一点微弱的辉光，像参考片片名卡那样），用来叠白色片名（片名在 y≈498 处）；所以你的"天空/背景"必须一直画到弧顶上方至少 TITLE_TILT + 600 像素处，并且越往上越暗、越干净。
- drawOpening 在 k = 0、tilt = 0 时的画面就是全片第一帧，也是全片最后一帧，必须完全一致（确定性绘制）。
- 范例：${PROJECT}/src/scenes/s01-great-wall-dawn.js（第一支片子的开场，导出了同样的接口；请照这个结构写）。
- 预览时请额外检查上仰状态：\`node tools/preview.js title --film ${film}\`（片名卡场景由脚手架生成，会 import 你的这三个导出；如果它报错，多半是你的导出名不对）。看 ${previewDir}/title_sheet.jpg：第 1 格是片名卡 A（上仰状态 + 片名），第 3 格是摇回后的开场画面。`

function prompt(id) {
  return `你是一位擅长用 Canvas 2D 做程序化插画的美术程序员，正在为系列宣传短片之《${topic}》绘制其中一个镜头：**${id}**（影片 id：${film}）。

项目目录：${PROJECT}

请按顺序做：
1. 读 ${PROJECT}/docs/AUTHORING.md（完整阅读，这是硬性规范：弧线规则、文字安全区、质感要求、**「对照参考片」一节的七条**、工作流程）。注意它最初是为系列第一支片子写的，本片有两处不同：
   - 你的场景文件在 **${scenesDir}/<任务单里的 file>**，所以 import 写 \`import * as L from '../../../lib/core.js';\`；
   - 预览命令要加影片参数：\`cd ${PROJECT} && node tools/preview.js ${id} --film ${film}\`，输出在 ${previewDir}/：${id}_sheet.jpg、${id}_mid.jpg 和 **${id}_compare.jpg（左半是参考片的同一镜头，右半是你的画面）**。
2. 读 ${storyboard}，找到 id 为 "${id}" 的任务单（file / name / frames / beat / tone / refDesc / brief / palette / motion / accuracy）；顺便读一下文件开头的 tagline、colourJourney，了解全片气质。
3. 用 Read 工具看参考片里同一位置的镜头（首/中/末三帧）：${PROJECT}/build/ref/trio/ref_${id}_a.jpg、ref_${id}_b.jpg、ref_${id}_c.jpg。体会它的景别（几乎都是微距特写）、构图（两三个大形）、质感密度、明暗关系和运动幅度（画面角落的"抖音"水印和白色英文字与你无关）。你要画的是它在本题材里的"对应物"：内容以任务单为准，**手艺水准以参考片为准**。客户的原话是：「多去参考、多去对比，审美和画图要最好」。
4. 资料核实文件 ${researchGlob}：用 grep 找出与你这个镜头题材相关的条目来读（depiction / pitfalls / captionFacts），形制以它为准；找不到相关条目就按任务单里的 accuracy 画。
5. 读工具库 ${PROJECT}/src/lib/core.js，以及两个范例：${PROJECT}/src/scenes/s02-liuli-wadang.js（分层预渲染 + blit 运动 + 沿弧排布）和 ${PROJECT}/src/scenes/s03-door-stud.js（微距质感：高度图浮雕光影、景深虚化背景）。
6. 写你的场景文件。**只允许创建/修改这一个文件**（很多作者在并行写别的场景；不要动 core.js、timeline.js、player.js、tools/、docs/、别人的场景）。${id === 's01' ? OPENING : ''}
7. 跑预览，然后用 Read 工具**亲眼查看** ${id}_compare.jpg 和 ${id}_sheet.jpg（必要时再看全尺寸的 ${id}_mid.jpg），对照「对照参考片」的七条和任务单挑毛病，修改，再渲染。**至少迭代 4 轮，上限 7 轮**；每一轮都要真的看图，并回答三个问题：缩到邮票大小时和参考片一样抓眼吗？主体有参考片那么大、那么简单吗？遮住内容只看质感，像照片/实物还是像矢量图/CG？

验收标准（自己逐条核对）：
- **与参考片并排不掉价**（看 compare 图）：景别够近、构图简洁、单元不规整、有主光和景深、明暗是两大块、颜色干净。
- 画面最显著的边缘精确落在 env.arc 上（看 sheet 第 4 格的洋红参考线），横贯全宽，弧顶在正中。
- 满画面的真实质感与光影，不是扁平矢量图；主体大、对比强，0.2—1 秒内一眼能认出是什么。
- **色调要有趣**：这是客户特别强调的。忠实使用任务单给的配色，颜色要大胆、明确、干净、有记忆点，不要画成发灰发闷的"安全色"。
- 内容、形制符合任务单；器物上的文字只写任务单允许的；不编造文字、数字、年代、款识。
- 如果 beat ≠ 0：弧顶上方的文字安全区平静均匀，与 tone 声明形成强对比（sheet 里会叠加真实的标语，检查它是否清晰好读）。
- 所有会被 rot/zoom 的图层都画满了 PAD 余量，首帧/末帧/中间帧都没有露边、穿帮、黑边。
- 预览命令退出码为 0、没有 ERRORS；init ≤ 4000 ms，draw ≤ 120 ms/帧。
- 没有使用 Math.random()、Date、网络请求或外部图片。

注意事项：
- 这是一支正式的宣传片，请拿出你最好的画面水准；宁可把少数元素画得有质感、有体积，也不要堆砌一堆简陋的小图形。
- 多用"先预渲染成图层、再 blit"的做法保证性能；ImageData 级别的逐像素运算放在 init 里并降低分辨率。
- 机器上同时有很多人在渲染，预览命令偶尔会慢，耐心等它完成；不要并行跑多个预览。
- 完成后只返回结构化结果（最终文件已写入磁盘即可，不要把代码贴回来）。selfCritique 控制在 200 字以内，只写最要紧的 3 条不足；factsUsed 最多 5 条（凭自己记忆而未核实的要标明"未核实"）；libIssues 最多 2 条。`
}

phase('Author')
const results = await parallel(ids.map(id => () =>
  agent(prompt(id), { label: `scene:${film}:${id}`, phase: 'Author', schema: SCHEMA, agentType: 'general-purpose', ...(MODEL ? { model: MODEL } : {}) })
))
const done = results.filter(Boolean)
log(`scenes returned: ${done.length}/${ids.length}`)
// compact return: details stay in the journal
return { film, done: done.filter(r => r.status === 'done' && r.previewClean).map(r => r.id), notClean: done.filter(r => !(r.status === 'done' && r.previewClean)).map(r => r.id), missing: ids.filter((id, i) => !results[i]) }
