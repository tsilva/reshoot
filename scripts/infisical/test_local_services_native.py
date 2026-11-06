"""Fake-only actual Clerk SDK/storage adapter checks through a disposable Vault bundle."""

import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import secrets
import subprocess
import tempfile
import threading
import sys

ROOT = Path(__file__).resolve().parents[2]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def main():
    admin = module(
        "admin", ROOT / "tools/infisical-db-relay/scripts/provision_reshoot.py"
    )
    launcher = module("launcher", ROOT / "scripts/infisical/local_vault.py")
    storage = module("storage", ROOT / "scripts/infisical/local_storage_relay.py")
    profile = json.loads(launcher.PROFILE.read_text())
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
    if not any(b["name"] == "local-reshoot-development" for b in bundles):
        raise ValueError("Expected existing reviewed bundle")
    fake_key = "sk_test_fake_only_" + secrets.token_hex(20)
    fake_storage = "fake-only-storage-" + secrets.token_hex(20)
    generate = """
      const c=require('node:crypto'); const {publicKey,privateKey}=c.generateKeyPairSync('rsa',{modulusLength:2048});
      const jwk={...publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256',use:'sig'};
      const now=Math.floor(Date.now()/1000);
      const text=[{alg:'RS256',kid:'fixture',typ:'JWT'},{sub:'user_fixture',sid:'sess_fixture',iss:'https://fixture.clerk.accounts.dev',
        azp:'http://127.0.0.1:3000',iat:now,nbf:now-5,exp:now+600,v:2}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
      console.log(JSON.stringify({jwk,token:text+'.'+c.sign('RSA-SHA256',Buffer.from(text),privateKey).toString('base64url')}));
    """
    fixture = json.loads(admin.command([profile["node"], "-e", generate]))
    requests = []

    class Clerk(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            if self.headers.get("Authorization") != "Bearer " + fake_key:
                self.send_error(401)
                return
            requests.append(self.path)
            if self.path == "/v1/jwks":
                data = {"keys": [fixture["jwk"]]}
            elif self.path == "/v1/users/user_fixture":
                data = {
                    "id": "user_fixture",
                    "object": "user",
                    "email_addresses": [],
                    "first_name": "Fixture",
                    "private_metadata": {
                        "credential": "fake-private-metadata-must-not-reach-app"
                    },
                }
            elif self.path == "/v1/clients/handshake_payload?nonce=fixture-nonce":
                data = {"directives": []}
            else:
                self.send_error(404)
                return
            body = json.dumps(data).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    fake = ThreadingHTTPServer(("127.0.0.1", 0), Clerk)
    thread = threading.Thread(target=fake.serve_forever, daemon=True)
    thread.start()
    bid = None
    result = {"ok": False}
    try:
        with tempfile.TemporaryDirectory(prefix="reshoot-storage-fixture-") as tmp:
            Path(tmp).chmod(0o700)
            p = {
                "version": 1,
                "listen_port": admin.free_port(),
                "root": tmp,
                "token_sha256": hashlib.sha256(fake_storage.encode()).hexdigest(),
            }
            fingerprint = hashlib.sha256(
                (fixture["jwk"]["n"] + ":" + fixture["jwk"]["e"]).encode()
            ).hexdigest()
            server = storage.Server(
                p, fingerprint, f"http://127.0.0.1:{fake.server_port}"
            )
            server_thread = threading.Thread(target=server.serve_forever, daemon=True)
            server_thread.start()
            try:
                bundle = admin.api(
                    token,
                    "POST",
                    admin.API,
                    {"name": "reshoot-services-fixture-" + secrets.token_hex(5)},
                )["accessBundle"]
                bid = bundle["id"]
                for name, port, methods, paths, credential in [
                    (
                        "fixture-clerk",
                        server.server_port,
                        ["GET"],
                        [
                            "/v1/jwks",
                            "/v1/users/",
                            "/v1/clients/handshake_payload",
                        ],
                        {
                            "type": "bearer",
                            "headerName": "Reshoot-Clerk-Key",
                            "headerPrefix": "",
                            "value": fake_key,
                        },
                    ),
                    (
                        "fixture-storage",
                        server.server_port,
                        ["POST"],
                        ["/v1/storage/" + x for x in storage.METHODS],
                        {
                            "type": "bearer",
                            "headerName": "Reshoot-Storage-Token",
                            "headerPrefix": "",
                            "value": fake_storage,
                        },
                    ),
                ]:
                    admin.api(
                        token,
                        "POST",
                        f"{admin.API}/{bid}/services",
                        {
                            "type": "http",
                            "name": name,
                            "hostPattern": f"localhost:{port}"
                            if name == "fixture-clerk"
                            else f"127.0.0.1:{port}",
                            "allowedMethods": methods,
                            "allowedPathPrefixes": paths,
                            "credential": credential,
                        },
                    )
                cmd = [
                    profile["infisical"],
                    "agent-vault",
                    "run",
                    "--domain=https://app.infisical.com",
                    "--access-bundle=" + bundle["name"],
                    "--proxy=127.0.0.1:8283",
                    "--ca-fingerprint=" + profile["ca_fingerprint"],
                    "--ttl=10m",
                    "--no-ca-trust",
                    "--no-skills",
                    "--silent",
                    "--telemetry=false",
                    "--",
                    "/usr/bin/env",
                    "NODE_USE_ENV_PROXY=1",
                    "NO_PROXY=",
                    "no_proxy=",
                    "NODE_ENV=development",
                    "NODE_EXTRA_CA_CERTS=" + profile["ca_file"],
                    "RESHOOT_CLERK_TRANSPORT=agent-vault",
                    "CLERK_SECRET_KEY=sk_test_reshoot_vault_public_placeholder",
                    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_"
                    + __import__("base64")
                    .b64encode(b"fixture.clerk.accounts.dev$")
                    .decode(),
                    f"FIXTURE_CLERK_BASE=http://localhost:{server.server_port}",
                    f"CLERK_API_URL=http://localhost:{server.server_port}",
                    "FIXTURE_SESSION=" + fixture["token"],
                    "RESHOOT_STORAGE_TRANSPORT=agent-vault",
                    "RESHOOT_STORAGE_TOKEN=reshoot_storage_public_placeholder",
                    f"RESHOOT_STORAGE_BASE_URL=http://127.0.0.1:{server.server_port}/",
                    *launcher.sandbox(profile),
                    profile["node"],
                    "--use-env-proxy",
                    str(ROOT / "scripts/infisical/fixtures/local_services_probe.mjs"),
                ]
                output = subprocess.run(
                    cmd,
                    cwd=ROOT,
                    env=admin.ENV,
                    capture_output=True,
                    text=True,
                    timeout=70,
                )
                rows = [
                    json.loads(line)
                    for line in output.stdout.splitlines()
                    if line.startswith('{"ok":')
                ]
                if len(rows) != 1 or output.returncode or not rows[0].get("ok"):
                    result = (
                        rows[0]
                        if rows
                        else {
                            "ok": False,
                            "reason": "Native fixture failed before sanitized output",
                        }
                    )
                else:
                    result = rows[0]
                    result["fake_provider_requests"] = len(requests)
                    result["fake_credentials_absent_from_output"] = all(
                        x not in output.stdout + output.stderr
                        for x in (fake_key, fake_storage)
                    )
                    result["ok"] = result["fake_credentials_absent_from_output"]
            finally:
                server.shutdown()
                server.server_close()
                server_thread.join()
    finally:
        fake.shutdown()
        fake.server_close()
        thread.join()
        if bid:
            admin.api(token, "DELETE", admin.API + "/" + bid)
            result["disposable_bundle_deleted"] = True
    print(json.dumps(result))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "Native fixture failed; provider diagnostics withheld",
                }
            )
        )
        sys.exit(1)
