#!/usr/bin/env bash
# Generate satellite sprite atlas from SVG sources.
# Dependencies: rsvg-convert (librsvg2-bin), imagemagick (convert)
#
# Sprite SVGs live in public/textures/ui/sprites/ with numeric prefixes
# that determine their atlas slot (e.g. 00-default.svg = slot 0).
# The script renders each to 256x256, then stitches them horizontally
# into a single atlas PNG used by the satellite shaders.
#
# Usage:
#   ./scripts/generate-sprite.sh

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SPRITES_DIR="public/textures/ui/sprites"
OUT="public/textures/ui/sat_sprites.png"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Check dependencies
for cmd in rsvg-convert convert; do
  command -v "$cmd" &>/dev/null || { echo "Error: $cmd not found. Install: sudo apt install librsvg2-bin imagemagick" >&2; exit 1; }
done

# Find all sprite SVGs, sorted by filename (numeric prefix = atlas order)
mapfile -t SVGS < <(find "$SPRITES_DIR" -name '*.svg' -type f | sort)

if [[ ${#SVGS[@]} -eq 0 ]]; then
  echo "Error: No SVG files found in $SPRITES_DIR" >&2
  exit 1
fi

echo "Sprite atlas generation"
echo "  Source dir: $SPRITES_DIR"
echo "  Sprites:   ${#SVGS[@]}"
echo ""

# Render each SVG to 256x256 PNG
PNGS=()
for svg in "${SVGS[@]}"; do
  name="$(basename "$svg" .svg)"
  png="$TMP/${name}.png"
  rsvg-convert -w 256 -h 256 "$svg" -o "$png"
  PNGS+=("$png")
  echo "  ${name}.svg → 256x256"
done

# Stitch horizontally into atlas
if [[ ${#PNGS[@]} -eq 1 ]]; then
  cp "${PNGS[0]}" "$OUT"
else
  convert "${PNGS[@]}" +append "$OUT"
fi

width=$(( ${#SVGS[@]} * 256 ))
echo ""
echo "  Atlas: ${width}x256 → $OUT"
echo "  Slots: ${#SVGS[@]}"
echo "Done!"
