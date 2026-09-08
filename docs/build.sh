#!/bin/bash
# Regenerates the README screenshots from the real UI with staged data.
# Copies src/ to a temp dir, injects fixture.js so the pages see a fake
# chrome API, then captures each page at its own measured content height.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="$PWD/docs"

CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PORT=${PORT:-8797}

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at: $CHROME" >&2
  exit 2
fi

STAGE=$(mktemp -d)
# Kill the server before deleting its document root, and start it without a
# subshell so $SERVER is python's own pid — otherwise it outlives the script,
# holds the port, and the next run silently serves a deleted directory.
cleanup() {
  local status=$?
  if [ -n "${SERVER:-}" ]; then
    kill "$SERVER" 2>/dev/null || true
    wait "$SERVER" 2>/dev/null || true   # would otherwise surface as exit 143
  fi
  rm -rf "$STAGE"
  exit "$status"
}
trap cleanup EXIT

cp -R src "$STAGE/src"
cp docs/fixture.js docs/measure.js "$STAGE/src/"

python3 - "$STAGE" <<'PY'
import pathlib, sys
stage = pathlib.Path(sys.argv[1])
inject = '<meta charset="utf-8" />\n    <script src="fixture.js"></script>\n    <script src="measure.js"></script>'
for name in ('blocked.html', 'popup.html', 'options.html'):
    p = stage / 'src' / name
    html = p.read_text()
    assert '<meta charset="utf-8" />' in html, f'{name}: no charset meta to inject after'
    p.write_text(html.replace('<meta charset="utf-8" />', inject, 1))
PY

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$STAGE" >/dev/null 2>&1 &
SERVER=$!
for _ in $(seq 40); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/src/popup.html" && break
  sleep 0.1
done

measure() { # url  width  viewport-height
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
      --window-size="$2","$3" --virtual-time-budget=8000 --dump-dom "$1" 2>/dev/null \
    | python3 -c 'import re,sys; m=re.search(r"<title>H:(\d+)</title>", sys.stdin.read()); print(m.group(1) if m else "")'
}

shoot() { # name  page-with-query  css-width
  local name=$1 url="http://127.0.0.1:$PORT/src/$2" width=$3 height

  # Two passes: blocked.html sizes its top padding in vh, so the content height
  # depends on the viewport it was measured in. One re-measure converges it.
  height=$(measure "$url" "$width" 900)
  [ -n "$height" ] && height=$(measure "$url" "$width" "$height")

  if [ -z "$height" ]; then
    echo "could not measure $name — did the page throw?" >&2
    exit 1
  fi

  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=2 --window-size="$width","$height" \
    --screenshot="$OUT/$name.png" "$url" >/dev/null 2>&1

  echo "$name.png  ${width}x${height} @2x"
}

shoot nag-screen "blocked.html?url=https%3A%2F%2Fwww.youtube.com%2F&domain=youtube.com&reason=growth" 620
shoot settings   "options.html" 580
shoot popup      "popup.html?granted=all" 332
