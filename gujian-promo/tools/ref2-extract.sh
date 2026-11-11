#!/usr/bin/env bash
# ref2-extract.sh — unpack the SECOND reference film (the square "5" montage) into build/ref2/f/f_0001.jpg … at 24 fps,
# which is what tools/sheet2.py reads for the left half of every <id>_compare.jpg. Third-party material: build/ is not in git.
#   bash tools/ref2-extract.sh <reference.mp4>
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -ge 1 ] || { echo "usage: bash tools/ref2-extract.sh <reference.mp4>"; exit 2; }
mkdir -p build/ref2/f
ffmpeg -hide_banner -loglevel error -y -i "$1" -t 20.3 -vf "scale=720:720" -q:v 3 build/ref2/f/f_%04d.jpg
ls build/ref2/f | wc -l
