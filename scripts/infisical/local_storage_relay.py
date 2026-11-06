"""Trusted local object store. Vault supplies authorization; apps see placeholders.

Install a reviewed copy outside the consumer sandbox. No R2 keys, user databases,
provider plugins or source credential retrieval are used by this process.
"""

import argparse
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import stat
import struct
import tempfile
import threading
import time
from urllib.parse import urlsplit
import urllib.request

MAX_OBJECT = 512 * 1024 * 1024
MAX_UPLOAD = 20 * 1024 * 1024
METHODS = ("check", "sign-upload", "sign-read", "head", "get", "put", "delete")
MIME = {"image/jpeg", "image/png", "image/webp", "application/zip"}


def private(path, directory=False):
    p = path.lstat()
    if (
        p.st_uid != os.getuid()
        or p.st_mode & 0o077
        or not (stat.S_ISDIR(p.st_mode) if directory else stat.S_ISREG(p.st_mode))
    ):
        raise ValueError("Expected owner-only storage state")


def policy(path):
    private(path)
    p = json.loads(path.read_text())
    if (
        set(p) != {"version", "listen_port", "root", "token_sha256"}
        or type(p["version"]) is not int
        or p["version"] != 1
        or type(p["listen_port"]) is not int
        or not 1024 <= p["listen_port"] <= 65535
        or not re.fullmatch("[a-f0-9]{64}", p["token_sha256"])
    ):
        raise ValueError("Unreviewed storage policy")
    root = Path(p["root"])
    if not root.is_absolute() or root.resolve(strict=True) != root:
        raise ValueError("Noncanonical storage root")
    private(root, True)
    return p


class Store:
    def __init__(self, p, clerk_jwks=None, clerk_upstream="https://api.clerk.com"):
        self.p = p
        self.root = Path(p["root"])
        self.lock = threading.RLock()
        self.tickets = {}
        self.clerk_jwks = clerk_jwks
        self.clerk_upstream = clerk_upstream
        self.verified_keys = {}

    def clerk(self, path, key):
        """Exact paths only: never expose OAuth tokens or arbitrary user metadata."""

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *_args):
                raise ValueError("Redirect rejected")

        def get(target):
            request = urllib.request.Request(
                self.clerk_upstream + target,
                headers={
                    "Authorization": "Bearer " + key,
                    "Clerk-API-Version": "2026-08-20",
                    "User-Agent": "reshoot-local-vault/1.0",
                },
            )
            with urllib.request.build_opener(
                urllib.request.ProxyHandler({}), NoRedirect()
            ).open(request, timeout=15) as response:
                body = response.read(1024 * 1024 + 1)
                if len(body) > 1024 * 1024:
                    raise ValueError("Oversized Clerk response")
                return json.loads(body)

        digest = hashlib.sha256(key.encode()).hexdigest()
        data = None
        if path == "/v1/jwks" or self.verified_keys.get(digest, 0) <= time.monotonic():
            data = get("/v1/jwks")
            if not any(
                k.get("kty") == "RSA"
                and hashlib.sha256((k["n"] + ":" + k["e"]).encode()).hexdigest()
                == self.clerk_jwks
                for k in data["keys"]
            ):
                raise PermissionError()
            self.verified_keys = {
                k: v for k, v in self.verified_keys.items() if v > time.monotonic()
            }
            if len(self.verified_keys) >= 128:
                raise ValueError("Too many credential verifications")
            self.verified_keys[digest] = time.monotonic() + 60
        if path == "/v1/jwks":
            return {
                "keys": [
                    {
                        k: v
                        for k, v in item.items()
                        if k in {"kid", "kty", "alg", "use", "n", "e"}
                    }
                    for item in data["keys"]
                ]
            }
        data = get(path)
        if path.startswith("/v1/users/"):
            fields = {
                "id",
                "object",
                "first_name",
                "last_name",
                "username",
                "primary_email_address_id",
            }
            safe = {k: v for k, v in data.items() if k in fields}
            safe["email_addresses"] = [
                {
                    k: v
                    for k, v in address.items()
                    if k in {"id", "object", "email_address"}
                }
                for address in data.get("email_addresses", [])
            ]
            return safe
        return {"directives": data["directives"]}

    def path(self, key):
        if (
            not isinstance(key, str)
            or len(key.encode()) > 2048
            or not key.startswith("users/")
            or any(x in ("", ".", "..") for x in key.split("/"))
            or "\\" in key
            or any(ord(x) < 32 for x in key)
        ):
            raise ValueError("Invalid object key")
        return self.root / (hashlib.sha256(key.encode()).hexdigest() + ".object")

    def head(self, key):
        path = self.path(key)
        private(path)
        with path.open("rb") as f:
            size = struct.unpack("!I", f.read(4))[0]
            if size > 4096:
                raise ValueError("Invalid object metadata")
            meta = json.loads(f.read(size))
            if f.seek(0, 2) != 4 + size + meta["ContentLength"]:
                raise ValueError("Incomplete stored object")
        return meta

    def put(self, key, body, mime, checksum):
        path = self.path(key)
        if mime not in MIME or not re.fullmatch("[a-fA-F0-9]{64}", checksum):
            raise ValueError("Invalid object metadata")
        checksum = checksum.lower()
        if not hmac.compare_digest(hashlib.sha256(body).hexdigest(), checksum):
            raise ValueError("Object checksum mismatch")
        meta = {
            "ContentLength": len(body),
            "ContentType": mime,
            "Metadata": {"sha256": checksum},
        }
        header = json.dumps(meta, separators=(",", ":")).encode()
        fd, name = tempfile.mkstemp(prefix=".put-", dir=self.root)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(struct.pack("!I", len(header)))
                f.write(header)
                f.write(body)
                f.flush()
                os.fsync(f.fileno())
            os.replace(name, path)
        finally:
            if Path(name).exists():
                Path(name).unlink()

    def ticket(self, mode, data):
        self.path(data["key"])
        ttl = data.get("expiresIn", 600)
        if type(ttl) is not int or not 1 <= ttl <= 600:
            raise ValueError("Invalid expiry")
        now = time.monotonic()
        self.tickets = {k: v for k, v in self.tickets.items() if v[0] > now}
        if len(self.tickets) >= 2048:
            raise ValueError("Too many active URLs")
        value = secrets.token_urlsafe(32)
        self.tickets[value] = (now + ttl, mode, dict(data))
        return f"http://127.0.0.1:{self.p['listen_port']}/objects/{value}"


def handler(store):
    class Handler(BaseHTTPRequestHandler):
        server_version = "LocalStorage"

        def log_message(self, *_args):
            pass  # URLs contain short-lived browser capabilities; never log them.

        def origin(self):
            value = self.headers.get("Origin")
            if value:
                o = urlsplit(value)
                if (
                    o.scheme != "http"
                    or o.hostname not in ("127.0.0.1", "localhost")
                    or not o.port
                    or o.path
                    or o.query
                    or o.fragment
                    or o.username
                    or o.password
                ):
                    raise PermissionError()
            return value

        def validate_request(self):
            allowed_hosts = {f"127.0.0.1:{store.p['listen_port']}"}
            if store.clerk_jwks and self.path.startswith("/v1/"):
                allowed_hosts.add(f"localhost:{store.p['listen_port']}")
            if (
                self.headers.get("Host") not in allowed_hosts
                or self.headers.get("Transfer-Encoding")
                or (
                    urlsplit(self.path).query
                    and not self.path.startswith("/v1/clients/handshake_payload?")
                )
                or urlsplit(self.path).fragment
            ):
                raise PermissionError()
            self.origin()

        def reply(self, status, value=None):
            body = json.dumps(value or {"ok": False}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.headers_common(len(body))
            self.end_headers()
            self.wfile.write(body)

        def headers_common(self, length):
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            origin = self.origin()
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")

        def body(self, limit):
            text = self.headers.get("Content-Length", "")
            if not text.isdecimal() or not 0 <= int(text) <= limit:
                raise ValueError("Invalid content length")
            data = self.rfile.read(int(text))
            if len(data) != int(text):
                raise ValueError("Incomplete body")
            return data

        def stream(self, key):
            meta = store.head(key)
            with store.path(key).open("rb") as f:
                length = struct.unpack("!I", f.read(4))[0]
                f.seek(length, 1)
                self.send_response(200)
                self.send_header("Content-Type", meta["ContentType"])
                self.headers_common(meta["ContentLength"])
                self.end_headers()
                while chunk := f.read(256 * 1024):
                    self.wfile.write(chunk)

        def do_OPTIONS(self):
            try:
                self.validate_request()
                if not self.path.startswith("/objects/"):
                    raise PermissionError()
                self.send_response(204)
                self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "content-type")
                self.headers_common(0)
                self.end_headers()
            except Exception:
                self.send_error(403, "Request denied")

        def do_GET(self):
            if self.path.startswith("/v1/"):
                return self.clerk()
            self.capability("read")

        def clerk(self):
            try:
                self.validate_request()
                url = urlsplit(self.path)
                valid = (
                    self.path == "/v1/jwks"
                    or re.fullmatch(r"/v1/users/user_[A-Za-z0-9]+", self.path)
                    or (
                        url.path == "/v1/clients/handshake_payload"
                        and re.fullmatch(r"nonce=[A-Za-z0-9_.-]{1,2048}", url.query)
                    )
                )
                keys = self.headers.get_all("Reshoot-Clerk-Key", [])
                if (
                    not store.clerk_jwks
                    or not valid
                    or self.headers.get("Cookie")
                    or self.headers.get("Origin")
                    or len(keys) != 1
                    or not re.fullmatch(r"sk_test_[A-Za-z0-9_-]{20,256}", keys[0])
                ):
                    raise PermissionError()
                with store.lock:
                    data = store.clerk(self.path, keys[0])
                self.reply(200, data)
            except urllib.error.HTTPError as error:
                self.reply(
                    502,
                    {
                        "errors": [
                            {
                                "code": "relay_upstream",
                                "message": "Clerk upstream request failed",
                                "meta": {"status": error.code},
                            }
                        ]
                    },
                )
            except PermissionError:
                self.reply(
                    403,
                    {
                        "errors": [
                            {"code": "relay_denied", "message": "Clerk request denied"}
                        ]
                    },
                )
            except Exception:
                self.reply(
                    502,
                    {
                        "errors": [
                            {
                                "code": "relay_internal",
                                "message": "Clerk relay failed; details withheld",
                            }
                        ]
                    },
                )

        def do_PUT(self):
            self.capability("upload")

        def capability(self, mode):
            try:
                self.validate_request()
                with store.lock:
                    value = self.path.removeprefix("/objects/")
                    entry = (
                        store.tickets.get(value)
                        if self.path.startswith("/objects/")
                        else None
                    )
                    if not entry or entry[0] <= time.monotonic() or entry[1] != mode:
                        raise PermissionError()
                    data = entry[2]
                    if mode == "read":
                        self.stream(data["key"])
                    else:
                        if self.headers.get("Content-Type") != data["mimeType"]:
                            raise ValueError()
                        store.put(
                            data["key"],
                            self.body(MAX_UPLOAD),
                            data["mimeType"],
                            data["checksumSha256"],
                        )
                        del store.tickets[value]
                        self.reply(200, {"ok": True})
            except PermissionError:
                self.send_error(403, "Request denied")
            except FileNotFoundError:
                self.send_error(404, "Object missing")
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                self.send_error(400, "Storage operation failed")

        def do_POST(self):
            try:
                self.validate_request()
                supplied = self.headers.get_all("Reshoot-Storage-Token", [])
                if (
                    self.headers.get("Origin")
                    or self.headers.get("Cookie")
                    or len(supplied) != 1
                    or not hmac.compare_digest(
                        hashlib.sha256(supplied[0].encode()).hexdigest(),
                        store.p["token_sha256"],
                    )
                ):
                    raise PermissionError()
                mode = self.path.removeprefix("/v1/storage/")
                if not self.path.startswith("/v1/storage/") or mode not in METHODS:
                    raise PermissionError()
                data = (
                    json.loads(self.headers.get("Reshoot-Storage-Metadata", "{}"))
                    if mode == "put"
                    else json.loads(self.body(8192))
                )
                expected = {
                    "check": set(),
                    "sign-upload": {"key", "mimeType", "checksumSha256", "expiresIn"},
                    "sign-read": {"key", "expiresIn"},
                    "put": {"key", "mimeType", "checksumSha256"},
                }
                if not isinstance(data, dict) or set(data) != expected.get(
                    mode, {"key"}
                ):
                    raise ValueError()
                with store.lock:
                    if mode == "check":
                        return self.reply(
                            200,
                            {
                                "ok": True,
                                "isolated": True,
                                "credential_mode": "public-placeholder",
                            },
                        )
                    store.path(data["key"])
                    if mode == "sign-upload":
                        if data["mimeType"] not in MIME - {
                            "application/zip"
                        } or not re.fullmatch(
                            "[a-fA-F0-9]{64}", data["checksumSha256"]
                        ):
                            raise ValueError()
                        return self.reply(
                            200,
                            {
                                "url": store.ticket("upload", data),
                                "headers": {"Content-Type": data["mimeType"]},
                            },
                        )
                    if mode == "sign-read":
                        return self.reply(200, {"url": store.ticket("read", data)})
                    if mode == "head":
                        return self.reply(200, store.head(data["key"]))
                    if mode == "get":
                        return self.stream(data["key"])
                    if mode == "put":
                        store.put(
                            data["key"],
                            self.body(MAX_OBJECT),
                            data["mimeType"],
                            data["checksumSha256"],
                        )
                    if mode == "delete":
                        store.path(data["key"]).unlink(missing_ok=True)
                    self.reply(200, {"ok": True})
            except PermissionError:
                self.send_error(403, "Request denied")
            except FileNotFoundError:
                self.send_error(404, "Object missing")
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                self.send_error(400, "Storage operation failed")

    return Handler


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 16

    def __init__(self, p, clerk_jwks=None, clerk_upstream="https://api.clerk.com"):
        self.slots = threading.BoundedSemaphore(16)
        super().__init__(
            ("127.0.0.1", p["listen_port"]),
            handler(Store(p, clerk_jwks, clerk_upstream)),
        )

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        request.settimeout(30)
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()

    def handle_error(self, *_args):
        pass


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--clerk-jwks-sha256")
    args = parser.parse_args()
    os.umask(0o077)
    p = policy(args.profile)
    if args.clerk_jwks_sha256 and not re.fullmatch(
        "[a-f0-9]{64}", args.clerk_jwks_sha256
    ):
        raise ValueError("Invalid public signing-key fingerprint")
    server = Server(p, args.clerk_jwks_sha256)
    print(
        json.dumps({"ready": True, "host": "127.0.0.1", "port": p["listen_port"]}),
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(
            json.dumps(
                {"ok": False, "reason": "Storage relay failed; details withheld"}
            ),
            flush=True,
        )
        raise SystemExit(1) from None
