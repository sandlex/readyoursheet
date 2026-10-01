#!/usr/bin/env python3
"""Interpret a Chrome Web Store API response and fail loudly on trouble.

    scripts/cws_response.py token|upload|publish <response.json>

`token` prints the access token on success; the others print a summary. Any
failure exits non-zero with an explanation rather than letting a release
continue on a response that only looks fine.
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


def check_token(data: dict) -> None:
    if "access_token" in data:
        print(data["access_token"])
        return

    error = data.get("error", "")
    message = f"token request failed: {error} {data.get('error_description', '')}".strip()

    # Point at the likely cause rather than listing every possibility. A
    # missing parameter means the credentials were never supplied; a rejected
    # grant means they were, and the token is no longer good.
    if error == "invalid_request":
        hint = (
            "Looks like the credentials are empty. Add CWS_CLIENT_ID, "
            "CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN and CWS_PUBLISHER_ID as repo "
            "secrets (Settings -> Secrets and variables -> Actions)."
        )
    elif error == "invalid_grant":
        hint = (
            "The refresh token was rejected. If the OAuth consent screen is "
            "still in Testing, tokens expire after 7 days — set it to In "
            "production and mint a new one."
        )
    else:
        hint = "Check the OAuth client and refresh token."

    sys.exit(f"{message}\n{hint}")


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


CHECKS = {"token": check_token, "upload": check_upload, "publish": check_publish}


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in CHECKS:
        sys.exit("usage: cws_response.py token|upload|publish <response.json>")
    CHECKS[sys.argv[1]](load(sys.argv[2]))


if __name__ == "__main__":
    main()
