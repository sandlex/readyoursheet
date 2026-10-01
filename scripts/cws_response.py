#!/usr/bin/env python3
"""Interpret a Chrome Web Store API response and fail loudly on trouble.

    scripts/cws_response.py upload|publish <response.json>

Any failure exits non-zero with an explanation rather than letting a release
continue on a response that only looks fine. Token minting lives in
cws_token.py.
"""
import json
import pathlib
import sys

# Statuses that mean the publish did not happen.
PUBLISH_FAILURES = {
    "ITEM_NOT_UPDATABLE",
    "NOT_AUTHORIZED",
    "PUBLISHER_SUSPENDED",
    "ITEM_TAKEN_DOWN",
}


def load(path: str) -> dict:
    raw = pathlib.Path(path).read_text().strip()
    if not raw:
        sys.exit(f"empty response from the store ({path})")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        sys.exit(f"store returned something that isn't JSON:\n{raw[:500]}")


def check_upload(data: dict) -> None:
    state = data.get("uploadState")
    if state != "SUCCESS":
        for err in data.get("itemError", []):
            print("  " + str(err.get("error_detail", err)), file=sys.stderr)
        sys.exit(
            f"upload failed: {state}\n"
            "A duplicate-version error means the manifest version was not "
            "increased past the published one."
        )
    print("  upload accepted")


def check_publish(data: dict) -> None:
    statuses = data.get("status", [])
    failed = PUBLISH_FAILURES.intersection(statuses)
    if failed:
        detail = " ".join(data.get("statusDetail", []))
        sys.exit(f"publish rejected: {', '.join(sorted(failed))}\n{detail}")
    if not statuses:
        sys.exit(f"publish returned no status:\n{json.dumps(data, indent=2)}")
    print("  " + ", ".join(statuses))


CHECKS = {"upload": check_upload, "publish": check_publish}


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in CHECKS:
        sys.exit("usage: cws_response.py upload|publish <response.json>")
    CHECKS[sys.argv[1]](load(sys.argv[2]))


if __name__ == "__main__":
    main()
