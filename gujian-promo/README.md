# 「藏着千年」系列宣传短片 · 第一支《中国古建筑》

> **接手的人请先读 [`HANDOFF.md`](HANDOFF.md)**：《中国古玩》《中国古钱币》的现状、清单和踩过的坑都在那里；下面的说明写于第一支片子完成时，部分已过时。

一支 20 秒、1920×1080、25 fps 的宣传短片。**全部画面由代码程序化绘制（Canvas 2D），配乐由代码合成（numpy）**，
不含任何照片、视频素材或采样音频。

成片：[`out/zhongguo-gujianzhu.mp4`](out/zhongguo-gujianzhu.mp4)（《中国古建筑》）

系列另外三支（《中国古钱币》《中国古玩》《中国中医药》）的分镜骨架、标语与配乐预设已备好，见 [`docs/series-plan.md`](docs/series-plan.md)；画面尚未绘制。

## 创意

结构参照一支"同一条弧线贯穿所有画面"的匹配剪辑广告：37 个镜头越切越快（约 1 秒 → 0.5 秒 → 0.2 秒），
题材、媒介、颜色每个镜头都截然不同，但画面中部那条隆起的弧线始终重合 ——
长城的山脊、琉璃瓦的檐口、门钉、土楼、藻井、赵州桥的拱券、瓦当、月洞门、窑洞的拱窗、祈年殿的圆檐……
后半段弧顶上方依次叠出三拍文字「一道弧线 / 藏着 / 千年」，15.96 秒硬切到片名卡「中国古建筑」，
17.28 秒换成「千年营造 等你发现」，随后镜头下摇回到开场的长城晨曦，首尾相接可循环播放。

## 目录

```
src/lib/core.js      共用工具库：弧线几何、图层与镜头运动、噪声/材质/浮雕光影、毛笔/粉笔/速写笔触、文字
src/lib/titlecard.js 全系列共用的片名卡（片名 → 朱印 + 号召语 → 下摇回开场）
src/cuts.js          全系列共用的剪辑结构（37 个镜头的帧数、文字节拍、弧线预设；500 帧 = 20.00 秒）
src/timeline.js      《中国古建筑》的剪辑表、标语与字体设置
src/player.js        合成器：按 ?film= 加载影片，叠加标语与胶片颗粒，向渲染脚本暴露 window.GJ
src/scenes/*.js      《中国古建筑》的 38 个场景模块（37 个镜头 + 片名卡），每个导出 { name, tone, init(env), draw(ctx, env, p) }
src/films/<id>/      其他影片（coins / antiques / tcm）的 timeline.js 与 scenes/，由 tools/mk-film.js 从分镜生成脚手架
src/fonts.js         字体清单
tools/preview.js     渲染某个镜头的静帧小样（开头/中间/结尾/带参考线）
tools/render.js      逐帧渲染为 PNG（无头 Chromium / Playwright）
tools/audio.py       合成配乐（拨弦、鼓、梆子、钟、弦乐震音、噪声铺底 + 卷积混响；--film 切换四套音色）
tools/encode.sh      PNG 序列 + WAV → H.264/AAC MP4
tools/build.sh       一键：字体 → 配乐 → 渲染 → 编码
tools/specimen.js    在真实画面上出字体样张；tools/arccheck.py 检查各镜头主边缘是否落在弧线上；tools/contact.py 拼总览图
docs/AUTHORING.md    场景作者指南（弧线规则、文字安全区、质感要求）
docs/storyboard.json 分镜任务单
```

## 重新生成

需要 Node.js（带 Playwright 与 Chromium）、Python 3 + numpy、ffmpeg。

```bash
cd gujian-promo
bash tools/build.sh arch     # ≈ 4 分钟；输出 out/zhongguo-gujianzhu.mp4
# 或分步：
bash tools/fetch-fonts.sh    # 下载字体到 assets/fonts/（不入库）
python3 tools/audio.py --film arch
node tools/render.js --film arch        # 也可加 --shots s05,s06 只重渲个别镜头
bash tools/encode.sh arch 21 # 第二个参数为 x264 CRF，越小画质越高、文件越大
node tools/preview.js s07    # 看单个镜头的小样 → build/preview/
```

改文案：`src/timeline.js` 里的 `BEATS`（三拍文字）和 `src/scenes/title.js`（片名卡）。
改节奏：`src/cuts.js` 与 `src/timeline.js` 里每个镜头的 `frames`（同时要改 `tools/audio.py` 顶部的 `FRAMES`，音画卡点靠它对齐）。
字体：全系列统一用思源宋体，是三位评审代理在真实画面上对比 9 套开源字体方案后的一致选择。

## 素材与授权

- 画面、配乐：本仓库代码生成的原创内容。
- 字体（渲染时下载，不随仓库分发）：标语与片名用思源宋体 Noto Serif SC；个别镜头里的题签等用马善政楷书、霞鹜文楷等 ——
  均为 SIL Open Font License 1.1（许可证文本随字体一起下载到 `assets/fonts/OFL-*.txt`）。
- 画面是示意性的插画，不是对具体文物的精确复原；各镜头题材与形制要点见 `docs/storyboard.json`。
