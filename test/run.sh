#!/bin/bash
# Runs the test page in headless Chrome and exits non-zero if anything failed.
# ES modules need a real origin, so this serves the repo over localhost.
set -euo pipefail

cd "$(dirname "$0")/.."

CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PORT=${PORT:-8799}

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at: $CHROME" >&2
  echo "Set CHROME=/path/to/chrome and re-run." >&2
  exit 2
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT

URL="http://127.0.0.1:$PORT/test/index.html"
for _ in $(seq 40); do
  curl -sf -o /dev/null "$URL" && break
  sleep 0.1
done

DOM=$("$CHROME" --headless --disable-gpu --no-sandbox \
        --virtual-time-budget=15000 --dump-dom "$URL" 2>/dev/null)

printf '%s' "$DOM" | python3 -c '
import html, re, sys
dom = sys.stdin.read()
body = re.search(r"<pre id=\"out\">(.*?)</pre>", dom, re.S)
print(html.unescape(body.group(1)) if body else "(no output — the page did not run)")
title = re.search(r"<title>(.*?)</title>", dom, re.S)
title = html.unescape(title.group(1)).strip() if title else ""
sys.exit(0 if title.startswith("OK ") else 1)
'
