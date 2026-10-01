#!/bin/bash
# Uploads a package to the Chrome Web Store and submits it for review.
#
#   scripts/cws-publish.sh dist/read-your-sheet-1.2.3.zip
#
# Authenticates as a service account. Supply the key either way:
#
#   CWS_SERVICE_ACCOUNT_KEY       the JSON itself (how CI passes it)
#   CWS_SERVICE_ACCOUNT_KEY_FILE  a path to it (easier locally)
#
# Also needs CWS_PUBLISHER_ID. Runs identically locally and in CI, so a broken
# release can be debugged without pushing commits.
#
# Responses go to files and are parsed by heredoc'd Python taking a path — do
# not inline JSON parsing into `python3 -c '...'`, because escaping quotes
# inside a single-quoted shell string silently passes backslashes to Python.
set -euo pipefail

cd "$(dirname "$0")/.."

ZIP=${1:?usage: cws-publish.sh <zip>}
EXTENSION_ID=${EXTENSION_ID:-hadmajghlhbpcopcakkcggdmaejnohlc}
API=https://chromewebstore.googleapis.com

[ -f "$ZIP" ] || { echo "no such file: $ZIP" >&2; exit 2; }
if [ -z "${CWS_PUBLISHER_ID:-}" ]; then
  echo "missing CWS_PUBLISHER_ID (dev console -> Account)" >&2
  exit 2
fi

TMP=$(mktemp -d)
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

# The key reaches CI as a secret, so it has to land on disk for openssl to
# sign with. Keep it in the private temp dir that the trap removes.
if [ -n "${CWS_SERVICE_ACCOUNT_KEY_FILE:-}" ]; then
  KEY=$CWS_SERVICE_ACCOUNT_KEY_FILE
  [ -f "$KEY" ] || { echo "no such key file: $KEY" >&2; exit 2; }
elif [ -n "${CWS_SERVICE_ACCOUNT_KEY:-}" ]; then
  KEY=$TMP/key.json
  (umask 077; printf '%s' "$CWS_SERVICE_ACCOUNT_KEY" > "$KEY")
else
  echo "missing CWS_SERVICE_ACCOUNT_KEY (or CWS_SERVICE_ACCOUNT_KEY_FILE)" >&2
  exit 2
fi

TOKEN=$(python3 scripts/cws_token.py "$KEY")

echo "Uploading $(basename "$ZIP")"
curl -sS -X POST -T "$ZIP" \
  -H "Authorization: Bearer $TOKEN" \
  "$API/upload/v2/publishers/$CWS_PUBLISHER_ID/items/$EXTENSION_ID:upload" \
  -o "$TMP/upload.json"
python3 scripts/cws_response.py upload "$TMP/upload.json"

echo "Publishing"
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Length: 0" \
  "$API/v2/publishers/$CWS_PUBLISHER_ID/items/$EXTENSION_ID:publish" \
  -o "$TMP/publish.json"
python3 scripts/cws_response.py publish "$TMP/publish.json"

echo "Submitted for review."
