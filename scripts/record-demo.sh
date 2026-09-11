#!/usr/bin/env bash
# Regenerates the README demo gif from scratch: runs the Playwright demo
# spec (records the popover + extended-view walkthrough against mocked,
# synthetic data — see e2e/fixtures/demo-data.ts) into .webm clips, then
# stitches/scales/encodes them into .github/assets/demo.gif.
#
# Requires: ffmpeg (brew install ffmpeg). gifski (brew install gifski) is
# used when present for a smaller/sharper gif; otherwise falls back to
# ffmpeg's own palette-based gif encoder, which needs nothing extra.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT_DIR="e2e/demo/out"
FINAL_GIF=".github/assets/demo.gif"
WIDTH=760
HEIGHT=600
FPS=14

command -v ffmpeg >/dev/null || { echo "ffmpeg not found — brew install ffmpeg"; exit 1; }
HAVE_GIFSKI=0
command -v gifski >/dev/null && HAVE_GIFSKI=1

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

echo "==> Recording demo scenes (Playwright)"
npx playwright test --config=e2e/playwright.config.ts demo-walkthrough

POPOVER="$OUT_DIR/scene-popover.webm"
EXPANDED="$OUT_DIR/scene-expanded.webm"
[ -f "$POPOVER" ] || { echo "missing $POPOVER — did the popover scene run?"; exit 1; }
[ -f "$EXPANDED" ] || { echo "missing $EXPANDED — did the expanded scene run?"; exit 1; }

COMBINED="$OUT_DIR/combined.mp4"
echo "==> Scaling + concatenating scenes into one clip"
ffmpeg -y -loglevel error \
  -i "$POPOVER" -i "$EXPANDED" \
  -filter_complex "
    [0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT}:(iw-${WIDTH})/2:0,setsar=1,fps=${FPS}[v0];
    [1:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT}:0:0,setsar=1,fps=${FPS}[v1];
    [v0][v1]concat=n=2:v=1:a=0[outv]
  " \
  -map "[outv]" "$COMBINED"

mkdir -p "$(dirname "$FINAL_GIF")"

if [ "$HAVE_GIFSKI" = "1" ]; then
  echo "==> Encoding gif with gifski"
  FRAMES_DIR=$(mktemp -d)
  trap 'rm -rf "$FRAMES_DIR"' EXIT
  ffmpeg -y -loglevel error -i "$COMBINED" -fps_mode passthrough "$FRAMES_DIR/frame_%05d.png"
  gifski --quiet -o "$FINAL_GIF" --fps "$FPS" --width "$WIDTH" "$FRAMES_DIR"/frame_*.png
else
  echo "==> gifski not found, encoding gif with ffmpeg's palette method (brew install gifski for a smaller/sharper result)"
  PALETTE="$OUT_DIR/palette.png"
  ffmpeg -y -loglevel error -i "$COMBINED" -vf "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,palettegen=stats_mode=diff" "$PALETTE"
  ffmpeg -y -loglevel error -i "$COMBINED" -i "$PALETTE" \
    -lavfi "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
    "$FINAL_GIF"
fi

SIZE=$(du -h "$FINAL_GIF" | cut -f1)
echo "==> Done: $FINAL_GIF ($SIZE)"
