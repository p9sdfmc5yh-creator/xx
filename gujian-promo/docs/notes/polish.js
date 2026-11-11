export const meta = {
  name: 'promo-polish',
  description: 'Detail-and-colour polish for a batch of shots: art-director critique → polisher → adversarial before/after verifier',
  phases: [
    { title: 'Critique', detail: 'art director looks at the rendered shot, its neighbours and the reference, lists concrete fixes' },
    { title: 'Polish', detail: 'a polisher implements the fixes and iterates on rendered previews' },
    { title: 'Verify', detail: 'independent before/after comparison; reverts the change if it is not clearly better' },
  ],
}

const PROJECT = '/home/user/kashing/gujian-promo'
const SCRATCH = '/tmp/claude-0/-home-user-kashing/82b55bb9-0385-5108-b6bb-ac0899659655/scratchpad'
const film = args.film                       // 'arch' | 'coins' | 'antiques'
const ids = args.ids                         // e.g. ['s03','s04']
const notes = args.notes || {}               // director's notes per shot id
const filmFlag = film === 'arch' ? '' : ` --film ${film}`
const scenesDir = film === 'arch' ? `${PROJECT}/src/scenes` : `${PROJECT}/src/films/${film}/scenes`
const previewDir = film === 'arch' ? `${PROJECT}/build/preview` : `${PROJECT}/build/${film}/preview`
const reviewDir = `${PROJECT}/build/${film}/review`
const storyboard = film === 'arch' ? `${PROJECT}/docs/storyboard.json` : `${PROJECT}/docs/storyboard-${film}.json`
const colourScript = `${PROJECT}/docs/colour-${film}.json`
const topic = { arch: '中国古建筑', coins: '中国古钱币', antiques: '中国古玩', tcm: '中医' }[film]
const num = (id) => parseInt(id.slice(1), 10)
const sid = (n) => 's' + String(n).padStart(2, '0')

const CONTEXT = (id) => `项目：${PROJECT} —— 系列宣传短片之《${topic}》（20 秒、37 个快切镜头共用同一条居中隆起的弧线，全部 Canvas 2D 程序化绘制）。
你负责的镜头：**${id}**${film === 'arch' ? '' : `（影片 id：${film}）`}
- 画面规范：${PROJECT}/docs/AUTHORING.md（弧线规则、文字安全区、质感要求；忽略开头的"调度说明"${film === 'arch' ? '' : `；本片的场景文件在 ${scenesDir}/ 下，import 路径是 '../../../lib/core.js'，预览命令要加 \`--film ${film}\`，预览输出在 ${previewDir}/`}）
- 任务单：${storyboard} 里 id 为 "${id}" 的那条（brief / palette / motion / accuracy / tone / beat）；场景文件就是其中 file 字段指的那个，位于 ${scenesDir}/
- 全片调色脚本（如果文件存在）：${colourScript} —— 里面有本镜头的目标配色与相邻镜头的反差要求
- 参考广告片同位置的镜头：${SCRATCH}/ref/analog/ref_${id}.jpg（只借它的构图、质感密度、明暗关系）
- 资料核实文件目录（存在就用 grep 查与本镜头题材相关的 depiction / pitfalls；arch 用 g*.json，其他影片用 ${film}-*.json）：${PROJECT}/docs/research/
- 预览命令：\`cd ${PROJECT} && node tools/preview.js ${id}${filmFlag}\` → ${previewDir}/${id}_sheet.jpg（2×2：开头/中间/结尾/中间+弧线与文字安全区参考线）和 ${previewDir}/${id}_mid.jpg（1920×1080 中间帧，带标语文字）
- 相邻镜头的中间帧（硬切前后紧挨着它的画面；文件不存在就跳过）：${num(id) > 1 ? `${previewDir}/${sid(num(id) - 1)}_mid.jpg` : '（无上一镜头）'} 和 ${num(id) < 37 ? `${previewDir}/${sid(num(id) + 1)}_mid.jpg` : '（下一个是深色的片名卡）'}`

const CRIT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    whatISee: { type: 'string', description: 'what the frame actually shows, in two sentences, as a first-time viewer would read it in 0.3 s' },
    scores: { type: 'object', properties: {
      arc: { type: 'integer' }, instantRead: { type: 'integer' }, materiality: { type: 'integer' }, light: { type: 'integer' },
      colourInterest: { type: 'integer' }, detailFinish: { type: 'integer' }, accuracy: { type: 'integer' }, textLegibility: { type: 'integer' },
    }, description: 'each 1–10' },
    keep: { type: 'array', items: { type: 'string' }, description: 'things that already work and must not be lost' },
    fixes: { type: 'array', items: { type: 'object', properties: {
      priority: { type: 'integer', description: '1 = must fix, 2 = should, 3 = nice to have' },
      area: { type: 'string', description: 'arc | colour | detail | light | composition | accuracy | text | motion | edge | performance' },
      problem: { type: 'string' },
      instruction: { type: 'string', description: 'concrete, implementable change (where, what colour as hex, how big)' },
    }, required: ['priority', 'area', 'problem', 'instruction'] } },
    paletteTarget: { type: 'string', description: 'the palette this shot should end up with (hex values) so it is more interesting and contrasts with both neighbours' },
    needsPolish: { type: 'boolean' },
  },
  required: ['id', 'whatISee', 'scores', 'keep', 'fixes', 'paletteTarget', 'needsPolish'],
}

const POLISH_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    changed: { type: 'boolean' },
    summary: { type: 'string' },
    fixesDone: { type: 'array', items: { type: 'string' } },
    fixesSkipped: { type: 'array', items: { type: 'string' } },
    previewClean: { type: 'boolean' },
    initMs: { type: 'number' }, drawMs: { type: 'number' },
    rounds: { type: 'integer' },
  },
  required: ['id', 'changed', 'summary', 'previewClean'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    verdict: { type: 'string', enum: ['after-better', 'no-real-difference', 'after-worse-reverted', 'after-broken-reverted'] },
    reasons: { type: 'string' },
    arcOk: { type: 'boolean' }, textOk: { type: 'boolean' }, previewClean: { type: 'boolean' },
    remaining: { type: 'array', items: { type: 'string' }, description: 'issues still visible in the final state' },
    finalScore: { type: 'integer', description: '1–10 overall, for the state left on disk' },
  },
  required: ['id', 'verdict', 'reasons', 'arcOk', 'previewClean', 'finalScore'],
}

function critPrompt(id) {
  return `你是这支片子的美术指导，眼光挑剔。任务：给镜头 ${id} 做一次"成片前的细节与色调审片"，产出一份可执行的修改清单。**你不改任何代码文件。**

${CONTEXT(id)}

步骤：
1. 读 AUTHORING.md、任务单、调色脚本里本镜头的条目、场景文件源码（了解它是怎么画的，才能给出可执行的指令）。
2. 运行预览命令，然后把当前效果存档为"打磨前"：
   \`mkdir -p ${reviewDir} && cp ${previewDir}/${id}_mid.jpg ${reviewDir}/${id}_before_mid.jpg && cp ${previewDir}/${id}_sheet.jpg ${reviewDir}/${id}_before_sheet.jpg\`
3. 用 Read 工具看：${id}_sheet.jpg、${id}_mid.jpg、参考画面 ref_${id}.jpg、相邻两个镜头的中间帧。
4. 像第一次看到这支片子的观众一样判断（这个镜头只停留 0.2—1.2 秒）：一眼能认出是什么吗？弧线是不是画面里最显著的边缘、对齐了吗（看 sheet 第 4 格的洋红线）？材质和光影够不够"真"、还是像扁平的矢量图？细节收尾（边缘、接缝、高光、阴影、颗粒、景深）有没有粗糙或穿帮的地方？首帧/末帧运动后有没有露边？
5. **重点看色调**：客户明确要求"色调尽可能有趣"。这个镜头的颜色是否大胆、明确、有记忆点？是否发灰、发闷、偏脏、或者和相邻镜头撞色？给出一个更有意思、且与前后两个镜头在色相和明度上都形成强反差的目标配色（十六进制色值；优先有来历的中国传统色与器物本色；调色脚本里有目标的话以它为基础，可以改得更好）。
6. 如果镜头带标语（任务单 beat ≠ 0）：文字是否清晰、文字安全区是否干净、tone 是否正确。
7. 形制准确性：对照任务单 accuracy 和资料核实文件，有没有画错的地方。
${notes[id] ? `\n总导演对这个镜头的特别意见（必须纳入修改清单，优先级 1）：${notes[id]}\n` : ''}
产出要求：fixes 最多 6 条，按优先级排序，每条都要具体到"改哪里、改成什么（颜色给色值、尺寸给像素量级）"，让打磨的同事不用再猜；keep 列出已经做得好的、不许丢的东西。如果镜头已经很好、只需小修，也照实写（needsPolish 仍可为 true，只给 2—3 条小修）；只有在确实挑不出值得动的地方时才填 needsPolish=false。`
}

function polishPrompt(id, crit) {
  return `你是一位擅长 Canvas 2D 程序化插画的美术程序员，负责给镜头 ${id} 做"细节与色调打磨"。美术指导已经审过片，给了修改清单；你来实现，并且亲眼确认改完确实更好。

${CONTEXT(id)}

美术指导的审片意见：
- 他看到的画面：${crit.whatISee}
- 评分：${JSON.stringify(crit.scores)}
- 必须保留（不许丢）：${(crit.keep || []).map((k, i) => `\n  ${i + 1}. ${k}`).join('')}
- 目标配色：${crit.paletteTarget}
- 修改清单（按优先级）：${(crit.fixes || []).map((f, i) => `\n  ${i + 1}. [P${f.priority}·${f.area}] ${f.problem} → ${f.instruction}`).join('')}

工作方式：
1. 先备份：\`mkdir -p ${reviewDir} && cp ${scenesDir}/<file> ${reviewDir}/${id}.orig.js\`（<file> 用任务单里的文件名；如果 ${reviewDir}/${id}.orig.js 已存在就不要覆盖）。
2. 读 AUTHORING.md、src/lib/core.js、场景文件；用 Read 看"打磨前"的图 ${reviewDir}/${id}_before_sheet.jpg 和 ${reviewDir}/${id}_before_mid.jpg，以及参考画面和相邻镜头。
3. 按优先级实现修改清单（P1 全做，P2 尽量做，P3 看性价比）。**只允许修改这一个场景文件。** 在现有代码上改，不要推倒重写；保留清单里"必须保留"的东西。
4. 每改一轮就跑预览、用 Read 看 sheet 和 mid，和"打磨前"的图对比。至少 2 轮，上限 5 轮。重点自查：
   - 色调是否更有趣、更明确，并且与前后镜头形成强反差（看相邻镜头的中间帧）；不要把画面改脏、改灰、改花。
   - 细节收尾：边缘、接缝、高光、投影、颗粒、景深；弧线仍是最显著的边缘并且对齐（sheet 第 4 格）；带标语的镜头文字依然清晰、安全区干净。
   - 首帧、末帧没有露边穿帮；预览退出码 0、无 ERRORS；init ≤ 4000 ms、draw ≤ 120 ms/帧；没有 Math.random / Date。
5. 如果某条修改试过之后反而更差，就撤回那一条，并在 fixesSkipped 里说明。宁可少改，不要改坏。
完成后只返回结构化结果。`
}

function verifyPrompt(id, crit, pol) {
  return `你是独立的成片质检，立场是**怀疑**：默认认为"打磨没有让画面变好"，除非图像证明它确实更好。你没有参与前面的工作。

${CONTEXT(id)}

背景：美术指导给镜头 ${id} 提了修改清单，打磨的同事刚改完。他自述：${pol.summary}
- 打磨前的图：${reviewDir}/${id}_before_mid.jpg 和 ${reviewDir}/${id}_before_sheet.jpg
- 打磨前的源码备份：${reviewDir}/${id}.orig.js
- 美术指导要求保留的东西：${(crit.keep || []).join('；')}
- 美术指导的目标配色：${crit.paletteTarget}

步骤：
1. 运行预览命令得到"打磨后"的图（记下退出码、是否有 ERRORS、init/draw 毫秒数）。再运行 \`cd ${PROJECT} && node tools/preview.js ${id}${filmFlag} --notext >/dev/null; python3 tools/arccheck.py${filmFlag} | grep -E "shot|${id}"; node tools/preview.js ${id}${filmFlag} >/dev/null\`，看弧线对齐的客观指标（peak@dr 应在 0 附近的 ±8 像素内，或 at arc 接近 peak）。
2. 用 Read 并排对比：before_mid 与现在的 ${previewDir}/${id}_mid.jpg；before_sheet 与现在的 ${id}_sheet.jpg；再看相邻两个镜头的中间帧，判断硬切时的反差。
3. 逐项判断"打磨后"相对"打磨前"：一眼可读性、弧线对齐、材质与光影、色调是否更有趣且与相邻镜头反差更强、细节收尾、文字清晰度（带标语的镜头）、首末帧有无露边、形制有无新错误、"必须保留"的东西有没有丢。
4. 裁决：
   - 明显更好 → verdict = "after-better"，保留现状。
   - 差不多（没变好也没变坏）→ "no-real-difference"，保留现状。
   - 变差了（更脏、更花、更灰、丢了好东西、文字更难读、弧线更不准）→ **恢复备份**：\`cp ${reviewDir}/${id}.orig.js ${scenesDir}/<file>\`，重新跑预览确认恢复成功，verdict = "after-worse-reverted"。
   - 预览报错/超时/露边穿帮且你无法用一两行改动修好 → 同样恢复备份，verdict = "after-broken-reverted"。（如果只是一个显而易见的小 bug，你可以直接修好它再判断。）
5. remaining：列出最终留在磁盘上的版本里仍然可见的问题（如实写，没有就空数组）；finalScore 给最终版本打 1—10 分。`
}

const results = await pipeline(
  ids,
  (id) => agent(critPrompt(id), { label: `critique:${film}:${id}`, phase: 'Critique', schema: CRIT_SCHEMA, agentType: 'general-purpose' }),
  (crit, id) => {
    if (!crit) return null
    if (!crit.needsPolish) return { crit, pol: null }
    return agent(polishPrompt(id, crit), { label: `polish:${film}:${id}`, phase: 'Polish', schema: POLISH_SCHEMA, agentType: 'general-purpose' }).then((pol) => ({ crit, pol }))
  },
  (st, id) => {
    if (!st) return null
    if (!st.pol || !st.pol.changed) return { id, crit: st.crit, pol: st.pol, ver: null }
    return agent(verifyPrompt(id, st.crit, st.pol), { label: `verify:${film}:${id}`, phase: 'Verify', schema: VERIFY_SCHEMA, agentType: 'general-purpose' }).then((ver) => ({ id, crit: st.crit, pol: st.pol, ver }))
  },
)
// compact return (full critiques, summaries and verdict reasons stay in the journal)
return results.map((r, i) => r ? {
  id: ids[i],
  colour: r.crit && r.crit.scores ? r.crit.scores.colourInterest : null,
  polished: !!(r.pol && r.pol.changed),
  verdict: r.ver ? r.ver.verdict : (r.pol ? 'unchanged' : 'no-polish-needed'),
  score: r.ver ? r.ver.finalScore : null,
  left: r.ver && r.ver.remaining ? r.ver.remaining.length : 0,
} : { id: ids[i], failed: true })
