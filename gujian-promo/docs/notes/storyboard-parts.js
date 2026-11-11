export const meta = {
  name: 'promo-storyboard-parts',
  description: 'Expand a slice of a film outline into full per-shot briefs (small outputs, one JSON part file per agent)',
  phases: [{ title: 'Brief', detail: 'each agent writes full briefs for about nine shots' }],
}
const PROJECT = '/home/user/kashing/gujian-promo'
const REF = '/tmp/claude-0/-home-user-kashing/82b55bb9-0385-5108-b6bb-ac0899659655/scratchpad/ref/analog'
const film = args.film
const topic = { coins: '中国古钱币', antiques: '中国古玩', tcm: '中国中医药' }[film]
const ranges = args.ranges   // e.g. [[1,9],[10,19]]
const FRAMES = [31, 26, 26, 11, 6, 6, 13, 15, 13, 14, 15, 13, 14, 15, 8, 10, 8, 11, 12, 8, 10, 8, 8, 11, 7, 6, 8, 8, 7, 8, 6, 7, 7, 7, 6, 5, 5]
const beatOf = (i) => (i < 14 ? 0 : i < 19 ? 1 : i < 24 ? 2 : 3)
const sid = (n) => 's' + String(n).padStart(2, '0')

const SCHEMA = { type: 'object', properties: { filePath: { type: 'string' }, count: { type: 'integer' } }, required: ['filePath', 'count'] }

function prompt([a, b]) {
  const ids = []; for (let n = a; n <= b; n++) ids.push(n)
  const fixed = ids.map(n => `${sid(n)}: frames ${FRAMES[n - 1]}, beat ${beatOf(n - 1)}`).join('；')
  const out = `${PROJECT}/docs/storyboard-parts/${film}-${sid(a)}-${sid(b)}.json`
  return `你是系列宣传短片《${topic}》的分镜撰稿人。任务很具体、篇幅有限：把总导演定好的选题骨架里 **${sid(a)}—${sid(b)}** 这 ${ids.length} 个镜头，各写成一条美术程序员拿到就能画的任务单。**不要长篇思考，不要重写选题，直接动笔；整份输出控制在 5000 字以内。**

背景：每支片子 20 秒、37 个快切镜头，所有画面共用同一条居中隆起的弧线（一个巨大圆的顶部，弧顶在画面水平正中、约在画面高度一半处），全部用 Canvas 2D 程序化绘制。每个镜头是参考广告片同一位置画面在本题材里的"对应物"。

请先读（都很短，别读别的）：
1. ${PROJECT}/docs/series-plan.md —— 找到本片（${film}）的那一节，以及开头的系列总表（标语、片名、开场设定）和本片小节开头括号里的禁忌说明。
2. ${PROJECT}/docs/storyboard.json —— 第一支片子的任务单，作为格式与细致程度的范本；其中每个镜头的 refDesc 就是参考片对应位置的画面描述（镜头号一一对应，你的 refDesc 字段原样照抄同号的那条；s01、s02 那里没有，用下面给的）。
   - s01 的 refDesc：从轨道上看到的地球日出——上方是深蓝黑的太空，贴着弧线是一道由蓝渐变到橙红的大气辉光，弧线以下是漆黑的地球。极简、纯渐变。片尾会回到这个画面形成循环。
   - s02 的 refDesc：黑色带尘埃光点的背景下，一个金黄色半透明圆形物体的边缘（微距），沿弧线排着一圈水滴状的透明凸起，内部是蜂蜜色的层层弧线。
3. 用 Read 看你这几个镜头对应的参考画面：${ids.map(n => `${REF}/ref_${sid(n)}.jpg`).join('  ')} （画面角落的水印和白色英文字与我们无关）

每条任务单的字段：
- id、file（"sNN-小写英文连字符.js"，以镜头号开头）、name（中文镜头名）、frames、beat（固定值：${fixed}）
- tone：叠加标语的颜色。弧顶上方是深色或浓重的中间调 → "light"（白字）；上方是浅色（纸、米白、浅蓝、明黄等）→ "dark"（墨字）。
- refDesc：照抄。
- brief（150—260 字）：明确写出**弧线是什么**（器物的口沿/外缘/肩线/一道线…）、**弧线以下**是什么（主体：材质、关键细节、光）、**弧线以上**是什么（背景，要相对干净）。beat ≠ 0 的镜头必须写明"弧顶正上方的文字区保持平静均匀"。s01 还要写明：画面上方必须能一直延伸成一片干净的深色空间（片名卡就是镜头上仰后看到的那片深色）。
- palette：3—5 个颜色，"色名 #十六进制"。**色调要大胆、明确、干净、有记忆点**（客户特别强调色调要有趣），以骨架给的主色为准，可以细化；优先有来历的中国传统色与器物本色，色名拿不准就只给色值。
- motion：一句话（镜头只有 ${Math.min(...ids.map(n => FRAMES[n - 1]))}—${Math.max(...ids.map(n => FRAMES[n - 1]))} 帧，运动要小而确定：绕圆心的小幅滑动、轻微推近、高光游移、粒子闪烁等）。
- accuracy：1—3 句形制要点（你有把握的常识）。**不要编造年代、数字、款识、铭文**；器物上如需出现文字，只能是广为人知的真实铭文，并写进 factsToVerify。
- factsToVerify：这条任务单里需要联网核实的事实，每条一句话（没有就空数组）。

把结果写成一个 JSON 文件（只创建这一个文件）：${out}
内容是一个数组，恰好 ${ids.length} 个对象，按镜头号顺序。写完用一行 node -e 检查能解析、条数正确，然后返回 filePath 和 count。`
}
phase('Brief')
const res = await parallel(ranges.map(r => () => agent(prompt(r), { label: `briefs:${film}:${sid(r[0])}-${sid(r[1])}`, phase: 'Brief', schema: SCHEMA, agentType: 'general-purpose', effort: 'medium' })))
return { film, parts: res.map((r, i) => r ? r.count : `FAILED ${ranges[i]}`) }
