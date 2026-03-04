#!/usr/bin/env bash
# Generates .lite.webp texture variants for reduced bandwidth mode.
# Per-texture resolutions tuned for visual quality vs size trade-off.
#
# Requirements: ImageMagick (convert) with WebP delegate
# Usage: ./scripts/generate-lite-textures.sh

set -euo pipefail
cd "$(dirname "$0")/.."

QUALITY=60

# source file | lite resolution
ENTRIES=(
  # Blocking (loading screen)
  "public/textures/earth/color.webp|4096x2048"
  "public/textures/earth/night.webp|2048x1024"
  "public/textures/earth/clouds.webp|512x256"
  "public/textures/moon/color.webp|1024x512"
  "public/textures/stars.webp|2048x1024"
  # Orrery planets (lazy, on promote — displacement skipped entirely in lite)
  "public/textures/mercury/color.webp|2048x1024"
  "public/textures/venus/color.webp|2048x1024"
  "public/textures/mars/color.webp|2048x1024"
  "public/textures/sun/color.webp|1024x512"
  "public/textures/jupiter/color.webp|1024x512"
  "public/textures/saturn/color.webp|1024x512"
  # Thumbnails (orrery orbit view)
  "public/textures/earth/thumb.webp|256x128"
  "public/textures/moon/thumb.webp|256x128"
  "public/textures/sun/thumb.webp|256x128"
  "public/textures/mercury/thumb.webp|256x128"
  "public/textures/venus/thumb.webp|256x128"
  "public/textures/mars/thumb.webp|256x128"
  "public/textures/jupiter/thumb.webp|256x128"
  "public/textures/saturn/thumb.webp|256x128"
  "public/textures/uranus/thumb.webp|256x128"
  "public/textures/neptune/thumb.webp|256x128"
)

for entry in "${ENTRIES[@]}"; do
  IFS='|' read -r src geom <<< "$entry"

  if [[ ! -f "$src" ]]; then
    echo "SKIP (not found): $src"
    continue
  fi

  out="${src%.webp}.lite.webp"
  echo -n "$src → $out ($geom, q=$QUALITY) ... "
  convert "$src" -resize "$geom!" -quality "$QUALITY" -define webp:method=6 "$out"
  size=$(stat -c%s "$out" 2>/dev/null || stat -f%z "$out")
  echo "$(numfmt --to=iec-i --suffix=B "$size")"
done

echo ""
echo "Done."
