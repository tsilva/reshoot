"""Trusted local PostgreSQL relay. Credentials arrive only in proxy-injected headers."""

import hashlib
import hmac
import json
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import psycopg
from psycopg.conninfo import conninfo_to_dict
from psycopg.pq import ExecStatus


class Relay:
    def __init__(self, policy):
        self.policy = policy
        self.digest = bytes.fromhex(policy["dsn_sha256"])
        self.sessions = {}
        self.lock = threading.RLock()
        self.idle = policy["idle_seconds"]
        self.lifetime = policy["lifetime_seconds"]
        self.closed = False
        self.counts = {"authenticated": 0, "rejected": 0, "queries": 0, "expired": 0}
        self.thread = threading.Thread(target=self.reap, daemon=True)
        self.thread.start()

    def authenticate(self, dsn):
        if len(dsn) > 4096 or not hmac.compare_digest(
            hashlib.sha256(dsn.encode()).digest(), self.digest
        ):
            self.counts["rejected"] += 1
            raise PermissionError()
        config = conninfo_to_dict(dsn)
        expected = {
            "host": "127.0.0.1",
            "port": str(self.policy["database_port"]),
            "dbname": self.policy["database"],
            "user": self.policy["role"],
            "sslmode": "disable",
        }
        if set(config) != set(expected) | {"password"} or any(
            config[k] != v for k, v in expected.items()
        ):
            raise PermissionError()
        self.counts["authenticated"] += 1

    def reap(self):
        while not self.closed:
            with self.lock:
                for key, session in list(self.sessions.items()):
                    if time.monotonic() >= min(
                        session["expires"], session["hard_expires"]
                    ) and session["lock"].acquire(blocking=False):
                        try:
                            session[
                                "conn"
                            ].close()  # PostgreSQL rolls back an unfinished transaction.
                            del self.sessions[key]
                            self.counts["expired"] += 1
                        finally:
                            session["lock"].release()
            time.sleep(0.05)

    def dispatch(self, path, body, owner, dsn):
        self.authenticate(dsn)
        if not re.fullmatch("[a-f0-9]{48}", owner):
            raise PermissionError()
        if path == "/v1/db/open":
            if body != {}:
                raise ValueError()
            with self.lock:
                if (
                    len(self.sessions) >= 12
                    or sum(s["owner"] == owner for s in self.sessions.values()) >= 6
                ):
                    raise ValueError()
                conn = psycopg.connect(
                    dsn,
                    autocommit=True,
                    connect_timeout=2,
                    options="-c client_encoding=UTF8 -c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000",
                )
                key = secrets.token_hex(24)
                now = time.monotonic()
                self.sessions[key] = {
                    "conn": conn,
                    "owner": owner,
                    "seq": 0,
                    "lock": threading.Lock(),
                    "expires": now + self.idle,
                    "hard_expires": now + self.lifetime,
                }
            return {"ok": True, "connection": key}
        fields = {"connection", "sequence"} | (
            {"sql", "parameters"} if path == "/v1/db/query" else set()
        )
        if path not in ("/v1/db/query", "/v1/db/close") or set(body) != fields:
            raise ValueError()
        with self.lock:
            session = self.sessions.get(body["connection"])
            if not session or session["owner"] != owner:
                raise PermissionError()
        with session["lock"]:
            if time.monotonic() >= min(session["expires"], session["hard_expires"]):
                raise PermissionError()
            if (
                type(body["sequence"]) is not int
                or body["sequence"] != session["seq"]
                or session["seq"] >= 10000
            ):
                raise PermissionError()
            session["seq"] += 1
            if path.endswith("/close"):
                session["conn"].close()
                with self.lock:
                    self.sessions.pop(body["connection"], None)
                return {"ok": True}
            sql = body["sql"]
            params = body["parameters"]
            if (
                not isinstance(sql, str)
                or not 0 < len(sql.encode()) <= 131072
                or not isinstance(params, list)
                or len(params) > 1000
                or any(p is not None and not isinstance(p, str) for p in params)
            ):
                raise ValueError()
            result = session["conn"].pgconn.exec_params(
                sql.encode(), [None if p is None else p.encode() for p in params]
            )
            self.counts["queries"] += 1
            session["expires"] = time.monotonic() + self.idle
            if result.status not in (ExecStatus.COMMAND_OK, ExecStatus.TUPLES_OK):
                state = result.error_field(ord("C"))
                state = state.decode() if state else ""
                return {
                    "ok": False,
                    "code": state if re.fullmatch("[A-Z0-9]{5}", state) else "XXXXX",
                }
            if result.ntuples > 10000:
                raise ValueError()
            names = [result.fname(i).decode() for i in range(result.nfields)]
            rows = [
                [
                    None if (v := result.get_value(row, col)) is None else v.decode()
                    for col in range(result.nfields)
                ]
                for row in range(result.ntuples)
            ]
            return {
                "ok": True,
                "rows": rows,
                "fields": [
                    {"name": name, "dataTypeID": result.ftype(i)}
                    for i, name in enumerate(names)
                ],
                "rowCount": result.command_tuples,
                "command": result.command_status.decode().split(" ")[0],
            }

    def stop(self):
        self.closed = True
        self.thread.join(timeout=2)
        with self.lock:
            for s in self.sessions.values():
                s["conn"].close()
            self.sessions.clear()


def serve(relay):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def setup(self):
            self.request.settimeout(5)
            super().setup()

        def log_message(self, *_args):
            pass

        def do_POST(self):
            status = 200
            try:
                if (
                    self.headers.get("Origin")
                    or self.headers.get("Transfer-Encoding")
                    or self.headers.get("Content-Type") != "application/json"
                ):
                    raise ValueError()
                size = int(self.headers.get("Content-Length", 0))
                if not 0 < size <= 262144:
                    raise ValueError()
                body = json.loads(self.rfile.read(size))
                if not isinstance(body, dict):
                    raise ValueError()
                result = relay.dispatch(
                    self.path,
                    body,
                    self.headers.get("X-Reshoot-Owner", ""),
                    self.headers.get("Reshoot-Database-Connection", ""),
                )
                data = json.dumps(result).encode()
                if len(data) > 1048576:
                    raise ValueError()
            except PermissionError:
                status, data = 403, b'{"ok":false,"reason":"Database access rejected"}'
            except Exception:
                status, data = (
                    400,
                    b'{"ok":false,"reason":"Database operation rejected"}',
                )
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Connection", "close")
            self.end_headers()
            try:
                self.wfile.write(data)
            except OSError:
                pass  # No replay after ambiguous delivery.
            self.close_connection = True

    class BoundedServer(ThreadingHTTPServer):
        daemon_threads = True

        def __init__(self, *args):
            self.workers = threading.BoundedSemaphore(24)
            super().__init__(*args)

        def process_request(self, request, address):
            if not self.workers.acquire(blocking=False):
                self.shutdown_request(request)
                return
            try:
                super().process_request(request, address)
            except BaseException:
                self.workers.release()
                raise

        def process_request_thread(self, request, address):
            try:
                super().process_request_thread(request, address)
            finally:
                self.workers.release()

        def handle_error(self, *_args):
            pass

    return BoundedServer(("127.0.0.1", relay.policy["listen_port"]), Handler)
