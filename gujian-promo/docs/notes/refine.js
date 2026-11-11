export const meta = {
  name: 'promo-refine',
  description: 'Reference-driven refinement of shots: polish against the reference film side by side, independent three-way verification, optional second cycle',
  phases: [
    { title: 'Polish', detail: 'one polisher per shot, at least three rounds, every round compared side by side with the reference film' },
    { title: 'Verify', detail: 'independent sceptic compares reference / before / after and reverts regressions' },
    { title: 'Second pass', detail: 'shots still short of the reference get one more polish and verification' },
  ],
}

const PROJECT = '/home/user/kashing/gujian-promo'
const film = args.film                       // 'arch' | 'coins' | 'antiques' | 'tcm'
const ids = args.ids
const notes = args.notes || {}               // director's notes per shot id
const MODEL = args.model || undefined        // model override for every agent (omit to inherit the session model)
const CYCLES = args.cycles || 2
const UNFINISHED = new Set(args.unfinished || [])   // shots whose first author was cut off: the file may be an early draft
const filmFlag = film === 'arch' ? '' : ` --film ${film}`
const scenesDir = film === 'arch' ? `${PROJECT}/src/scenes` : `${PROJECT}/src/films/${film}/scenes`
const previewDir = film === 'arch' ? `${PROJECT}/build/preview` : `${PROJECT}/build/${film}/preview`
const reviewDir = `${PROJECT}/build/${film}/review`
const storyboard = film === 'arch' ? `${PROJECT}/docs/storyboard.json` : `${PROJECT}/docs/storyboard-${film}.json`
const colourScript = `${PROJECT}/docs/colour-${film}.json`
const notesFile = `${PROJECT}/docs/notes/director-${film}.json`
const topic = { arch: '中国古建筑', coins: '中国古钱币', antiques: '中国古玩', tcm: '中国中医药' }[film]
const num = (id) => parseInt(id.slice(1), 10)
const sid = (n) => 's' + String(n).padStart(2, '0')
const opts = (label, phase, schema) => ({ label, phase, schema, agentType: 'general-purpose', ...(MODEL ? { model: MODEL } : {}) })

const REDLINES = film === 'antiques' ? '\n- 内容红线：不出现象牙、犀角、玳瑁。'
  : film === 'tcm' ? '\n- 内容红线：只做文化呈现，不出现任何功效、主治、用法用量；人物只取手部局部。'
  : ''

const CONTEXT = (id) => `项目：${PROJECT} —— 系列宣传短片之《${topic}》（20 秒、37 个快切镜头共用同一条居中隆起的弧线，全部 Canvas 2D 程序化绘制）。
你负责的镜头：**${id}**（影片 id：${film}）
- 画面规范：${PROJECT}/docs/AUTHORING.md —— 完整阅读，尤其是「对照参考片」一节（七条差距就是验收标尺）。${film === 'arch' ? '' : `本片的场景文件在 ${scenesDir}/ 下，import 路径是 '../../../lib/core.js'，预览命令要加 \`--film ${film}\`，预览输出在 ${previewDir}/。`}
- 任务单：${storyboard} 里 id 为 "${id}" 的那条（brief / palette / motion / accuracy / tone / beat）；场景文件就是其中 file 字段指的那个，位于 ${scenesDir}/
- 全片调色说明（文件存在就读本镜头的条目）：${colourScript}
- 资料核实文件（用 grep 查与本镜头题材相关的 depiction / pitfalls；arch 用 g*.json，其他影片用 ${film}-*.json）：${PROJECT}/docs/research/
- **预览要排队**：机器同时只允许 3 个渲染进程（内存有限）。预览命令会自动排队，看到「[render queue] … waiting for a turn」是正常的，等着就行；给跑预览的 Bash 设置 timeout: 600000，不要同时开多个预览、不要放到后台轮询、不要自己写等待脚本。
- 预览命令：\`cd ${PROJECT} && node tools/preview.js ${id}${filmFlag}\` → 在 ${previewDir}/ 生成三张图：
  · ${id}_compare.jpg —— **左半是参考片的同一镜头（上：中间帧；下：首帧/末帧），右半是我们的画面**
  · ${id}_sheet.jpg —— 2×2：开头 / 中间 / 结尾 / 中间+弧线与文字安全区参考线
  · ${id}_mid.jpg —— 1920×1080 中间帧（带标语文字）
  · ${id}_zoom.jpg —— 中间帧三处**原始像素（1:1）**局部，用来检查细腻程度
- 参考片原帧（1280×720，首/中/末）：${PROJECT}/build/ref/trio/ref_${id}_a.jpg、ref_${id}_b.jpg、ref_${id}_c.jpg（角落的"抖音"水印和白色英文字与我们无关）
- 相邻镜头的中间帧（硬切前后紧挨着它的画面；文件不存在就跳过）：${num(id) > 1 ? `${previewDir}/${sid(num(id) - 1)}_mid.jpg` : '（无上一镜头）'} 和 ${num(id) < 37 ? `${previewDir}/${sid(num(id) + 1)}_mid.jpg` : '（下一个是深色的片名卡）'}`

const POLISH_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    changed: { type: 'boolean' },
    summary: { type: 'string', description: 'what changed, at most 150 Chinese characters' },
    gapsFound: { type: 'array', items: { type: 'string' }, description: 'the gaps versus the reference you identified, at most 6' },
    gapsLeft: { type: 'array', items: { type: 'string' }, description: 'gaps still visible in the final state, at most 4' },
    parityBefore: { type: 'integer', description: '1-10: craft level versus the reference before your work' },
    parityAfter: { type: 'integer', description: '1-10: craft level versus the reference after your work' },
    previewClean: { type: 'boolean' },
    initMs: { type: 'number' }, drawMs: { type: 'number' },
    rounds: { type: 'integer' },
  },
  required: ['id', 'changed', 'summary', 'previewClean', 'parityAfter', 'rounds'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    verdict: { type: 'string', enum: ['after-better', 'no-real-difference', 'after-worse-reverted', 'after-broken-reverted'] },
    reasons: { type: 'string', description: 'at most 150 Chinese characters' },
    arcOk: { type: 'boolean' }, textOk: { type: 'boolean' }, previewClean: { type: 'boolean' },
    parity: { type: 'integer', description: '1-10: craft level of the state left on disk versus the reference shot (10 = could be cut into the reference film)' },
    finalScore: { type: 'integer', description: '1-10 overall, for the state left on disk' },
    fineness: { type: 'integer', description: '1-10: how fine the frame is at native resolution (10 = flawless at 1:1; 7 = clean; 5 = visibly coarse, noisy or jagged)' },
    remaining: { type: 'array', items: { type: 'string' }, description: 'concrete, implementable fixes still needed, most important first, at most 5' },
  },
  required: ['id', 'verdict', 'reasons', 'arcOk', 'previewClean', 'parity', 'finalScore', 'remaining'],
}

function polishPrompt(id, cycle, prev) {
  const jsTag = cycle === 1 ? 'orig' : `c${cycle - 1}`
  const imgTag = cycle === 1 ? 'before' : `c${cycle - 1}`
  const keepBaseline = cycle === 1
    ? `如果 ${reviewDir}/${id}.${jsTag}.js 或 ${reviewDir}/${id}_${imgTag}_mid.jpg 已经存在，**不要覆盖**（那是更早的原始版本，就用它当基线）；缺哪个补哪个`
    : '这一轮的基线每次都重新生成（覆盖旧的）'
  return `你是一位顶尖的 Canvas 2D 程序化插画师。任务：把镜头 ${id} 打磨到**能和参考片并排放映**的水准。客户看过上一版后的原话有两句：「多去参考、多去对比，审美和画图要最好」「你每一帧要画得够细腻」。所以这次的工作方法是两条：**每一轮都把自己的画面和参考片并排比，差在哪就改哪；每一轮都放大到原始像素检查细腻程度（AUTHORING.md「细腻」一节的七条）。**

${CONTEXT(id)}

【总导演对这个镜头的意见 —— 最高优先级，必须落实；与任务单冲突时以它为准】先读 ${notesFile}：这是一个 JSON 对象，键为 "${id}" 的那条就是总导演把这个镜头和参考片并排看过之后写的意见（文件或这个键不存在，说明没有特别意见，按「对照参考片」七条自己判断）。${notes[id] ? `\n补充意见：${notes[id]}` : ''}
${cycle === 1
    ? `\n【上一轮美术指导的审片意见】如果文件 ${reviewDir}/${id}_crit.json 存在就先读它（whatISee / keep / fixes / paletteTarget）：其中关于色调和细节收尾的意见仍然有效，采纳你认同的；与总导演意见冲突时以总导演为准。不存在就跳过。\n`
    : `\n【上一轮复核留下的问题 —— 这一轮就是来解决它们的】\n${(prev.remaining || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}\n（上一轮复核给的"与参考片的差距"分：${prev.parity}/10，总分：${prev.finalScore}/10）\n`}
${UNFINISHED.has(id) && cycle === 1 ? `【注意】这个镜头的第一位作者中途被打断，磁盘上的文件可能只是初稿甚至写到一半：先对照任务单把该画的内容画完整（需要时读 ${PROJECT}/src/scenes/s02-liuli-wadang.js 和 s03-door-stud.js 两个范例的做法），再做下面的对照参考片打磨。这种情况下轮数上限放宽到 8 轮。\n` : ''}步骤：
0. **建立基线**：先跑一次预览，然后 \`mkdir -p ${reviewDir}\`，把场景文件备份为 ${reviewDir}/${id}.${jsTag}.js，把 ${previewDir}/${id}_mid.jpg 和 ${id}_sheet.jpg 复制为 ${reviewDir}/${id}_${imgTag}_mid.jpg 和 ${id}_${imgTag}_sheet.jpg。${keepBaseline}。如果当前文件预览就报错，先把它修到能正常渲染，再建基线。
1. 读 AUTHORING.md（「对照参考片」一节逐条读）、任务单、场景文件源码；按需读 ${PROJECT}/src/lib/core.js。
2. 用 Read 看 ${id}_compare.jpg、${id}_sheet.jpg，再直接看参考片原帧 ref_${id}_b.jpg（需要时看 _a、_c）和相邻两个镜头的中间帧。
3. 对照「对照参考片」的七条，先在心里列出**差距清单**（最多 6 条，按对观感的影响排序：景别够不够近、够不够简洁、是否规整得像 CG、有没有摄影感和景深、明暗是不是两大块、颜色干不干净、线条够不够粗而有力），再动手。允许大改，包括重画构图（总导演要求推近或重做时就该这么做）；但**只允许修改这一个场景文件**，文件名和导出接口不变。
4. 每改一轮：跑预览 → 用 Read 看 ${id}_compare.jpg、${id}_zoom.jpg 和 ${id}_sheet.jpg（必要时再看 ${id}_mid.jpg）→ 对照「细腻」七条检查 zoom 图（粗颗粒、锯齿、色带、马赛克块、糊边、点阵抖动一律要消灭；微观细节要是画出来的结构，不是噪声）→ 再回答三个问题：缩到邮票大小时和参考片一样抓眼吗？主体有参考片那么大、那么简单吗？遮住内容只看质感，像照片/实物还是像矢量图/CG？答不上"是"就继续。**至少 3 轮，上限 6 轮**；每一轮都要真的看图。
5. 硬性约束（每轮自查）：
   - 画面最显著的边缘仍然精确落在共用弧线上（sheet 第 4 格的洋红线），横贯全宽，弧顶在正中。
   - 带标语的镜头（任务单 beat ≠ 0）：弧顶上方文字安全区平静均匀，标语清晰好读；场景导出的 tone（'light' 白字 / 'dark' 墨字）要与弧上背景的明暗匹配。
   - 首帧、末帧没有露边穿帮；预览退出码 0、无 ERRORS；init ≤ 4000 ms、draw ≤ 120 ms/帧；不用 Math.random / Date / 网络 / 外部图片。
   - 色调大胆、明确、干净，并与前后两个镜头在色相和明度上都形成反差（看相邻镜头的中间帧）。
   - 不新增任何文字、数字、年代、款识；器物上的字只保留任务单允许的。${REDLINES}${id === 's01' ? `\n   - 这是开场镜头：合成器会在弧线以下正中叠品牌名「志和诚」（预览里能看到；片名卡 title 的预览第 3 格也能看到）。x 640—1280、弧顶下方 110—290 px 这一带必须保持深色（亮度 < 0.2）、平静、没有高光和纹理起伏；必须保留具名导出的 initOpening / drawOpening / TITLE_TILT 及 tilt、k 两个参数的行为，改完跑一次 title 的预览确认片名卡正常。` : ''}
6. 某处改动试过之后反而更差，就撤回那一处。宁可少改，不要改坏；如果最终整体不如基线，就把基线文件复制回去并如实报告 changed=false。
完成后只返回结构化结果（不要贴代码）。parityBefore / parityAfter 是你对"与参考片手艺水准的差距"的打分（10 = 可以直接剪进参考片）。`
}

function verifyPrompt(id, cycle, pol) {
  const jsTag = cycle === 1 ? 'orig' : `c${cycle - 1}`
  const imgTag = cycle === 1 ? 'before' : `c${cycle - 1}`
  return `你是独立的成片质检，立场是**怀疑**：默认认为"打磨没有让画面变好"，除非图像证明它确实更好。你没有参与前面的工作。标尺是参考片：客户的要求是「多去参考、多去对比，审美和画图要最好」。

${CONTEXT(id)}

总导演对这个镜头的意见在 ${notesFile} 里键为 "${id}" 的那条（文件或键不存在就是没有）；判断时要看它有没有被落实。${notes[id] ? `补充意见：${notes[id]}` : ''}

背景：打磨的同事刚改完镜头 ${id}。他自述：${pol.summary}
- 打磨前的图：${reviewDir}/${id}_${imgTag}_mid.jpg 和 ${reviewDir}/${id}_${imgTag}_sheet.jpg
- 打磨前的源码备份：${reviewDir}/${id}.${jsTag}.js

步骤：
1. 运行预览命令得到"打磨后"的图（记下退出码、是否有 ERRORS、init/draw 毫秒数）。
2. 生成三联对比图：\`cd ${PROJECT} && python3 tools/compare.py --tri ${id} --before ${reviewDir}/${id}_${imgTag}_mid.jpg --dir ${previewDir} --label ${film}\` → ${previewDir}/${id}_tri.jpg（参考片 | 打磨前 | 打磨后）。用 Read 看它；再看 ${id}_compare.jpg、${id}_sheet.jpg，以及全尺寸的打磨前 mid 与现在的 ${id}_mid.jpg；再看相邻两个镜头的中间帧，判断硬切时的反差。
3. 弧线客观检查：\`cd ${PROJECT} && node tools/preview.js ${id}${filmFlag} --notext >/dev/null; python3 tools/arccheck.py${filmFlag} | grep -E "shot|${id}"; node tools/preview.js ${id}${filmFlag} >/dev/null\`（peak@dr 应在 0 附近 ±8 像素内，或 at arc 接近 peak）。
4. 用 Read 看 ${previewDir}/${id}_zoom.jpg（三处原始像素局部），对照 AUTHORING.md「细腻」七条：有没有粗颗粒、锯齿、色带、马赛克块、糊边、点阵抖动；打磨后是否比打磨前更细腻（需要时写一小段 python 从打磨前的 mid 图里裁同样三处来比）。再对照「对照参考片」的七条，逐项判断"打磨后"相对"打磨前"：景别与简洁、是否规整得像 CG、摄影感与景深、明暗两大块、颜色干净、一眼可读、弧线对齐、文字清晰（带标语的镜头）、首末帧有无露边、形制有无新错误、有没有新增不该有的文字。
5. 裁决：
   - 明显更好 → "after-better"，保留现状。
   - 差不多 → "no-real-difference"，保留现状。
   - 变差了（更脏、更花、更灰、更像 CG、丢了好东西、文字更难读、弧线更不准）→ **恢复备份**：\`cp ${reviewDir}/${id}.${jsTag}.js ${scenesDir}/<file>\`，重新跑预览确认恢复成功，"after-worse-reverted"。
   - 预览报错/超时/露边穿帮且你无法用一两行改动修好 → 同样恢复备份，"after-broken-reverted"。（显而易见的小 bug 可以直接修好再判断；除此之外你不改画面。）
6. 给留在磁盘上的最终版本打分：fineness = 原始像素下的细腻程度（1—10：10 = 放大到 1:1 无可挑剔，7 = 干净，5 = 看得出粗糙、有噪点或锯齿）；parity = 与参考片同一镜头并排时的手艺水准（1—10，10 = 可以直接剪进参考片；7 = 放在一起不掉价；5 = 一眼看出是电脑画的）；finalScore = 总体 1—10。remaining：仍然可见、值得再改的问题，写成打磨同事可以直接执行的指令（改哪里、改成什么），最重要的排前面，最多 5 条；没有就空数组。如实打分，不要客气。`
}

async function cycle(id, n, prev) {
  const phaseP = n === 1 ? 'Polish' : 'Second pass'
  const phaseV = n === 1 ? 'Verify' : 'Second pass'
  const pol = await agent(polishPrompt(id, n, prev), opts(`polish${n}:${film}:${id}`, phaseP, POLISH_SCHEMA))
  if (!pol) return { pol: null, ver: null }
  if (!pol.changed) return { pol, ver: null }
  const ver = await agent(verifyPrompt(id, n, pol), opts(`verify${n}:${film}:${id}`, phaseV, VERIFY_SCHEMA))
  return { pol, ver }
}

const results = await pipeline(
  ids,
  (id) => cycle(id, 1, null),
  (c1, id) => {
    if (!c1 || !c1.ver) return { c1, c2: null }
    const v = c1.ver
    const needsMore = CYCLES >= 2 && (v.parity < 7 || v.finalScore < 7 || (v.fineness !== undefined && v.fineness < 7)) && (v.remaining || []).length > 0
    if (!needsMore) return { c1, c2: null }
    return cycle(id, 2, v).then((c2) => ({ c1, c2 }))
  },
)

// compact return (summaries, gap lists and verdict reasons stay in the journal)
return results.map((r, i) => {
  if (!r || !r.c1 || !r.c1.pol) return { id: ids[i], failed: true }
  const last = (r.c2 && r.c2.ver) || r.c1.ver
  return {
    id: ids[i],
    changed: !!r.c1.pol.changed,
    v1: r.c1.ver ? r.c1.ver.verdict : (r.c1.pol.changed ? 'unverified' : 'unchanged'),
    v2: r.c2 ? (r.c2.ver ? r.c2.ver.verdict : (r.c2.pol ? (r.c2.pol.changed ? 'unverified' : 'unchanged') : 'failed')) : null,
    parity: last ? last.parity : null,
    score: last ? last.finalScore : null,
    fine: last && last.fineness !== undefined ? last.fineness : null,
    left: last && last.remaining ? last.remaining.length : null,
  }
})
