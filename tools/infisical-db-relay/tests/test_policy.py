import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from infisical_db_relay.cli import load_policy
from infisical_db_relay.relay import Relay


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.dsn = (
            "postgresql://fixture:fake-only@127.0.0.1:17642/fixture?sslmode=disable"
        )
        self.policy = {
            "version": 1,
            "database_port": 17642,
            "listen_port": 17643,
            "database": "fixture",
            "role": "fixture",
            "dsn_sha256": hashlib.sha256(self.dsn.encode()).hexdigest(),
            "idle_seconds": 1,
            "lifetime_seconds": 5,
        }

    def test_owner_only_policy_and_no_scope_overrides(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory).resolve() / "policy.json"
            path.write_text(json.dumps(self.policy))
            path.chmod(0o600)
            self.assertEqual(load_policy(path), self.policy)
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                load_policy(path)
            path.chmod(0o600)
            path.write_text(json.dumps({**self.policy, "password": "fake"}))
            with self.assertRaises(ValueError):
                load_policy(path)

    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory).resolve() / "policy.json"
            target.write_text(json.dumps(self.policy))
            target.chmod(0o600)
            link = Path(directory).resolve() / "link"
            link.symlink_to(target)
            with self.assertRaises(ValueError):
                load_policy(link)

    def test_header_credential_verified_without_returning_value(self):
        relay = Relay(self.policy)
        try:
            relay.authenticate(self.dsn)
            for invalid in ["", "reshoot_database_public_placeholder", self.dsn + "x"]:
                with self.assertRaises(PermissionError) as caught:
                    relay.authenticate(invalid)
                self.assertNotIn("fake-only", str(caught.exception))
        finally:
            relay.stop()

    def test_remote_database_and_unreviewed_connection_options_rejected(self):
        for dsn in [
            self.dsn.replace("127.0.0.1", "example.com"),
            self.dsn + "&options=-c%20role%3Dadmin",
        ]:
            relay = Relay(
                {**self.policy, "dsn_sha256": hashlib.sha256(dsn.encode()).hexdigest()}
            )
            try:
                with self.assertRaises(PermissionError):
                    relay.authenticate(dsn)
            finally:
                relay.stop()


if __name__ == "__main__":
    unittest.main()
