#!/usr/bin/env python3
"""Bump manifest.json's version. Prints `version=X.Y.Z` for GITHUB_OUTPUT.

    scripts/bump-version.py patch|minor|major
"""
import collections
import json
import pathlib
import sys

PARTS = {"major": 0, "minor": 1, "patch": 2}


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in PARTS:
        sys.exit("usage: bump-version.py patch|minor|major")

    index = PARTS[sys.argv[1]]
    path = pathlib.Path("manifest.json")
    manifest = json.loads(path.read_text(), object_pairs_hook=collections.OrderedDict)

    numbers = [int(n) for n in manifest["version"].split(".")]
    numbers += [0] * (3 - len(numbers))
    numbers[index] += 1
    for i in range(index + 1, len(numbers)):
        numbers[i] = 0

    # Chrome caps each component at 65535 and requires a strict increase.
    if any(n > 65535 for n in numbers):
        sys.exit("a version component exceeded 65535, which Chrome rejects")

    manifest["version"] = ".".join(str(n) for n in numbers)
    path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"version={manifest['version']}")


if __name__ == "__main__":
    main()
