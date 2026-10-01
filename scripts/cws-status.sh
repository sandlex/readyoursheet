#!/bin/bash
# Reads the store item's current status. Read-only — it changes nothing.
#
#   CWS_PUBLISHER_ID=... CWS_SERVICE_ACCOUNT_KEY_FILE=~/key.json scripts/cws-status.sh
#
# Useful for two things: checking whether a submission has cleared review, and
# proving the credentials work end to end without uploading anything. A
# successful call means the key is valid, the API is enabled, the service
# account is authorised on the publisher, and both IDs are right.
set -euo pipefail

cd "$(dirname "$0")/.."

EXTENSION_ID=${EXTENSION_ID:-hadmajghlhbpcopcakkcggdmaejnohlc}
API=https://chromewebstore.googleapis.com

if [ -z "${CWS_PUBLISHER_ID:-}" ]; then
  echo "missing CWS_PUBLISHER_ID (dev console -> Account)" >&2
  exit 2
fi

TMP=$(mktemp -d)
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

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
echo "  token minted ok"

HTTP=$(curl -sS -w '%{http_code}' -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$API/v2/publishers/$CWS_PUBLISHER_ID/items/$EXTENSION_ID:fetchStatus" \
  -o "$TMP/status.json")

echo "  HTTP $HTTP"
python3 scripts/cws_response.py status "$TMP/status.json"
