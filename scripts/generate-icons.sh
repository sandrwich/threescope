#!/usr/bin/env bash
# Generate all app icons from a single SVG source.
# Dependencies: rsvg-convert (librsvg2-bin), imagemagick, icotool (icoutils)
# Optional: png2icns (icnsutils) for macOS .icns
#
# Usage:
#   ./scripts/generate-icons.sh [path/to/icon.svg]
#
# If no argument given, defaults to public/textures/icons/icon.svg

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SVG="${1:-public/textures/icons/icon.svg}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ ! -f "$SVG" ]]; then
  echo "Error: SVG not found at $SVG" >&2
  exit 1
fi

# Check dependencies
for cmd in rsvg-convert convert icotool; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd not found. Install: sudo apt install librsvg2-bin imagemagick icoutils" >&2
    exit 1
  fi
done

echo "Source: $SVG"

# --- Helper: render SVG to PNG at given size ---
render() {
  local size=$1 out=$2
  rsvg-convert -w "$size" -h "$size" "$SVG" -o "$out"
  echo "  ${size}x${size}  → $out"
}

# --- Helper: render maskable icon (icon centered at 60% with background) ---
render_maskable() {
  local size=$1 out=$2 bg="${3:-#101010}"
  local icon_size=$(( size * 60 / 100 ))
  rsvg-convert -w "$icon_size" -h "$icon_size" "$SVG" -o "$TMP/mask_fg.png"
  convert -size "${size}x${size}" "xc:${bg}" \
    "$TMP/mask_fg.png" -gravity center -composite \
    "$out"
  echo "  ${size}x${size}  → $out (maskable)"
}

# ── PWA icons ──
echo ""
echo "PWA icons:"
render 192 public/textures/icons/icon-192.png
render 512 public/textures/icons/icon-512.png
render_maskable 192 public/textures/icons/icon-maskable-192.png
render_maskable 512 public/textures/icons/icon-maskable-512.png

# ── Favicon ──
echo ""
echo "Favicon:"
render 256 public/textures/ui/sat_icon.png

# ── Tauri desktop icons ──
echo ""
echo "Tauri icons:"
render 512 src-tauri/icons/icon.png
render 32  src-tauri/icons/32x32.png
render 128 src-tauri/icons/128x128.png
render 256 "src-tauri/icons/128x128@2x.png"

# ICO (Windows) — multi-size: 16, 32, 48, 256
echo ""
echo "Windows .ico:"
for s in 16 32 48 256; do
  render "$s" "$TMP/ico_${s}.png"
done
icotool -c -o src-tauri/icons/icon.ico \
  "$TMP/ico_16.png" "$TMP/ico_32.png" "$TMP/ico_48.png" "$TMP/ico_256.png"
echo "  multi   → src-tauri/icons/icon.ico"

# ICNS (macOS)
if command -v png2icns &>/dev/null; then
  echo ""
  echo "macOS .icns:"
  for s in 16 32 128 256 512; do
    render "$s" "$TMP/icns_${s}.png"
  done
  png2icns src-tauri/icons/icon.icns \
    "$TMP/icns_16.png" "$TMP/icns_32.png" "$TMP/icns_128.png" \
    "$TMP/icns_256.png" "$TMP/icns_512.png"
  echo "  multi   → src-tauri/icons/icon.icns"
else
  echo ""
  echo "Skipping .icns (png2icns not found — install: sudo apt install icnsutils)"
fi

echo ""
echo "Done!"
