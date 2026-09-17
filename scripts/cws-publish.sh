#!/bin/bash
# Uploads a package to the Chrome Web Store and submits it for review.
#
#   scripts/cws-publish.sh dist/read-your-sheet-1.2.3.zip
#
# Needs CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN and
# CWS_PUBLISHER_ID in the environment. Runs the same way locally as in CI, so a
# broken release can be debugged without pushing commits.
#
# Responses go to files and are parsed by heredoc'd Python taking a path — do
# not inline JSON parsing into `python3 -c '...'`, because escaping quotes
# inside a single-quoted shell string silently passes backslashes to Python.
set -euo pipefail

ZIP=${1:?usage: cws-publish.sh <zip>}
EXTENSION_ID=${EXTENSION_ID:-hadmajghlhbpcopcakkcggdmaejnohlc}
API=https://chromewebstore.googleapis.com

for var in CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_PUBLISHER_ID; do
  if [ -z "${!var:-}" ]; then
    echo "missing $var" >&2
    exit 2
  fi
done
[ -f "$ZIP" ] || { echo "no such file: $ZIP" >&2; exit 2; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

curl -sS https://oauth2.googleapis.com/token \
  -d "client_id=$CWS_CLIENT_ID" \
  -d "client_secret=$CWS_CLIENT_SECRET" \
  -d "refresh_token=$CWS_REFRESH_TOKEN" \
  -d grant_type=refresh_token \
  -o "$TMP/token.json"

TOKEN=$(python3 scripts/cws_response.py token "$TMP/token.json")

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
