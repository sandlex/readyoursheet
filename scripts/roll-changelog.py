#!/usr/bin/env python3
"""Move CHANGELOG's Unreleased section under a new version heading.

    scripts/roll-changelog.py 1.2.3 release-notes.md

Writes the moved notes to the second argument for use as a release body.
Fails if Unreleased is empty — a release with no notes is not worth cutting.
"""
import datetime
import pathlib
import re
import sys

UNRELEASED = re.compile(r"^## \[Unreleased\]\n(.*?)(?=^## |\Z)", re.S | re.M)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("usage: roll-changelog.py <version> <notes-out>")
    version, notes_out = sys.argv[1], sys.argv[2]

    path = pathlib.Path("CHANGELOG.md")
    text = path.read_text()

    match = UNRELEASED.search(text)
    if not match:
        sys.exit('CHANGELOG.md has no "## [Unreleased]" section')

    notes = match.group(1).strip()
    if not notes:
        sys.exit('Nothing under "## [Unreleased]" — write the release notes first')

    today = datetime.date.today().isoformat()
    replacement = f"## [Unreleased]\n\n## [{version}] — {today}\n\n{notes}\n\n"
    path.write_text(text.replace(match.group(0), replacement, 1))
    pathlib.Path(notes_out).write_text(notes + "\n")
    print(f"rolled {len(notes.splitlines())} lines of notes into {version}")


if __name__ == "__main__":
    main()
