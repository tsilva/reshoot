"""Trusted clipboard-to-Vault setup for Reshoot's existing Clerk Development instance.

Only the user creates/copies the key. This operation never prints it or writes
it to a file, never changes Clerk settings, and never updates app launch defaults.
"""

import argparse
import base64
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--publishable-key", required=True)
    parser.add_argument("--from-clipboard", action="store_true", required=True)
    args = parser.parse_args()
    admin = load(
        "admin", ROOT / "tools/infisical-db-relay/scripts/provision_reshoot.py"
    )
    launcher = load("launcher", ROOT / "scripts/infisical/local_vault.py")
    public = args.publishable_key
    if (
        not public.startswith("pk_test_")
        or base64.b64decode(public[8:] + "===").decode()
        != "verified-trout-3003.clerk.accounts.dev$"
    ):
        raise ValueError("Expected reviewed Reshoot Development public key")
    profile, storage = launcher.load_services()
    if profile["clerk_publishable_key"] is not None:
        raise ValueError("Clerk is already configured; rotation needs explicit review")
    metadata = load("metadata", ROOT / "scripts/infisical/provision_local_services.py")
    fingerprint = metadata.public_key_hash(public)
    with (launcher.BASE / "session.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        token = admin.command(
            [
                str(admin.CLI),
                "--domain=" + admin.DOMAIN,
                "--silent",
                "--telemetry=false",
                "user",
                "get",
                "token",
                "--plain",
            ]
        ).strip()
        bundle = next(
            b
            for b in admin.api(token, "GET", admin.API + "?limit=100")["accessBundles"]
            if b["name"] == "local-reshoot-development"
        )
        url = admin.API + "/" + bundle["id"]
        services = admin.api(token, "GET", url)["accessBundle"]["services"]
        if {s["name"] for s in services} != {
            "reshoot-local-database",
            "reshoot-local-agentbridge",
            "reshoot-local-agentbridge-auth",
            "reshoot-local-storage",
        }:
            raise ValueError("Unexpected bundle services")
        key = admin.command(["/usr/bin/pbpaste"]).strip()
        if not re.fullmatch(r"sk_test_[A-Za-z0-9_-]{20,256}", key):
            raise ValueError(
                "Clipboard does not contain a complete Development secret key"
            )
        service = admin.api(
            token,
            "POST",
            url + "/services",
            {
                "type": "http",
                "name": "reshoot-local-clerk",
                "hostPattern": "localhost:" + str(storage["listen_port"]),
                "allowedMethods": ["GET"],
                "allowedPathPrefixes": [
                    "/v1/jwks",
                    "/v1/users/",
                    "/v1/clients/handshake_payload",
                ],
                "credential": {
                    "type": "bearer",
                    "headerName": "Reshoot-Clerk-Key",
                    "headerPrefix": "",
                    "value": key,
                },
            },
        )["service"]
        # Clear only the clipboard value this operation consumed, preserving concurrent copies.
        clipboard_cleared = admin.command(["/usr/bin/pbpaste"]).strip() == key
        if clipboard_cleared:
            subprocess.run(
                ["/usr/bin/pbcopy"], input="", text=True, env=admin.ENV, check=True
            )
        profile["clerk_publishable_key"] = public
        profile["clerk_jwks_sha256"] = fingerprint
        profile["clerk_source"] = launcher.CLERK_SOURCE
        profile["services"].append(service["id"])
        fd, name = tempfile.mkstemp(prefix=".clerk-setup-", dir=launcher.BASE)
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(profile, f, indent=2)
                f.write("\n")
            os.replace(name, launcher.BASE / "services.json")
        finally:
            if Path(name).exists():
                Path(name).unlink()
        launcher.load_services()
        print(
            json.dumps(
                {
                    "ok": True,
                    "clerk_development_connected": True,
                    "credential_stored_in_vault": True,
                    "clipboard_cleared": clipboard_cleared,
                    "credentials_displayed": False,
                    "production_changed": False,
                    "defaults_changed": False,
                }
            )
        )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "Development Clerk transfer failed; credential diagnostics withheld",
                }
            )
        )
        sys.exit(1)
