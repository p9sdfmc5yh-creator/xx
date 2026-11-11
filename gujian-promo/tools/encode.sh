#!/usr/bin/env bash
# encode.sh — frames + soundtrack → out/<name>.mp4 (H.264 High, yuv420p, BT.709, AAC stereo, faststart)
# Quality: CRF 18 with aq-mode 3 keeps the fine grain in dark gradients, which is what prevents banding there
# (measured on the title card: CRF 20 without it bands visibly once the contrast is stretched).
#   tools/encode.sh [film] [crf] [output]        film: arch (default) | coins | antiques | tcm
set -euo pipefail
cd "$(dirname "$0")/.."
FILM="${1:-arch}"
CRF="${2:-18}"
case "$FILM" in
  arch) NAME="zhongguo-gujianzhu" ;;
  coins) NAME="zhongguo-guqianbi" ;;
  antiques) NAME="zhongguo-guwan" ;;
  tcm) NAME="zhongyi" ;;
  coins2) NAME="zhongguo-guqianbi-tuban" ;;
  *) NAME="$FILM" ;;
esac
# GJ_SS=2: encode the supersampled frames (build/<film>/frames-ss2) as a 4K master → out/<name>-4k.mp4
SS="${GJ_SS:-1}"
FRAMES="build/$FILM/frames"; SUFFIX=""; LEVEL="4.2"
if [ "$SS" != "1" ]; then FRAMES="build/$FILM/frames-ss$SS"; SUFFIX="-4k"; LEVEL="5.1"; CRF="${2:-19}"; fi
OUT="${3:-out/$NAME$SUFFIX.mp4}"
mkdir -p "$(dirname "$OUT")"
# square plate films (those with src/films/<film>/PLAYER) have their own arrangement in tools/audio2.py
if [ ! -s "build/$FILM/soundtrack.wav" ]; then
  if [ -f "src/films/$FILM/PLAYER" ]; then python3 tools/audio2.py --film "$FILM" >/dev/null; else python3 tools/audio.py --film "$FILM" >/dev/null; fi
fi
# bring every film to the same loudness with one static gain (no dynamics processing): target −16 LUFS, true peak kept under −1 dBTP
TARGET_LUFS="${TARGET_LUFS:--16}"
read -r LUFS PEAK < <(ffmpeg -hide_banner -nostats -i "build/$FILM/soundtrack.wav" -af ebur128=peak=true -f null - 2>&1 | awk '/Integrated loudness:/{f=1} f&&/ I:/{i=$2} /True peak:/{g=1} g&&/Peak:/{p=$2} END{print i, p}')
GAIN=$(python3 -c "import sys; l=float('$LUFS'); p=float('$PEAK'); g=float('$TARGET_LUFS')-l; print(round(min(g, -1.0-p), 2))")
echo "soundtrack: ${LUFS} LUFS, true peak ${PEAK} dBTP → gain ${GAIN} dB"
ffmpeg -hide_banner -loglevel error -y \
  -framerate 25 -i "$FRAMES/f_%05d.png" -i "build/$FILM/soundtrack.wav" \
  -vf "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p" \
  -c:v libx264 -preset slower -crf "$CRF" -profile:v high -level "$LEVEL" -g 50 -bf 2 \
  -x264-params "aq-mode=3:aq-strength=0.9:deblock=-1,-1" \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -af "volume=${GAIN}dB" -c:a aac -b:a 256k -ar 48000 -movflags +faststart -shortest "$OUT"
echo "$OUT"
ffprobe -v error -show_entries format=duration,size,bit_rate -of default=nw=1 "$OUT"
