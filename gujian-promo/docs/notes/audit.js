export const meta = {
  name: 'promo-audit',
  description: 'Independent read-only audit of one film against the reference film: two craft reviewers and one accuracy reviewer',
  phases: [{ title: 'Audit', detail: 'craft reviewers for shots 1-19 and 20-37 plus title, and one content and accuracy reviewer; nobody edits files' }],
}
const PROJECT = '/home/user/kashing/gujian-promo'
const film = args.film
const topic = { arch: '中国古建筑', coins: '中国古钱币', antiques: '中国古玩', tcm: '中国中医药' }[film]
const dir = `${PROJECT}/build/dir-review/${film}`
const storyboard = film === 'arch' ? `${PROJECT}/docs/storyboard.json` : `${PROJECT}/docs/storyboard-${film}.json`
const sid = (n) => 's' + String(n).padStart(2, '0')
const range = (a, b) => { const o = []; for (let n = a; n <= b; n++) o.push(sid(n)); return o }

const COMMON = `项目：${PROJECT} —— 系列宣传短片之《${topic}》（影片 id：${film}）。20 秒、37 个快切镜头共用同一条居中隆起的弧线，后 23 个镜头在弧顶上方叠三拍标语，全部画面由 Canvas 2D 程序绘制。每个镜头是参考广告片同一位置画面在本题材里的"对应物"。
**你只看图和读资料：不修改任何文件，不运行渲染或预览命令（图都已经渲染好了）。**
每个镜头已有的图（目录 ${dir}/）：
- <id>_compare.jpg —— 左半是参考片的同一镜头（上：中间帧；下：首帧 / 末帧），右半是我们的画面（同样三帧）。参考片角落的"抖音"水印和白色英文字与我们无关。
- <id>_sheet.jpg —— 我们的 2×2：开头 / 中间 / 结尾 / 中间帧叠加洋红弧线与虚线文字安全区。
- <id>_mid.jpg —— 我们的中间帧，1920×1080，带标语。
- arccheck.txt —— 弧线客观检查表（verdict 不是 OK 的要重点看；边缘本来就是虚的镜头，如织物毛边、笔锋，可以例外）。
任务单：${storyboard}（每个镜头的 name / brief / palette / tone / beat / accuracy）。
总导演已有的意见：${PROJECT}/docs/notes/director-${film}.json（列在里面的镜头已经在返工；你照常评，但不必重复同样的话）。`

const CRAFT_SCHEMA = { type: 'object', properties: {
  shots: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' },
    parity: { type: 'integer', description: '1-10 craft level next to the reference shot' },
    verdict: { type: 'string', enum: ['ship', 'minor', 'rework'] },
    issue: { type: 'string', description: 'the most important problem, at most 80 Chinese characters; empty if none' },
    fix: { type: 'string', description: 'an implementable instruction, at most 120 Chinese characters; empty if none' },
  }, required: ['id', 'parity', 'verdict', 'issue', 'fix'] } },
  worst: { type: 'array', items: { type: 'string' }, description: 'shot ids most in need of rework, most serious first, at most 8' },
}, required: ['shots', 'worst'] }

const ACC_SCHEMA = { type: 'object', properties: {
  shots: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' },
    ok: { type: 'boolean' },
    textVisible: { type: 'string', description: 'every readable character, number or symbol in the picture other than the tagline; empty if none' },
    issue: { type: 'string', description: 'at most 100 Chinese characters; empty if none' },
    fix: { type: 'string', description: 'at most 120 Chinese characters; empty if none' },
  }, required: ['id', 'ok', 'textVisible', 'issue', 'fix'] } },
  mustFix: { type: 'array', items: { type: 'string' } },
}, required: ['shots', 'mustFix'] }

function craftPrompt(ids) {
  return `你是独立的成片质检，负责美术与手艺。立场是挑剔的：客户的要求是「多去参考、多去对比，审美和画图要最好」，标尺就是参考片。

${COMMON}
规范：${PROJECT}/docs/AUTHORING.md 里「对照参考片」一节的七条和「文字安全区」一节（先读这两节）。

你要审的镜头：${ids.join('、')}。每个镜头都用 Read 打开它的 compare 图；拿不准弧线、文字安全区或首末帧有没有露边时再看 sheet 图；要看细节时看 mid 图。

逐镜头判断：
1. 按任务单的题材，观众 0.3 秒内能一眼认出画的是什么吗？
2. 与参考片并排（七条）：景别够近吗、够简洁吗、单元是不是规整得像复制粘贴的电脑图、有没有主光和景深、明暗是不是两大块、颜色干不干净、手绘类的线条够不够粗而有力？
3. 弧线是不是画面里最显著的边缘，对齐了吗？
4. 带标语的镜头（任务单 beat 不为 0）：标语清晰好读吗，安全区干净吗，白字 / 墨字选对了吗？
5. 首帧、末帧有没有露边、黑边、穿帮？
6. 画面里有没有读不懂的物体，或者像程序错误的图形（孤立的方块、色块、断线、条带、接缝）？

输出：每个镜头一条 —— id；parity（与参考片并排的手艺分：10 = 可以直接剪进参考片，7 = 放在一起不掉价，5 = 一眼看出是电脑画的）；verdict（ship = 可以直接出片，minor = 小修会更好，rework = 必须返工）；issue（最要紧的一个问题，没有就空串）；fix（可以直接执行的修改指令：改哪里、改成什么）。再给 worst：最需要返工的镜头，按严重程度排序，最多 8 个。如实打分：不要客气，也不要为了凑数硬挑毛病。`
}

function accPrompt() {
  return `你是独立的成片质检，负责内容与事实。立场是怀疑的：凡是没有依据的东西都不该出现在画面上。

${COMMON}
核实资料：${PROJECT}/docs/research/${film}-a.json 和 ${film}-b.json（subjects[].shots 标了对应的镜头；看 depiction、pitfalls，以及 captionFacts 每条的 status：verified-2plus-independent / single-source / unverified / conflicting）。先把两份资料和任务单读一遍。

你要审全部镜头 s01—s37 和片名卡 title。每个镜头用 Read 看 compare 图；凡是画面里可能有字、款识、纹样细节或形制要点的，再看 1920×1080 的 mid 图。片名卡看 title_sheet.jpg。

逐镜头检查：
1. 画面读得出任务单说的那个题材吗？有没有画成了别的东西？
2. 形制：对照任务单的 accuracy 和资料里的 depiction / pitfalls，有没有画错（比例、部件、位置、颜色、数量）？
3. 文字：把画面里每一处可读的字、数字、符号逐一列出（合成器叠加的三拍标语不算）；判断它是否被任务单允许，资料里对应事实的核实状态是什么。
4. 红线：${film === 'antiques' ? '不出现象牙、犀角、玳瑁；不出现编造的款识、印文、年代、数字。' : film === 'coins' ? '不出现编造的钱文；钱文若出现，必须是真实钱文的局部，且位置正确；不出现年代、数字、元素符号。' : '不出现编造的文字、数字、年代。'}

输出：每个镜头一条 —— id；ok（内容与事实上是否可以出片）；textVisible（看到的字，没有就空串）；issue；fix。再给 mustFix：内容或事实上必须修改的镜头 id。没有问题就如实说没有，不要硬挑。`
}

phase('Audit')
const [a, b, c] = await parallel([
  () => agent(craftPrompt(range(1, 19)), { label: `audit-craft:${film}:s01-s19`, phase: 'Audit', schema: CRAFT_SCHEMA, agentType: 'general-purpose' }),
  () => agent(craftPrompt([...range(20, 37), 'title']), { label: `audit-craft:${film}:s20-title`, phase: 'Audit', schema: CRAFT_SCHEMA, agentType: 'general-purpose' }),
  () => agent(accPrompt(), { label: `audit-accuracy:${film}`, phase: 'Audit', schema: ACC_SCHEMA, agentType: 'general-purpose' }),
])
const craft = [...((a && a.shots) || []), ...((b && b.shots) || [])]
return {
  film,
  failed: [!a && 'craft s01-s19', !b && 'craft s20-title', !c && 'accuracy'].filter(Boolean),
  craft: craft.filter((s) => s.verdict !== 'ship' || s.parity < 7).map((s) => `${s.id} p${s.parity} ${s.verdict}: ${s.issue} → ${s.fix}`),
  shipCount: craft.filter((s) => s.verdict === 'ship').length,
  meanParity: craft.length ? Math.round(10 * craft.reduce((t, s) => t + s.parity, 0) / craft.length) / 10 : null,
  worst: [...((a && a.worst) || []), ...((b && b.worst) || [])],
  accuracy: c ? c.shots.filter((s) => !s.ok || s.textVisible).map((s) => `${s.id}${s.ok ? '' : ' NOT-OK'}${s.textVisible ? ' text[' + s.textVisible + ']' : ''}: ${s.issue}${s.fix ? ' → ' + s.fix : ''}`) : null,
  mustFix: c ? c.mustFix : null,
}