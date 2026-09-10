#!/bin/bash
# Builds the Chrome Web Store upload zip.
#
# Ships only what runs. The `key` field is stripped: the store rejects a first
# upload whose manifest contains one, and assigns its own key instead.
set -euo pipefail

cd "$(dirname "$0")"
ROOT=$PWD
OUT=$ROOT/dist

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
ZIP=$OUT/read-your-sheet-$VERSION.zip

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

python3 - "$STAGE" <<'PY'
import collections, json, pathlib, sys
m = json.loads(pathlib.Path('manifest.json').read_text(), object_pairs_hook=collections.OrderedDict)
m.pop('key', None)
(pathlib.Path(sys.argv[1]) / 'manifest.json').write_text(json.dumps(m, indent=2) + '\n')
PY

cp -R src "$STAGE/src"
mkdir -p "$STAGE/icons"
cp icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png "$STAGE/icons/"
# macOS sprinkles these through any directory it has previewed
find "$STAGE" -name '.DS_Store' -delete

mkdir -p "$OUT"
rm -f "$ZIP"
(cd "$STAGE" && zip -qr "$ZIP" .)

# Fail loudly rather than let a bad package reach review.
python3 - "$ZIP" <<'PY'
import json, sys, zipfile
names = zipfile.ZipFile(sys.argv[1]).namelist()
problems = []
if 'manifest.json' not in names:
    problems.append('manifest.json is not at the zip root')
for bad in ('.pem', '.git', '.DS_Store', 'test/', 'docs/', 'CLAUDE.md', 'README.md', 'package.sh'):
    hits = [n for n in names if bad in n]
    if hits:
        problems.append(f'{bad} leaked in: {hits[:3]}')
manifest = json.loads(zipfile.ZipFile(sys.argv[1]).read('manifest.json'))
if 'key' in manifest:
    problems.append('manifest still contains "key" — the store will reject it')
for required in ('name', 'version', 'description', 'icons'):
    if required not in manifest:
        problems.append(f'manifest missing {required}')
if len(manifest.get('description', '')) > 132:
    problems.append('description exceeds 132 characters')
if problems:
    print('\n'.join('  ✗ ' + p for p in problems))
    sys.exit(1)
print(f"  {len(names)} entries, manifest at root, no key, no dev files")
PY

echo "  $(basename "$ZIP")  $(( $(stat -f%z "$ZIP") / 1024 )) KB"
