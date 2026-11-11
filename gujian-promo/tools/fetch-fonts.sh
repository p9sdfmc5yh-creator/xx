#!/usr/bin/env bash
# fetch-fonts.sh — download the open-licensed (SIL OFL 1.1) fonts used by the film into assets/fonts/.
# Source: the google/fonts repository on GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets/fonts
BASE="https://raw.githubusercontent.com/google/fonts/main/ofl"
get() { # <remote path> <local name>
  if [ -s "assets/fonts/$2" ]; then echo "have $2"; return; fi
  echo "fetching $2"; curl -fsSL --retry 3 -o "assets/fonts/$2" "$BASE/$1"
}
get "notoserifsc/NotoSerifSC%5Bwght%5D.ttf" NotoSerifSC.ttf
get "mashanzheng/MaShanZheng-Regular.ttf" MaShanZheng.ttf
get "zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf" ZCOOLXiaoWei.ttf
get "liujianmaocao/LiuJianMaoCao-Regular.ttf" LiuJianMaoCao.ttf
get "cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf" CormorantGaramond.ttf
get "longcang/LongCang-Regular.ttf" LongCang.ttf
get "zhimangxing/ZhiMangXing-Regular.ttf" ZhiMangXing.ttf
get "notoseriftc/NotoSerifTC%5Bwght%5D.ttf" NotoSerifTC.ttf
get "zcoolqingkehuangyou/ZCOOLQingKeHuangYou-Regular.ttf" ZCOOLQingKeHuangYou.ttf
# 霞鹜文楷 lives in its own repository (also SIL OFL 1.1)
WK="https://raw.githubusercontent.com/lxgw/LxgwWenKai/main"
for w in Light Regular Medium; do
  [ -s "assets/fonts/LXGWWenKai-$w.ttf" ] || { echo "fetching LXGWWenKai-$w.ttf"; curl -fsSL --retry 3 -o "assets/fonts/LXGWWenKai-$w.ttf" "$WK/fonts/TTF/LXGWWenKai-$w.ttf"; }
done
[ -s assets/fonts/OFL-lxgwwenkai.txt ] || curl -fsSL --retry 3 -o assets/fonts/OFL-lxgwwenkai.txt "$WK/OFL.txt"
for d in notoserifsc mashanzheng zcoolxiaowei liujianmaocao cormorantgaramond longcang zhimangxing notoseriftc zcoolqingkehuangyou; do
  [ -s "assets/fonts/OFL-$d.txt" ] || curl -fsSL --retry 3 -o "assets/fonts/OFL-$d.txt" "$BASE/$d/OFL.txt"
done
ls -la assets/fonts
