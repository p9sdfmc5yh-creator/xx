export const meta = {
  name: 'promo-research-film',
  description: 'Budgeted web verification of the subjects of one film (two researchers, strict WebSearch cap each)',
  phases: [{ title: 'Research', detail: 'two researchers, at most 17 searches each, 2+ independent sources per fact' }],
}
const PROJECT = '/home/user/kashing/gujian-promo'
const film = args.film
const topic = { coins: '中国古钱币', antiques: '中国古玩', tcm: '中国中医药' }[film]
const groups = args.groups   // [{ key, focus }]
const SCHEMA = { type: 'object', properties: { filePath: { type: 'string' }, searchesUsed: { type: 'integer' }, facts: { type: 'integer' }, verified: { type: 'integer' } }, required: ['filePath', 'searchesUsed', 'facts', 'verified'] }
function prompt(g) {
  const out = `${PROJECT}/docs/research/${film}-${g.key}.json`
  return `你是一名严谨的资料研究员，为宣传短片《${topic}》核实事实。镜头选题见 ${PROJECT}/docs/series-plan.md 里本片（${film}）的那一节（先读它，只读那一节和开头的系列总表）。

你负责核实的范围：${g.focus}

**检索额度极其有限：你最多只能调用 17 次 WebSearch（mode 一律 "standard"）。** 这是硬上限（全系列共用一个很小的总额度）。所以：
- 先列出最关键的事实清单，每次查询尽量同时覆盖多个事实，同一轮并行发出多条查询。
- 优先核实"会出现在画面或成片说明里"的硬事实：名称与用字（尤其器物上的铭文/钱文/书名怎么写、繁体还是简体）、年代、作者、出土地/收藏地、形制要点、数量与级别；其次才是细节。
- 不要用 WebFetch（本环境的网络白名单会拦截绝大多数站点），直接依据搜索结果摘要判断；摘要不足以支撑就标 single-source 或 unverified。
- 如果 WebSearch 不在工具列表里，先用 ToolSearch 查询 "select:WebSearch" 加载。

规则：
1. 每条事实尽量有 2 个相互独立的来源（博物馆/官方机构/UNESCO、百科、权威媒体或学术；转载同一稿件不算独立）。达到 → status "verified-2plus-independent"；只有一个 → "single-source"；没查到 → "unverified"（note 写原因）；互相矛盾 → "conflicting"，并在 conflicts 里写清冲突内容、你采信哪个、为什么。
2. 绝不许凭记忆补全或编造；sources 的 url 必须是搜索结果里真实出现的链接；date 写页面显示的日期，没有就写"未标注"。会随时间变化的信息在 asOf 写"截至 2026 年 11 月"。
3. 每个题材另给 depiction（3—6 条画面形制要点：形状、比例、颜色、材质、纹饰、文字位置）和 pitfalls（1—3 条常见画错之处）；这两项可以结合资料与常识，冲突时以资料为准。${film === 'tcm' ? '\n4. 本片只做文化呈现：不要收集或写入任何功效、主治、用法用量之类的内容；有毒矿物（如朱砂、雄黄）只描述外观。' : ''}

输出：把结果写成 JSON 文件 ${out}，结构为
{ "group": "${film}-${g.key}", "subjects": [ { "shots": ["s04", …对应的镜头号], "name_zh": "…", "depiction": ["…"], "pitfalls": ["…"], "captionFacts": [ { "claim": "…", "status": "…", "asOf": "…", "sources": [ { "publisher": "…", "title": "…", "url": "…", "date": "…" } ], "note": "…" } ], "conflicts": ["…"] } ] }
然后只返回 filePath、searchesUsed（实际用掉的次数）、facts（事实条数）、verified（达到两个独立来源的条数）。`
}
phase('Research')
const res = await parallel(groups.map(g => () => agent(prompt(g), { label: `research:${film}:${g.key}`, phase: 'Research', schema: SCHEMA, agentType: 'general-purpose' })))
return { film, groups: res.map((r, i) => r ? { key: groups[i].key, searches: r.searchesUsed, facts: r.facts, verified: r.verified } : { key: groups[i].key, failed: true }) }
