#!/usr/bin/env python3
"""Mint a Chrome Web Store access token from a service account key.

    scripts/cws_token.py <service-account.json> [--dry-run]

Service accounts replaced the OAuth refresh-token dance: nothing to consent to,
nothing that expires after 7 days in Testing mode or 6 months unused.

The JWT is signed by shelling out to openssl rather than importing a crypto
library, because this repo deliberately has no dependencies. --dry-run prints
the signed assertion instead of exchanging it, so the signing can be checked
without credentials that work.
"""
import base64
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

SCOPE = "https://www.googleapis.com/auth/chromewebstore"
GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer"


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def sign(private_key_pem: str, payload: bytes) -> bytes:
    """RSASSA-PKCS1-v1_5 over SHA-256, via openssl.

    openssl wants the key as a file and the data on stdin, so the key lands in
    a 0600 temp file for the duration of the call and is removed straight
    after.
    """
    handle, path = tempfile.mkstemp()
    try:
        os.fchmod(handle, 0o600)
        with os.fdopen(handle, "w") as key_file:
            key_file.write(private_key_pem)
        result = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", path, "-binary"],
            input=payload,
            capture_output=True,
        )
    finally:
        os.unlink(path)

    if result.returncode != 0:
        sys.exit("openssl could not sign the JWT:\n" + result.stderr.decode())
    return result.stdout


def build_assertion(account: dict) -> str:
    for field in ("client_email", "private_key"):
        if field not in account:
            sys.exit(
                f"the service account JSON has no {field!r} — is this the key "
                "file downloaded from Keys -> Add key -> JSON?"
            )

    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claims = {
        "iss": account["client_email"],
        "scope": SCOPE,
        "aud": account.get("token_uri", "https://oauth2.googleapis.com/token"),
        "iat": now,
        "exp": now + 3600,
    }
    encode = lambda obj: b64url(json.dumps(obj, separators=(",", ":")).encode())
    signing_input = f"{encode(header)}.{encode(claims)}".encode()
    return f"{signing_input.decode()}.{b64url(sign(account['private_key'], signing_input))}"


def exchange(account: dict, assertion: str) -> str:
    url = account.get("token_uri", "https://oauth2.googleapis.com/token")
    body = urllib.parse.urlencode({"grant_type": GRANT, "assertion": assertion}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=body)) as response:
            return json.loads(response.read())["access_token"]
    except urllib.error.HTTPError as err:
        detail = err.read().decode()
        try:
            parsed = json.loads(detail)
            error = parsed.get("error", "")
            description = parsed.get("error_description", "")
        except json.JSONDecodeError:
            error, description = detail, ""

        hint = "Check the service account key and that the API is enabled."
        if "invalid_grant" in str(error):
            hint = (
                "The key was rejected. Make sure the Chrome Web Store API is "
                "enabled on the project, and that the clock is sane."
            )
        elif "unauthorized_client" in str(error) or err.code == 403:
            hint = (
                "The service account is not authorised. Add its client_email "
                "under Account in the Chrome Web Store developer dashboard."
            )
        sys.exit(f"token request failed ({err.code}): {error} {description}\n{hint}")


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv[1:]
    if len(args) != 1:
        sys.exit("usage: cws_token.py <service-account.json> [--dry-run]")

    raw = pathlib.Path(args[0]).read_text()
    try:
        account = json.loads(raw)
    except json.JSONDecodeError:
        sys.exit("the service account key is not valid JSON")

    assertion = build_assertion(account)
    print(assertion if dry_run else exchange(account, assertion))


if __name__ == "__main__":
    main()
