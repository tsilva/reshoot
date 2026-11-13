"""Trusted one-time creation of an empty local Reshoot database and dedicated Vault route."""

import argparse
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import urllib.error
import urllib.request

import psycopg
from psycopg import sql

DOMAIN = "https://app.infisical.com"
API = "/api/v1/agent-vault/access-bundles"
PREFIX = Path.home() / ".config/infisical"
CLI = PREFIX / "cli/0.44.13/infisical"
BASE = PREFIX / "database-relay/reshoot"
BUNDLE = "local-reshoot-development"
ENV = {
    "HOME": str(Path.home()),
    "PATH": "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    "LC_ALL": "C",
}


def command(args, timeout=45):
    p = subprocess.run(args, env=ENV, capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        raise ValueError("Trusted setup command failed; details withheld")
    return p.stdout


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        raise ValueError("Redirect rejected")


def api(token, method, path, payload=None):
    req = urllib.request.Request(
        DOMAIN + path,
        method=method,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        },
        data=None if payload is None else json.dumps(payload).encode(),
    )
    try:
        with urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect()
        ).open(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError:
        raise ValueError("Vault administration rejected the setup request") from None


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def write(path, data):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def schema_statements(root):
    manifest = json.loads(Path(__file__).with_name("reshoot-schema.json").read_text())
    migrations = sorted((root / "drizzle").glob("*.sql"))
    if {p.name for p in migrations} != set(manifest["migrations"]):
        raise ValueError("Unreviewed schema files require explicit review")
    for migration in migrations:
        reviewed = manifest["migrations"][migration.name]
        if hashlib.sha256(migration.read_bytes()).hexdigest() != reviewed["sha256"]:
            raise ValueError("Schema changed; review the bootstrap manifest")
        for block in migration.read_text().split("--> statement-breakpoint"):
            clean = re.sub(r"(?m)^\s*--[^\n]*", "", block).strip()
            if not clean:
                continue
            if (
                hashlib.sha256(block.encode()).hexdigest()
                in reviewed["omit_data_statements"]
            ):
                continue
            if not clean.upper().startswith(("CREATE ", "ALTER ", "DROP ")):
                raise ValueError("Unreviewed data statement in schema bootstrap")
            yield block



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
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--release", type=Path, required=True)
    parser.add_argument(
        "--create-empty-local-database", action="store_true", required=True
    )
    args = parser.parse_args()
    raise ValueError('Runbox metadata publication requires explicit trusted review before provisioning; no credentials read or changes made')
    root = args.repo.resolve(strict=True)
    release = args.release.resolve(strict=True)
    os.umask(0o077)
    if BASE.exists():
        raise ValueError(
            "Local profile already exists; do not overwrite database or credentials"
        )
    if release.parent != PREFIX / "database-relay/releases":
        raise ValueError("Unreviewed runtime")
    spec = importlib.util.spec_from_file_location(
        "local_vault", root / "scripts/infisical/administration.py"
    )
    v = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v)
    native = runbox_administration().reviewed_identity()
    if native != {
        "workspaceId": v.PROJECT,
        "defaultEnvironment": "dev",
        "gitBranchToEnvironmentMapping": None,
        "domain": DOMAIN,
    }:
        raise ValueError("Unreviewed native identity")
    token = command(
        [
            str(CLI),
            "--domain=" + DOMAIN,
            "--silent",
            "--telemetry=false",
            "user",
            "get",
            "token",
            "--plain",
        ]
    ).strip()
    if not token:
        raise ValueError("Infisical login renewal required")
    if any(
        x["name"] == BUNDLE
        for x in api(token, "GET", API + "?limit=100")["accessBundles"]
    ):
        raise ValueError(
            "Bundle already exists; review it instead of replacing credentials"
        )
    BASE.mkdir(mode=0o700, parents=True)
    data = BASE / "data"
    sock = BASE / "socket"
    sock.mkdir(mode=0o700)
    if len(str(sock / " .s.PGSQL.65535").encode()) > 103:
        raise ValueError("Owned socket directory is too long")
    port = free_port()
    relay_port = free_port()
    while relay_port == port:
        relay_port = free_port()
    database = "reshoot_agent_vault_dev"
    role = "reshoot_agent_vault_app"
    password = secrets.token_urlsafe(40)
    dsn = f"postgresql://{role}:{password}@127.0.0.1:{port}/{database}?sslmode=disable"
    started = False
    bid = None
    complete = False
    try:
        command(
            [
                "/opt/homebrew/bin/initdb",
                "-D",
                str(data),
                "-A",
                "trust",
                "--encoding=UTF8",
                "--locale=C",
                "--no-instructions",
            ]
        )
        (data / "pg_hba.conf").write_text(
            "local all all trust\nhost all all 127.0.0.1/32 scram-sha-256\n"
        )
        with (data / "postgresql.conf").open("a") as f:
            f.write(
                f"\nlisten_addresses='127.0.0.1'\nport={port}\nunix_socket_directories='{sock}'\ntimezone='UTC'\nlog_statement='none'\nlog_min_error_statement='panic'\n"
            )
        command(
            [
                "/opt/homebrew/bin/pg_ctl",
                "-D",
                str(data),
                "-l",
                str(BASE / "postgres.log"),
                "-w",
                "start",
            ]
        )
        started = True
        with psycopg.connect(
            host=str(sock), port=port, dbname="postgres", autocommit=True
        ) as conn:
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
            conn.execute(
                sql.SQL(
                    "CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
                ).format(sql.Identifier(role), sql.Literal(password))
            )
            conn.execute(
                sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(
                    sql.Identifier(database)
                )
            )
            conn.execute(
                sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
                    sql.Identifier(database), sql.Identifier(role)
                )
            )
        with psycopg.connect(
            host=str(sock), port=port, dbname=database, autocommit=True
        ) as conn:
            for block in schema_statements(root):
                conn.execute(block)
            conn.execute(
                sql.SQL(
                    "REVOKE ALL ON SCHEMA public FROM PUBLIC;GRANT USAGE ON SCHEMA public TO {};GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO {};GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO {}"
                ).format(
                    sql.Identifier(role), sql.Identifier(role), sql.Identifier(role)
                )
            )
            conn.execute(
                sql.SQL(
                    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO {};ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO {}"
                ).format(sql.Identifier(role), sql.Identifier(role))
            )
            # This is a freshly created database; do not seed app users, credits or media.
            count = conn.execute("SELECT count(*) FROM users").fetchone()[0]
            if count != 0:
                raise ValueError("Expected an empty isolated database")
        bid = api(token, "POST", API, {"name": BUNDLE})["accessBundle"]["id"]
        routes = [
            (
                "reshoot-local-database",
                f"127.0.0.1:{relay_port}",
                ["POST"],
                ["/v1/db/open", "/v1/db/query", "/v1/db/close"],
                {
                    "type": "bearer",
                    "headerName": "Reshoot-Database-Connection",
                    "headerPrefix": "",
                    "value": dsn,
                },
            ),
            (
                "reshoot-local-agentbridge",
                "127.0.0.1:8082",
                ["GET", "POST"],
                ["/api/v1/models", "/api/v1/chat/completions", "/api/v1/images"],
                {"type": "passthrough"},
            ),
            (
                "reshoot-local-agentbridge-auth",
                "localhost:8082",
                ["GET"],
                ["/api/v1/openrouter/key"],
                {"type": "passthrough"},
            ),
        ]
        service_ids = []
        for name, host, methods, paths, credential in routes:
            service_ids.append(
                api(
                    token,
                    "POST",
                    f"{API}/{bid}/services",
                    {
                        "type": "http",
                        "name": name,
                        "hostPattern": host,
                        "allowedMethods": methods,
                        "allowedPathPrefixes": paths,
                        "credential": credential,
                    },
                )["service"]["id"]
            )
        for parent, child in [("/", "agents"), ("/agents", "database")]:
            folders = api(
                token,
                "GET",
                f"/api/v2/folders?projectId={v.PROJECT}&environment=dev&path={parent}",
            )["folders"]
            if not any(f["name"] == child for f in folders):
                api(
                    token,
                    "POST",
                    "/api/v2/folders",
                    {
                        "projectId": v.PROJECT,
                        "environment": "dev",
                        "path": parent,
                        "name": child,
                    },
                )
        policy = {
            "version": 1,
            "database_port": port,
            "listen_port": relay_port,
            "database": database,
            "role": role,
            "dsn_sha256": hashlib.sha256(dsn.encode()).hexdigest(),
            "idle_seconds": 30,
            "lifetime_seconds": 300,
        }
        write(BASE / "relay.json", policy)
        profile = {
            "version": 1,
            "repo": "reshoot",
            "repo_path": str(root),
            "project_id": v.PROJECT,
            "environment": "dev",
            "secret_path": "/agents/database",
            "bundle": BUNDLE,
            "node": str(PREFIX / "runtimes/node-v24.22.1-darwin-arm64/bin/node"),
            "infisical": str(CLI),
            "ca_file": str(PREFIX / "agent-vault-ca.pem"),
            "ca_fingerprint": v.FINGERPRINT,
            "release": str(release),
            "release_manifest_sha256": hashlib.sha256(
                (release / "install.json").read_bytes()
            ).hexdigest(),
            "relay_policy_sha256": hashlib.sha256(
                (BASE / "relay.json").read_bytes()
            ).hexdigest(),
            "code_sha256": {
                f: hashlib.sha256((root / f).read_bytes()).hexdigest()
                for f in sorted(v.source_files())
            },
        }
        write(BASE / "app.json", profile)
        write(
            BASE / "setup.json",
            {
                "version": 1,
                "bundle_id": bid,
                "service_ids": service_ids,
                "empty_at_creation": True,
                "production_contacted": False,
            },
        )
        complete = True
        print(
            json.dumps(
                {
                    "ok": True,
                    "database": database,
                    "role": role,
                    "database_empty": True,
                    "credential_stored_in_vault": True,
                    "production_contacted": False,
                }
            )
        )
    finally:
        if started:
            command(
                [
                    "/opt/homebrew/bin/pg_ctl",
                    "-D",
                    str(data),
                    "-m",
                    "fast",
                    "-w",
                    "stop",
                ]
            )
        if not complete:
            if bid:
                api(token, "DELETE", API + "/" + bid)
            # Only this unactivated, newly created fixture directory may be removed.
            if BASE.exists():
                shutil.rmtree(BASE)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "Isolated setup failed; credential diagnostics withheld",
                }
            )
        )
        sys.exit(1)
