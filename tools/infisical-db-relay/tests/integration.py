"""Owns only a disposable local PostgreSQL cluster and disposable Vault bundle."""

import hashlib
import importlib.util
import json
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import threading
import tempfile

import psycopg
from psycopg import sql

R = Path(__file__).resolve().parents[3]
W = R / ".internal/evidence/local-relay-integration"
W.mkdir(parents=True, mode=0o700, exist_ok=True)
S = W / "source"
shutil.copytree(Path(__file__).parent / "fixtures", S, dirs_exist_ok=True)
state = W / "baseline.json"
if not state.exists():
    files = subprocess.check_output(
        ["git", "ls-files", "-co", "--exclude-standard"], cwd=R, text=True
    ).splitlines()
    state.write_text(
        json.dumps(
            {
                p: hashlib.sha256((R / p).read_bytes()).hexdigest()
                for p in set(files)
                if (R / p).is_file()
            },
            indent=2,
        )
        + "\n"
    )
    state.chmod(0o600)
cluster = W / ("cluster-" + secrets.token_hex(4))
cluster.mkdir(mode=0o700)
sockdir = Path(tempfile.mkdtemp(prefix="rsvp-", dir="/private/tmp"))
data = cluster / "data"
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
pgctl = "/opt/homebrew/bin/pg_ctl"
pgstarted = False
bundle = None
server = None
ai = None
relay = None
admin = None
logs = []
result = {"ok": False}
password = "fake-only-" + secrets.token_hex(20)
dsn = f"postgresql://reshoot_vault_fixture:{password}@127.0.0.1:{port}/reshoot_vault_disposable?sslmode=disable"
ai_secret = "fake-ai-only-" + secrets.token_hex(20)
try:
    subprocess.run(
        [
            "/opt/homebrew/bin/initdb",
            "-D",
            str(data),
            "-A",
            "trust",
            "--no-instructions",
        ],
        capture_output=True,
        check=True,
    )
    (data / "pg_hba.conf").write_text(
        "local all all trust\nhost all all 127.0.0.1/32 scram-sha-256\n"
    )
    subprocess.run(
        [
            pgctl,
            "-D",
            str(data),
            "-l",
            str(cluster / "postgres.log"),
            "-o",
            f"-h 127.0.0.1 -p {port} -k {sockdir} -c log_statement=none",
            "-w",
            "start",
        ],
        capture_output=True,
        check=True,
    )
    pgstarted = True
    with psycopg.connect(
        host=str(sockdir), port=port, dbname="postgres", autocommit=True
    ) as conn:
        conn.execute("CREATE DATABASE reshoot_vault_disposable")
        conn.execute(
            sql.SQL(
                "CREATE ROLE reshoot_vault_fixture LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
            ).format(sql.Literal(password))
        )
    with psycopg.connect(
        host=str(sockdir), port=port, dbname="reshoot_vault_disposable", autocommit=True
    ) as conn:
        conn.execute(
            "CREATE TABLE users(id uuid primary key);CREATE TABLE projects(id uuid primary key,owner_id uuid references users(id));CREATE TABLE generation_attempts(id uuid primary key,usage_cost_micros bigint,updated_at timestamptz default now());CREATE TABLE relay_probe(id text primary key,value int not null)"
        )
        ddl = (
            (R / "drizzle/0005_provider_cost_tracking.sql")
            .read_text()
            .split("-- Preserve historical image usage")[0]
        )
        conn.execute(ddl)
        conn.execute(
            "INSERT INTO users VALUES('00000000-0000-4000-8000-000000000001');INSERT INTO projects VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');INSERT INTO generation_attempts(id) VALUES('00000000-0000-4000-8000-000000000003')"
        )
        conn.execute(
            "GRANT USAGE ON SCHEMA public TO reshoot_vault_fixture;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO reshoot_vault_fixture;ALTER TABLE provider_calls OWNER TO reshoot_vault_fixture"
        )
    from infisical_db_relay import relay as m

    policy = {
        "version": 1,
        "database_port": port,
        "listen_port": 0,
        "database": "reshoot_vault_disposable",
        "role": "reshoot_vault_fixture",
        "dsn_sha256": hashlib.sha256(dsn.encode()).hexdigest(),
        "idle_seconds": 3,
        "lifetime_seconds": 20,
    }
    relay = m.Relay(policy)
    original = relay.dispatch

    def dispatch(path, body, owner, credential):
        value = original(path, body, owner, credential)
        if path == "/v1/db/query" and "/*lose-reply*/" in body["sql"]:
            raise ConnectionAbortedError("Synthetic ambiguous commit")
        return value

    relay.dispatch = dispatch
    server = m.serve(relay)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    ai_calls = []

    class AI(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            ai_calls.append(
                {
                    "path": self.path,
                    "injected": self.headers.get("Authorization")
                    == "Bearer " + ai_secret,
                }
            )
            # Confirm actual durable record precedes the synthetic AI request.
            with psycopg.connect(
                host=str(sockdir),
                port=port,
                dbname="reshoot_vault_disposable",
                autocommit=True,
            ) as c:
                pending = c.execute(
                    "select count(*) from provider_calls where state='started'"
                ).fetchone()[0]
            ai_calls[-1]["durable_before_inference"] = pending > 0
            if self.path.endswith("/images"):
                body = {"data": [{"b64_json": "synthetic-only"}], "usage": {"cost": 0}}
            else:
                body = {
                    "choices": [
                        {"message": {"content": '{"title":"Synthetic ceramic mug"}'}}
                    ],
                    "usage": {"cost": 0},
                }
            data_out = json.dumps(body).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data_out)))
            self.end_headers()
            self.wfile.write(data_out)

    ai = ThreadingHTTPServer(("127.0.0.1", 0), AI)
    threading.Thread(target=ai.serve_forever, daemon=True).start()
    spec = importlib.util.spec_from_file_location(
        "setup", Path(__file__).resolve().parents[1] / "scripts/provision_reshoot.py"
    )
    setup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(setup)
    import types

    admin = types.SimpleNamespace(
        CLI=str(setup.CLI),
        DOMAIN=setup.DOMAIN,
        PATH=setup.API,
        ENV=setup.ENV,
        api=setup.api,
    )
    token = setup.command(
        [
            str(setup.CLI),
            "--domain=" + setup.DOMAIN,
            "--silent",
            "--telemetry=false",
            "user",
            "get",
            "token",
            "--plain",
        ]
    ).strip()
    bundle_name = "test-reshoot-db-" + secrets.token_hex(5)
    bundle = admin.api(token, "POST", admin.PATH, {"name": bundle_name})[
        "accessBundle"
    ]["id"]
    for name, port_value, header, prefix, value, paths in [
        (
            "synthetic-database",
            server.server_port,
            "Reshoot-Database-Connection",
            "",
            dsn,
            ["/v1/db/open", "/v1/db/query", "/v1/db/close"],
        ),
        (
            "synthetic-ai",
            ai.server_port,
            "Authorization",
            "Bearer",
            ai_secret,
            ["/api/v1/chat/completions", "/api/v1/images"],
        ),
    ]:
        admin.api(
            token,
            "POST",
            f"{admin.PATH}/{bundle}/services",
            {
                "type": "http",
                "name": name,
                "hostPattern": f"127.0.0.1:{port_value}",
                "allowedMethods": ["POST"],
                "allowedPathPrefixes": paths,
                "credential": {
                    "type": "bearer",
                    "headerName": header,
                    "headerPrefix": prefix,
                    "value": value,
                },
            },
        )
    canary = cluster / "private-canary"
    canary.write_text("synthetic private fixture")
    canary.chmod(0o600)
    policy = S / "sandbox.sb"
    policy.write_text("""(version 1)
(allow default)
(deny process-exec)
(allow process-exec (literal (param "NODE_BIN")))
(deny mach-lookup (global-name "com.apple.securityd") (global-name "com.apple.securityd.xpc"))
(deny network*)
(allow network-outbound (remote tcp "localhost:8283"))
(deny file-read-data file-write* (subpath (param "USER_HOME")))
(allow file-read-data (subpath (param "NODE_ROOT")) (subpath (param "REPO_ROOT")) (literal (param "CA_FILE")))
(deny file-write* (subpath (param "REPO_ROOT")))
(deny file-read-data (subpath (string-append (param "REPO_ROOT") "/.internal")) (subpath (string-append (param "REPO_ROOT") "/.git"))
(subpath (string-append (param "REPO_ROOT") "/.clerk")) (subpath (string-append (param "REPO_ROOT") "/.vercel"))
(regex #"(^|/)[.]env($|[./])") (regex #"(^|/)([.]netrc|[.]access[.]local[.]toml)$"))
(allow file-read-data (subpath (param "FIXTURE_SOURCE")))
""")
    policy.chmod(0o600)
    prefix = Path.home() / ".config/infisical"
    node = str(prefix / "runtimes/node-v24.22.1-darwin-arm64/bin/node")
    ca = str(prefix / "agent-vault-ca.pem")
    sandbox = ["/usr/bin/sandbox-exec"]
    for key, value in {
        "USER_HOME": str(Path.home()),
        "REPO_ROOT": str(R),
        "FIXTURE_SOURCE": str(S),
        "CA_FILE": ca,
        "NODE_ROOT": str(Path(node).parent.parent),
        "NODE_BIN": node,
    }.items():
        sandbox += ["-D", key + "=" + value]
    sandbox += ["-f", str(policy)]
    cmd = [
        admin.CLI,
        "agent-vault",
        "run",
        "--domain=https://app.infisical.com",
        "--access-bundle=" + bundle_name,
        "--proxy=127.0.0.1:8283",
        "--ca-fingerprint=SHA256:37:B2:E0:81:45:EC:C0:58:46:2E:D1:2F:E1:2B:E6:AE:2B:78:B1:B3:F0:21:CD:8F:EC:54:CC:30:2D:36:9E:37",
        "--ttl=10m",
        "--no-ca-trust",
        "--no-skills",
        "--silent",
        "--telemetry=false",
        "--",
        "/usr/bin/env",
        "RESHOOT_DATABASE_TRANSPORT=agent-vault",
        "RESHOOT_DATABASE_BASE_URL=http://127.0.0.1:" + str(server.server_port) + "/",
        "RESHOOT_DATABASE_CONNECTION=reshoot_database_public_placeholder",
        "AGENTBRIDGE_API_KEY=agentbridge_public_placeholder",
        f"AGENTBRIDGE_BASE_URL=http://127.0.0.1:{ai.server_port}/api/v1",
        f"FIXTURE_RELAY=http://127.0.0.1:{server.server_port}/",
        "FIXTURE_REPO=" + str(R),
        "FIXTURE_CANARY=" + str(canary),
        "FIXTURE_PG_PORT=" + str(port),
        "NODE_ENV=development",
        "NO_PROXY=",
        "no_proxy=",
        "NODE_USE_ENV_PROXY=1",
        "NODE_EXTRA_CA_CERTS=" + ca,
        *sandbox,
        node,
        "--use-env-proxy",
        "--experimental-transform-types",
        "--disable-warning=ExperimentalWarning",
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "--conditions=react-server",
        "--import=" + (S / "hooks.mjs").as_uri(),
        str(S / "probe.mjs"),
    ]
    process = subprocess.run(
        cmd, cwd=R, env=admin.ENV, capture_output=True, text=True, timeout=90
    )
    logs = [process.stdout, process.stderr]
    assert all(x not in "".join(logs) for x in [password, dsn, ai_secret, token]), (
        "Credential appeared in child output"
    )
    rows = [
        json.loads(x) for x in process.stdout.splitlines() if x.startswith('{"ok":')
    ]
    result = (
        rows[-1]
        if rows
        else {
            "ok": False,
            "stage": "no-sanitized-result",
            "diagnostic": process.stderr[-2200:],
        }
    )
    result["exit"] = process.returncode
    result["ai_calls"] = ai_calls
    result["relay_counts"] = relay.counts
    result["credentials_not_logged"] = True
    with psycopg.connect(
        host=str(sockdir), port=port, dbname="reshoot_vault_disposable", autocommit=True
    ) as c:
        ids = [x[0] for x in c.execute("select id from relay_probe order by id")]
    result["database_outcome_matches"] = ids == ["ambiguous-commit", "committed"]
    result["exactly_two_fake_ai_calls"] = len(ai_calls) == 2 and all(
        x["injected"] and x["durable_before_inference"] for x in ai_calls
    )
    result["ok"] = bool(
        result["ok"]
        and process.returncode == 0
        and result["database_outcome_matches"]
        and result["exactly_two_fake_ai_calls"]
    )
except Exception as e:
    result = {
        "ok": False,
        "stage": type(e).__name__,
        "reason": str(e)
        if isinstance(e, AssertionError)
        else "Diagnostic details withheld",
    }
    if isinstance(e, subprocess.CalledProcessError):
        result["command"] = Path(e.cmd[0]).name
        result["local_fixture_diagnostic"] = (
            (e.stderr or b"")
            .decode(errors="replace")
            .replace(password, "[fake]")
            .replace(dsn, "[fake]")
            .replace(ai_secret, "[fake]")[-1000:]
        )
finally:
    if bundle:
        try:
            admin.api(token, "DELETE", admin.PATH + "/" + bundle)
            result["fake_bundle_deleted"] = True
        except Exception:
            result["fake_bundle_deleted"] = False
    if ai:
        ai.shutdown()
        ai.server_close()
    if server:
        server.shutdown()
        server.server_close()
    if relay:
        relay.stop()
    if pgstarted:
        stopped = (
            subprocess.run(
                [pgctl, "-D", str(data), "-m", "fast", "-w", "stop"],
                capture_output=True,
            ).returncode
            == 0
        )
        result["disposable_postgres_stopped"] = stopped
        if stopped:
            shutil.rmtree(cluster)
            shutil.rmtree(sockdir)
            result["disposable_cluster_removed"] = True
    result["production_contacted"] = False
    f = W / "receipt.json"
    f.write_text(json.dumps(result, indent=2) + "\n")
    f.chmod(0o600)
    print(json.dumps(result))
raise SystemExit(not result["ok"])
