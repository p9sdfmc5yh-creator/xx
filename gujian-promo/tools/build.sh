#!/usr/bin/env bash
# build.sh — full pipeline for one film: fonts → soundtrack → 500 frames → MP4
#   tools/build.sh [film] [crf]        film: arch (default) | coins | antiques | tcm
set -euo pipefail
cd "$(dirname "$0")/.."
FILM="${1:-arch}"
bash tools/fetch-fonts.sh
python3 tools/audio.py --film "$FILM"
node tools/render.js --film "$FILM"
bash tools/encode.sh "$FILM" "${2:-20}"
