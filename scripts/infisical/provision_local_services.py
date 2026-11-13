"""Trusted one-time Development Clerk transfer and isolated local storage setup.

The exact two Clerk source values stay in process memory. Never run from inside
the application sandbox; this is explicit administration, not an app launcher.
"""

import argparse
import base64
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def public_key_hash(public):
    if not public.startswith("pk_test_"):
        raise ValueError("Expected Clerk Development public key")
    host = base64.b64decode(public[8:] + "===").decode().removesuffix("$")
    if not re.fullmatch(r"[a-z0-9-]+[.]clerk[.]accounts[.]dev", host):
        raise ValueError("Unreviewed public-key host")

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *_args):
            raise ValueError("Redirect rejected")

    with urllib.request.build_opener(
        urllib.request.ProxyHandler({}), NoRedirect()
    ).open("https://" + host + "/.well-known/jwks.json", timeout=15) as response:
        data = json.loads(response.read(65536))
    key = next(k for k in data["keys"] if k["kty"] == "RSA")
    return hashlib.sha256((key["n"] + ":" + key["e"]).encode()).hexdigest()


def source(admin, project):
    values = {}
    for name in ("CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"):
        try:
            values[name] = admin.command(
                [
                    str(admin.CLI),
                    "secrets",
                    "get",
                    name,
                    "--plain",
                    "--projectId=" + project,
                    "--env=dev",
                    "--path=/",
                    "--domain=" + admin.DOMAIN,
                    "--expand=false",
                    "--include-imports=false",
                    "--secret-overriding=false",
                    "--silent",
                    "--telemetry=false",
                ]
            ).strip()
        except ValueError:
            values[name] = ""
    private = values["CLERK_SECRET_KEY"]
    public = values["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]
    ok = private.startswith("sk_test_") and public.startswith("pk_test_")
    try:
        host = base64.b64decode(public[8:] + "===").decode()
        ok = ok and bool(re.fullmatch(r"[a-z0-9-]+[.]clerk[.]accounts[.]dev[$]", host))
    except Exception:
        ok = False
    return values, bool(ok)



def runbox_administration():
    location=Path(__file__).resolve()
    root=next(p for p in location.parents if (p/'scripts/infisical/administration.py').is_file())
    spec=importlib.util.spec_from_file_location('reviewed_runbox_administration',root/'scripts/infisical/administration.py')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def main():
    if '--plan' in sys.argv[1:]:
        if sys.argv[1:] != ['--plan']: raise ValueError('Use --plan without provisioning arguments')
        print(json.dumps(runbox_administration().publication_plan()))
        return
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--install", action="store_true")
    parser.add_argument("--storage-only", action="store_true")
    args = parser.parse_args()
    raise ValueError('Runbox metadata publication requires explicit trusted review before provisioning; no credentials read or changes made')
    os.umask(0o077)
    admin = load(
        "admin", ROOT / "tools/infisical-db-relay/scripts/provision_reshoot.py"
    )
    launcher = load("launcher", ROOT / "scripts/infisical/administration.py")
    native = runbox_administration().reviewed_identity()
    if native != {
        "workspaceId": launcher.PROJECT,
        "defaultEnvironment": "dev",
        "gitBranchToEnvironmentMapping": None,
        "domain": admin.DOMAIN,
    }:
        raise ValueError("Unreviewed native identity")
    values, ready = (
        ({"CLERK_SECRET_KEY": "", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": ""}, False)
        if args.storage_only
        else source(admin, launcher.PROJECT)
    )
    if not args.install:
        print(
            json.dumps(
                {
                    "ok": True,
                    "development_clerk_source_ready": ready,
                    "private_key_present": bool(values["CLERK_SECRET_KEY"]),
                    "public_key_present": bool(
                        values["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]
                    ),
                    "credentials_displayed": False,
                }
            )
        )
        return
    if not ready and not args.storage_only:
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "A matching Clerk Development key pair is required in the reviewed Development source",
                }
            )
        )
        sys.exit(1)
    base = launcher.BASE
    if (
        (base / "services.json").exists()
        or (base / "storage.json").exists()
        or (base / "objects").exists()
    ):
        raise ValueError(
            "Local service profile already exists; never replace credentials implicitly"
        )
    with (base / "session.lock").open("a") as lock:
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
        bundles = admin.api(token, "GET", admin.API + "?limit=100")["accessBundles"]
        bid = next(b["id"] for b in bundles if b["name"] == "local-reshoot-development")
        services = admin.api(token, "GET", f"{admin.API}/{bid}")["accessBundle"][
            "services"
        ]
        names = {s["name"] for s in services}
        if names != {
            "reshoot-local-database",
            "reshoot-local-agentbridge",
            "reshoot-local-agentbridge-auth",
        }:
            raise ValueError("Bundle services changed; explicit review required")
        storage_token = secrets.token_urlsafe(40)
        storage_port = admin.free_port()
        storage_source = ROOT / "scripts/local-services-relay.py"
        digest = hashlib.sha256(storage_source.read_bytes()).hexdigest()
        program = base / ("storage-" + digest[:16] + ".py")
        added = []
        complete = False
        try:
            routes = [
                (
                    "reshoot-local-storage",
                    f"127.0.0.1:{storage_port}",
                    ["POST"],
                    [
                        "/v1/storage/" + x
                        for x in (
                            "check",
                            "sign-upload",
                            "sign-read",
                            "head",
                            "get",
                            "put",
                            "delete",
                        )
                    ],
                    {
                        "type": "bearer",
                        "headerName": "Reshoot-Storage-Token",
                        "headerPrefix": "",
                        "value": storage_token,
                    },
                ),
            ]
            if ready:
                routes.append(
                    (
                        "reshoot-local-clerk",
                        f"localhost:{storage_port}",
                        ["GET"],
                        ["/v1/jwks", "/v1/users/", "/v1/clients/handshake_payload"],
                        {
                            "type": "bearer",
                            "headerName": "Reshoot-Clerk-Key",
                            "headerPrefix": "",
                            "value": values["CLERK_SECRET_KEY"],
                        },
                    )
                )
            for name, host, methods, paths, credential in routes:
                service = admin.api(
                    token,
                    "POST",
                    f"{admin.API}/{bid}/services",
                    {
                        "type": "http",
                        "name": name,
                        "hostPattern": host,
                        "allowedMethods": methods,
                        "allowedPathPrefixes": paths,
                        "credential": credential,
                    },
                )["service"]
                added.append(service["id"])
            (base / "objects").mkdir(mode=0o700)
            with program.open("xb") as f:
                f.write(storage_source.read_bytes())
            program.chmod(0o600)
            admin.write(
                base / "storage.json",
                {
                    "version": 1,
                    "listen_port": storage_port,
                    "root": str(base / "objects"),
                    "token_sha256": hashlib.sha256(storage_token.encode()).hexdigest(),
                },
            )
            admin.write(
                base / "services.json",
                {
                    "version": 1,
                    "clerk_publishable_key": values["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]
                    or None,
                    "clerk_jwks_sha256": public_key_hash(
                        values["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]
                    )
                    if ready
                    else None,
                    "clerk_source": {
                        "project_id": launcher.PROJECT,
                        "environment": "dev",
                        "path": "/",
                    },
                    "storage_policy_sha256": hashlib.sha256(
                        (base / "storage.json").read_bytes()
                    ).hexdigest(),
                    "storage_program": str(program),
                    "storage_program_sha256": digest,
                    "services": added,
                },
            )
            complete = True
        finally:
            if not complete:
                for sid in reversed(added):
                    admin.api(token, "DELETE", f"{admin.API}/{bid}/services/{sid}")
                for path in (base / "services.json", base / "storage.json", program):
                    path.unlink(missing_ok=True)
                if (base / "objects").exists():
                    shutil.rmtree(base / "objects")
        print(
            json.dumps(
                {
                    "ok": True,
                    "clerk_development_connected": ready,
                    "isolated_storage": True,
                    "credential_stored_in_vault": True,
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
                    "reason": "Trusted local services setup failed; provider details withheld",
                }
            )
        )
        sys.exit(1)
