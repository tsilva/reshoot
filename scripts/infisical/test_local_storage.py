"""Offline synthetic storage tests. Never contacts R2, Clerk or Infisical."""

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location(
    "storage", Path(__file__).with_name("local_storage_relay.py")
)
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)


class StorageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        root.chmod(0o700)
        self.token = "fake-only-storage-authorization"
        p = {
            "version": 1,
            "listen_port": 0,
            "root": str(root),
            "token_sha256": hashlib.sha256(self.token.encode()).hexdigest(),
        }
        self.server = storage.Server(p)
        p["listen_port"] = self.server.server_port
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.key = "users/fixture/projects/project/originals/asset/source"
        self.body = b"Synthetic local storage fixture."
        self.sha = hashlib.sha256(self.body).hexdigest()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def request(self, path, data=None, method="POST", headers=None):
        h = {"Reshoot-Storage-Token": self.token, **(headers or {})}
        return urllib.request.urlopen(
            urllib.request.Request(
                self.base + path,
                data=data
                if isinstance(data, bytes)
                else json.dumps(data or {}).encode(),
                headers=h,
                method=method,
            ),
            timeout=5,
        )

    def test_server_roundtrip_stream_metadata_and_delete(self):
        metadata = {
            "key": self.key,
            "mimeType": "image/png",
            "checksumSha256": self.sha,
        }
        with self.request(
            "/v1/storage/put",
            self.body,
            headers={"Reshoot-Storage-Metadata": json.dumps(metadata)},
        ) as r:
            self.assertEqual(r.status, 200)
        with self.request("/v1/storage/head", {"key": self.key}) as r:
            self.assertEqual(json.load(r)["Metadata"]["sha256"], self.sha)
        with self.request("/v1/storage/get", {"key": self.key}) as r:
            self.assertEqual(r.read(), self.body)
        with self.request("/v1/storage/delete", {"key": self.key}) as r:
            self.assertEqual(r.status, 200)
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request("/v1/storage/get", {"key": self.key})
        self.assertEqual(error.exception.code, 404)

    def test_browser_upload_read_checksum_and_one_use(self):
        with self.request(
            "/v1/storage/sign-upload",
            {
                "key": self.key,
                "mimeType": "image/png",
                "checksumSha256": self.sha,
                "expiresIn": 600,
            },
        ) as r:
            signed = json.load(r)
        req = urllib.request.Request(
            signed["url"], data=b"wrong", method="PUT", headers=signed["headers"]
        )
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(req)
        req.data = self.body
        with urllib.request.urlopen(req) as r:
            self.assertEqual(r.status, 200)
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(req)
        self.assertEqual(error.exception.code, 403)
        with self.request(
            "/v1/storage/sign-read", {"key": self.key, "expiresIn": 600}
        ) as r:
            url = json.load(r)["url"]
        with urllib.request.urlopen(url) as r:
            self.assertEqual(r.read(), self.body)
        # Browser cookies ignore ports. Capability auth must ignore these cookies.
        with urllib.request.urlopen(
            urllib.request.Request(
                url, headers={"Cookie": "__session=fake-browser-only"}
            )
        ) as r:
            self.assertEqual(r.read(), self.body)
        wrong = urllib.request.Request(
            url, method="PUT", data=self.body, headers=signed["headers"]
        )
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(wrong)
        self.assertEqual(error.exception.code, 403)

    def test_path_auth_and_origin_guards(self):
        for key in (
            "users/../escape",
            "../outside",
            "/users/thing",
            "users//a",
            "users/a\\x",
        ):
            with self.assertRaises(urllib.error.HTTPError):
                self.request("/v1/storage/head", {"key": key})
        for h in (
            {"Reshoot-Storage-Token": "reshoot_storage_public_placeholder"},
            {"Origin": "https://unrelated.invalid"},
            {"Cookie": "__session=fake-browser-only"},
            {"Host": "unrelated.invalid"},
        ):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request("/v1/storage/check", {}, headers=h)
            self.assertEqual(error.exception.code, 403)

    def test_symlink_and_unknown_policy_rejected(self):
        root = Path(self.tmp.name)
        linked = root / "linked"
        linked.symlink_to(root, target_is_directory=True)
        with self.assertRaises(ValueError):
            storage.private(linked, True)
        path = root / "policy.json"
        path.write_text('{"version":1,"extra":true}')
        path.chmod(0o600)
        with self.assertRaises(ValueError):
            storage.policy(path)

    def test_expired_and_unknown_browser_urls_fail(self):
        from unittest.mock import patch

        with patch.object(storage.time, "monotonic", return_value=100):
            with self.request(
                "/v1/storage/sign-read", {"key": self.key, "expiresIn": 1}
            ) as r:
                url = json.load(r)["url"]
        with patch.object(storage.time, "monotonic", return_value=102):
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(url)
            self.assertEqual(error.exception.code, 403)
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(self.base + "/objects/unknown")
        self.assertEqual(error.exception.code, 403)


if __name__ == "__main__":
    unittest.main()
