#!/bin/bash
# Rasterizes icon.svg to the PNG sizes Chrome needs (it won't load SVG icons).
# Renders through an HTML wrapper: screenshotting the .svg directly would use
# its intrinsic 128px size and crop to the window rather than scale.
set -euo pipefail

cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp icon.svg "$TMP/"

for s in 16 32 48 128; do
  cat > "$TMP/render.html" <<EOF
<!doctype html><meta charset="utf-8">
<style>
  *{margin:0;padding:0;border:0}
  html,body{width:${s}px;height:${s}px;overflow:hidden;background:transparent}
  img{display:block;width:${s}px;height:${s}px}
</style>
<img src="icon.svg">
EOF
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --default-background-color=00000000 --force-device-scale-factor=1 \
    --window-size=$s,$s --screenshot="icon$s.png" \
    "file://$TMP/render.html" >/dev/null 2>&1
  echo "icon$s.png"
done
