"""Offline Clerk relay boundary tests using only synthetic loopback services."""

import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location(
    "storage_relay", Path(__file__).with_name("local_storage_relay.py")
)
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)


class ClerkRelayTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.calls = []
        self.key = "sk_test_" + "a" * 32
        self.jwk = {
            "kid": "fixture",
            "kty": "RSA",
            "n": "fixture-public-n",
            "e": "AQAB",
        }
        fixture = self

        class Upstream(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                fixture.calls.append(self.path)
                matching = self.headers.get("Authorization") == "Bearer " + fixture.key
                if self.path == "/v1/jwks":
                    key = dict(fixture.jwk, d="fixture-private-field")
                    if not matching:
                        key["n"] = "different-instance"
                    value = {"keys": [key]}
                elif self.path == "/v1/users/user_fixture":
                    value = {
                        "id": "user_fixture",
                        "object": "user",
                        "first_name": "Fixture",
                        "private_metadata": {"token": "fixture-do-not-return"},
                        "external_accounts": [
                            {"access_token": "fixture-do-not-return"}
                        ],
                        "email_addresses": [
                            {
                                "id": "email_fixture",
                                "email_address": "fixture@example.invalid",
                                "private_metadata": "fixture-do-not-return",
                            }
                        ],
                    }
                else:
                    value = {"directives": [], "access_token": "fixture-do-not-return"}
                body = json.dumps(value).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)

        self.upstream = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
        self.upstream_thread = threading.Thread(
            target=self.upstream.serve_forever, daemon=True
        )
        self.upstream_thread.start()
        policy = {
            "version": 1,
            "listen_port": 0,
            "root": self.folder.name,
            "token_sha256": hashlib.sha256(b"fixture-storage").hexdigest(),
        }
        fingerprint = hashlib.sha256(
            (self.jwk["n"] + ":" + self.jwk["e"]).encode()
        ).hexdigest()
        self.server = storage.Server(
            policy,
            clerk_jwks=fingerprint,
            clerk_upstream=f"http://127.0.0.1:{self.upstream.server_port}",
        )
        policy["listen_port"] = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        for server, thread in (
            (self.server, self.thread),
            (self.upstream, self.upstream_thread),
        ):
            server.shutdown()
            server.server_close()
            thread.join()
        self.folder.cleanup()

    def request(self, path, key=None, headers=None):
        request = urllib.request.Request(
            self.base + path,
            headers={"Reshoot-Clerk-Key": key or self.key, **(headers or {})},
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, response.read().decode()
        except urllib.error.HTTPError as response:
            return response.code, response.read().decode()

    def test_public_keys_and_profiles_exclude_private_metadata(self):
        status, body = self.request("/v1/jwks")
        self.assertEqual(status, 200)
        self.assertNotIn("d", json.loads(body)["keys"][0])
        status, body = self.request("/v1/users/user_fixture")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["id"], "user_fixture")
        self.assertNotIn("fixture-do-not-return", body)
        self.assertNotIn(self.key, body)
        status, body = self.request("/v1/clients/handshake_payload?nonce=fixture")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"directives": []})

    def test_wrong_instance_key_cannot_read_a_profile(self):
        status, body = self.request("/v1/users/user_fixture", key="sk_test_" + "b" * 32)
        self.assertEqual(status, 403)
        self.assertNotIn("/v1/users/user_fixture", self.calls)
        self.assertNotIn(self.key, body)

    def test_unreviewed_paths_queries_and_browser_credentials_never_reach_upstream(
        self,
    ):
        for path, headers in (
            ("/v1/users", {}),
            ("/v1/users/user_fixture/tokens", {}),
            ("/v1/jwks?extra=1", {}),
            ("/v1/clients/handshake_payload?nonce=x&nonce=y", {}),
            ("/v1/jwks", {"Cookie": "fixture-session"}),
            ("/v1/jwks", {"Origin": "http://127.0.0.1:3000"}),
        ):
            with self.subTest(path=path, headers=headers):
                status, _body = self.request(path, headers=headers)
                self.assertEqual(status, 403)
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
