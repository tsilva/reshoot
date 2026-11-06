"""Opt-in isolated database + AgentBridge launcher; never retrieves service values."""

import fcntl
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = Path.home() / ".config/infisical/database-relay/reshoot"
PROFILE = BASE / "app.json"
PREFIX = Path.home() / ".config/infisical"
PROJECT = "cdb4be1b-c53c-4b18-87eb-6f90aae2b661"
FINGERPRINT = "SHA256:37:B2:E0:81:45:EC:C0:58:46:2E:D1:2F:E1:2B:E6:AE:2B:78:B1:B3:F0:21:CD:8F:EC:54:CC:30:2D:36:9E:37"
CLERK_SOURCE = {
    "provider": "clerk",
    "application_id": "app_3LeE1uSpRbLyHBQEgTdcofbtNtM",
    "instance_id": "ins_3LeE1vFehUYb5AbJYnwW2P16AhL",
    "environment": "development",
}


COMPILER = "node_modules/.pnpm/@esbuild+darwin-arm64@0.28.1/node_modules/@esbuild/darwin-arm64/bin/esbuild"


def source_files():
    return (
        {
            "scripts/infisical/" + f
            for f in (
                "local_vault.py",
                "local_app.mjs",
                "local_app_preload.mjs",
                "local_app.sb",
                "local_database_check.mjs",
                "local_services_check.mjs",
                "local_storage_relay.py",
            )
        }
        | {
            COMPILER,
            ".infisical.json",
            "lib/db/index.ts",
            "lib/db/connection.ts",
            "lib/db/vault-pool.mjs",
            "lib/db/vault-pool.d.mts",
            "lib/generation/agentbridge.ts",
            "next.config.ts",
            "package.json",
            "pnpm-lock.yaml",
            "app/api/internal/local-database/route.ts",
            "lib/auth/config.ts",
            "lib/auth/vault-session.mjs",
            "lib/auth/vault-session.d.mts",
            "lib/storage/r2.ts",
            "lib/storage/vault-storage.mjs",
            "lib/storage/vault-storage.d.mts",
        }
        | {str(p.relative_to(ROOT)) for p in (ROOT / "drizzle").glob("*.sql")}
    )


def regular(path):
    info = path.lstat()
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o077
    ):
        raise ValueError("Expected an owner-only regular profile")


def load_profile():
    regular(PROFILE)
    if (ROOT / ".infisical.yaml").exists():
        raise ValueError("A new native binding requires explicit review")
    p = json.loads(PROFILE.read_text())
    fields = {
        "version",
        "repo",
        "repo_path",
        "project_id",
        "environment",
        "secret_path",
        "bundle",
        "node",
        "infisical",
        "ca_file",
        "ca_fingerprint",
        "release",
        "release_manifest_sha256",
        "relay_policy_sha256",
        "code_sha256",
    }
    if set(p) != fields or type(p["version"]) is not int or p["version"] != 1:
        raise ValueError("Unsupported local app profile")
    expected = {
        "repo": "reshoot",
        "repo_path": str(ROOT),
        "project_id": PROJECT,
        "environment": "dev",
        "secret_path": "/agents/database",
        "bundle": "local-reshoot-development",
        "node": str(PREFIX / "runtimes/node-v24.22.1-darwin-arm64/bin/node"),
        "infisical": str(PREFIX / "cli/0.44.13/infisical"),
        "ca_file": str(PREFIX / "agent-vault-ca.pem"),
        "ca_fingerprint": FINGERPRINT,
    }
    if any(p[k] != v for k, v in expected.items()):
        raise ValueError("Unreviewed local binding")
    if json.loads((ROOT / ".infisical.json").read_text()) != {
        "workspaceId": PROJECT,
        "defaultEnvironment": "dev",
        "gitBranchToEnvironmentMapping": None,
        "domain": "https://app.infisical.com",
    }:
        raise ValueError("Native identity changed")
    if set(p["code_sha256"]) != source_files():
        raise ValueError("Incomplete source pins")
    for f, digest in p["code_sha256"].items():
        path = ROOT / f
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError("Source changed; trusted review is required")
    release = Path(p["release"])
    if (
        release.resolve() != release
        or release.parent != PREFIX / "database-relay/releases"
        or not re.fullmatch("0[.]1[.]0-[a-f0-9]{16}", release.name)
    ):
        raise ValueError("Unreviewed relay runtime")
    for path, key in [
        (release / "install.json", "release_manifest_sha256"),
        (BASE / "relay.json", "relay_policy_sha256"),
    ]:
        regular(path)
        if hashlib.sha256(path.read_bytes()).hexdigest() != p[key]:
            raise ValueError("Relay metadata changed")
    relay = json.loads((BASE / "relay.json").read_text())
    if (
        relay["database"] != "reshoot_agent_vault_dev"
        or relay["role"] != "reshoot_agent_vault_app"
    ):
        raise ValueError("Unreviewed local database")
    return p, relay


def load_services():
    path = BASE / "services.json"
    if not path.exists():
        return None
    regular(path)
    value = json.loads(path.read_text())
    if (
        set(value)
        != {
            "version",
            "clerk_publishable_key",
            "clerk_source",
            "clerk_jwks_sha256",
            "storage_policy_sha256",
            "storage_program",
            "storage_program_sha256",
            "services",
        }
        or type(value["version"]) is not int
        or value["version"] != 1
        or value["clerk_source"]
        not in (
            CLERK_SOURCE,
            {"project_id": PROJECT, "environment": "dev", "path": "/"},
        )
    ):
        raise ValueError("Unreviewed local services profile")
    if value["clerk_publishable_key"] is not None:
        if not isinstance(value["clerk_jwks_sha256"], str) or not re.fullmatch(
            "[a-f0-9]{64}", value["clerk_jwks_sha256"]
        ):
            raise ValueError("Expected reviewed public signing-key fingerprint")
        if not value["clerk_publishable_key"].startswith("pk_test_"):
            raise ValueError("Expected a Clerk Development public key")
        host = base64.b64decode(value["clerk_publishable_key"][8:] + "===").decode()
        if not re.fullmatch(r"[a-z0-9-]+[.]clerk[.]accounts[.]dev[$]", host):
            raise ValueError("Expected a Clerk Development instance")
    program = Path(value["storage_program"])
    if (
        program.parent != BASE
        or program.resolve() != program
        or not re.fullmatch(r"storage-[a-f0-9]{16}[.]py", program.name)
    ):
        raise ValueError("Unreviewed storage runtime")
    for path, digest in [
        (program, value["storage_program_sha256"]),
        (BASE / "storage.json", value["storage_policy_sha256"]),
    ]:
        regular(path)
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError("Storage runtime or policy changed")
    storage = json.loads((BASE / "storage.json").read_text())
    if storage["root"] != str(BASE / "objects"):
        raise ValueError("Expected isolated local storage")
    return value, storage


def sandbox(p):
    cmd = ["/usr/bin/sandbox-exec"]
    for k, v in {
        "USER_HOME": str(Path.home()),
        "REPO_ROOT": str(ROOT),
        "NODE_ROOT": str(Path(p["node"]).parent.parent),
        "NODE_BIN": p["node"],
        "CA_FILE": p["ca_file"],
        "COMPILER_BIN": str(ROOT / COMPILER),
    }.items():
        cmd += ["-D", k + "=" + v]
    return cmd + ["-f", str(ROOT / "scripts/infisical/local_app.sb")]


def session_command(p, relay, mode, services=None):
    preload = str(ROOT / "scripts/infisical/local_app_preload.mjs")
    script = {
        "check": "local_database_check.mjs",
        "services-check": "local_services_check.mjs",
    }.get(mode, "local_app.mjs")
    service_env = []
    if services:
        service_env = [
            "RESHOOT_STORAGE_TRANSPORT=agent-vault",
            "RESHOOT_STORAGE_TOKEN=reshoot_storage_public_placeholder",
            "RESHOOT_STORAGE_BASE_URL=http://127.0.0.1:"
            + str(services[1]["listen_port"])
            + "/",
        ]
        if services[0]["clerk_publishable_key"]:
            service_env += [
                "RESHOOT_CLERK_TRANSPORT=agent-vault",
                "CLERK_SECRET_KEY=sk_test_reshoot_vault_public_placeholder",
                "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="
                + services[0]["clerk_publishable_key"],
                "RESHOOT_CLERK_JWKS_SHA256=" + services[0]["clerk_jwks_sha256"],
                "CLERK_API_URL=http://localhost:" + str(services[1]["listen_port"]),
            ]
    return [
        p["infisical"],
        "agent-vault",
        "run",
        "--domain=https://app.infisical.com",
        "--access-bundle=" + p["bundle"],
        "--proxy=127.0.0.1:8283",
        "--ca-fingerprint=" + p["ca_fingerprint"],
        "--ttl=30m",
        "--no-ca-trust",
        "--no-skills",
        "--silent",
        "--telemetry=false",
        "--",
        "/usr/bin/env",
        *service_env,
        "RESHOOT_DATABASE_TRANSPORT=agent-vault",
        "RESHOOT_DATABASE_CONNECTION=reshoot_database_public_placeholder",
        "RESHOOT_DATABASE_BASE_URL=http://127.0.0.1:" + str(relay["listen_port"]) + "/",
        "AGENTBRIDGE_API_KEY=agentbridge_public_placeholder",
        "AGENTBRIDGE_BASE_URL=http://127.0.0.1:8082/api/v1",
        "NODE_ENV=development",
        "NODE_USE_ENV_PROXY=1",
        "NO_PROXY=",
        "no_proxy=",
        "NODE_EXTRA_CA_CERTS=" + p["ca_file"],
        "NODE_OPTIONS=--use-env-proxy --import=" + Path(preload).as_uri(),
        "NEXT_TELEMETRY_DISABLED=1",
        "CLERK_ENABLE_KEYLESS=false",
        "RESHOOT_PAYMENTS_MODE=disabled",
        "NEXT_DEV_OUTPUT_DIR=.next-dev-" + str(os.getpid()),
        "WORKFLOW_TARGET_WORLD=local",
        "WORKFLOW_LOCAL_DATA_DIR="
        + str(ROOT / ".workflow-local" / ("vault-" + str(os.getpid()))),
        *sandbox(p),
        p["node"],
        "--use-env-proxy",
        str(ROOT / "scripts/infisical" / script),
        *(["--port", "auto"] if mode == "dev" else []),
    ]


def stop(child):
    if child and child.poll() is None:
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait(timeout=5)


def main(args):
    if args not in (["check"], ["services-check"], ["dev"], ["dev", "--port", "auto"]):
        raise ValueError(
            "Use check, services-check or dev --port auto; scope overrides are rejected"
        )
    p, relay = load_profile()
    services = load_services()
    if args == ["services-check"] and not services:
        raise ValueError("The local services profile is not installed")
    env = {
        "HOME": str(Path.home()),
        "PATH": "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        "LC_ALL": "C",
    }
    lock = open(BASE / "session.lock", "a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise ValueError("An owned local app session is already active") from None
    pgctl = "/opt/homebrew/bin/pg_ctl"
    data = BASE / "data"
    running = (
        subprocess.run(
            [pgctl, "-D", str(data), "status"], env=env, capture_output=True
        ).returncode
        == 0
    )
    owned_config = ROOT / f".tsconfig.vault-local-{os.getpid()}.json"
    config_was_absent = not owned_config.exists()
    started = False
    server = child = storage_server = None

    def interrupted(*_args):
        raise KeyboardInterrupt()

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, interrupted)
    try:
        if not running:
            result = subprocess.run(
                [
                    pgctl,
                    "-D",
                    str(data),
                    "-l",
                    str(BASE / "postgres.log"),
                    "-w",
                    "start",
                ],
                env=env,
                capture_output=True,
                timeout=20,
            )
            if result.returncode:
                raise ValueError("Owned PostgreSQL startup failed")
            started = True
        release = Path(p["release"])
        server = subprocess.Popen(
            [
                str(release / "bin/python"),
                "-I",
                "-S",
                str(release / "run.py"),
                "--profile",
                str(BASE / "relay.json"),
            ],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            start_new_session=True,
            cwd=release,
        )
        reader = selectors.DefaultSelector()
        reader.register(server.stdout, selectors.EVENT_READ)
        if not reader.select(8):
            raise ValueError("Relay startup timed out")
        ready = json.loads(server.stdout.readline())
        reader.close()
        if ready != {"ready": True, "host": "127.0.0.1", "port": relay["listen_port"]}:
            raise ValueError("Relay startup failed")
        if services:
            storage_server = subprocess.Popen(
                [
                    str(release / "bin/python"),
                    "-I",
                    "-S",
                    services[0]["storage_program"],
                    "--profile",
                    str(BASE / "storage.json"),
                    *(
                        ["--clerk-jwks-sha256", services[0]["clerk_jwks_sha256"]]
                        if services[0]["clerk_publishable_key"]
                        else []
                    ),
                ],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                start_new_session=True,
                cwd=BASE,
            )
            reader = selectors.DefaultSelector()
            reader.register(storage_server.stdout, selectors.EVENT_READ)
            if not reader.select(8):
                raise ValueError("Storage startup timed out")
            ready = json.loads(storage_server.stdout.readline())
            reader.close()
            if ready != {
                "ready": True,
                "host": "127.0.0.1",
                "port": services[1]["listen_port"],
            }:
                raise ValueError("Storage startup failed")
        child = subprocess.Popen(
            session_command(p, relay, args[0], services),
            env=env,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )
        if args[0] in ("check", "services-check"):
            stdout, _stderr = child.communicate(timeout=80)
            rows = [
                json.loads(line)
                for line in stdout.splitlines()
                if line.startswith('{"ok":')
            ]
            if len(rows) != 1:
                raise ValueError(
                    "Vault check failed; verify login, gateway and local profile"
                )
            print(json.dumps(rows[0]))
            return 0 if child.returncode == 0 and rows[0].get("ok") is True else 1
        reader = selectors.DefaultSelector()
        for stream in (child.stdout, child.stderr):
            reader.register(stream, selectors.EVENT_READ)
        while reader.get_map():
            if server.poll() is not None or (
                storage_server and storage_server.poll() is not None
            ):
                raise ValueError("Relay stopped; local app is being stopped")
            for key, _ in reader.select(1):
                line = key.fileobj.readline()
                if not line:
                    reader.unregister(key.fileobj)
                    continue
                line = re.sub(
                    r"(?:https?|postgresql?)://[^\s/]+@", "[redacted-session]@", line
                )
                line = re.sub(
                    r"eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+",
                    "[redacted-token]",
                    line,
                )
                line = re.sub(
                    r"sk_(?:live|test)_[A-Za-z0-9_-]+", "[redacted-key]", line
                )
                line = re.sub(
                    r"/objects/[A-Za-z0-9_-]{43}",
                    "/objects/[redacted-capability]",
                    line,
                )
                line = re.sub(
                    r"([?&](?:__clerk\w*|token|nonce|code|state)=)[^&\s]+",
                    r"\1[redacted]",
                    line,
                )
                print(line, end="", flush=True)
        return child.wait()
    finally:
        stop(child)
        stop(storage_server)
        stop(server)
        if config_was_absent and owned_config.is_file():
            owned_config.unlink()
        if started:
            subprocess.run(
                [pgctl, "-D", str(data), "-m", "fast", "-w", "stop"],
                env=env,
                capture_output=True,
                timeout=20,
            )
        lock.close()


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception:
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "Local Vault operation failed; diagnostics withheld",
                }
            )
        )
        sys.exit(1)
