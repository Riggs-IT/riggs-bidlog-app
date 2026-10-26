"""Offline checks for owner-only, encrypted, opt-in 30-day token renewal.

All credential values are synthetic; no Microsoft calls or Cloud Run usage.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import unittest
from cryptography.fernet import Fernet

from backend.app.power_platform_vault import (
    EncryptedPowerPlatformVault, PowerPlatformVaultError, VerifiedPrincipal,
)

OID = "11111111-1111-4111-8111-111111111111"
TENANT = "22222222-2222-4222-8222-222222222222"
ACCESS = "synthetic-access-token-test-only-000"
REFRESH = "synthetic-refresh-token-test-only-000"


class Doc:
    def __init__(self, parent, key):
        self.parent, self.key = parent, key
    def set(self, row):
        self.parent.rows[self.key] = row
    def get(self):
        data = self.parent.rows.get(self.key)
        class Snap:
            exists = data is not None
            def to_dict(self): return data
        return Snap()
    def delete(self):
        self.parent.rows.pop(self.key, None)


class Collection:
    def __init__(self): self.rows = {}
    def document(self, key): return Doc(self, key)


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.collection = Collection()
        self.principal = VerifiedPrincipal(eid=2021, entra_oid=OID, tenant_id=TENANT)
        self.other = VerifiedPrincipal(eid=176, entra_oid=OID, tenant_id=TENANT)
        self.calls = []
        def refresh(token):
            self.calls.append(token)
            return {
                "access_token": "renewed-access-token-synthetic-000",
                "refresh_token": "rotated-refresh-token-synthetic-000",
                "expires_in": 3600,
            }
        self.vault = EncryptedPowerPlatformVault(
            collection=self.collection,
            encryption_key=Fernet.generate_key().decode(),
            refresh_enabled=True, refresh_provider=refresh,
        )

    def _store(self):
        self.vault.save(self.principal, {
            "access_token": ACCESS, "expires_in": 3600, "refresh_token": REFRESH,
        })
        return self.collection.rows[self.principal.document_id]

    def _read_secret(self, row):
        return json.loads(self.vault._fernet.decrypt(row["ciphertext"].encode()))

    def test_encrypt_refresh_and_never_return_to_browser(self):
        row = self._store()
        self.assertEqual(row["schemaVersion"], 2)
        self.assertNotIn(ACCESS, str(row))
        self.assertNotIn(REFRESH, str(row))
        self.assertEqual(self._read_secret(row)["refresh"], REFRESH)
        self.assertTrue(self.vault.status(self.principal)["connected"])
        self.assertNotIn(REFRESH, str(self.vault.status(self.principal)))
        self.assertIsNone(self.vault.access_token(self.other))
        self.assertEqual(self.calls, [])

    def test_access_expired_renews_once_and_rotates_secret(self):
        row = self._store()
        before = self._read_secret(row)
        before["expires"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        row["ciphertext"] = self.vault._fernet.encrypt(json.dumps(before).encode()).decode()
        self.assertTrue(self.vault.status(self.principal)["connected"])
        self.assertEqual(self.calls, [])  # a passive status check never renews
        access = self.vault.access_token(self.principal)
        self.assertEqual(access, "renewed-access-token-synthetic-000")
        self.assertEqual(self.calls, [REFRESH])
        after = self._read_secret(self.collection.rows[self.principal.document_id])
        self.assertEqual(after["refresh"], "rotated-refresh-token-synthetic-000")
        self.assertEqual(after["refreshUntil"], before["refreshUntil"])
        self.assertEqual(self.vault.access_token(self.principal), access)
        self.assertEqual(len(self.calls), 1)

    def test_invalid_grant_deletes_only_this_user(self):
        self._store()
        row = self.collection.rows[self.principal.document_id]
        data = self._read_secret(row)
        data["expires"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        row["ciphertext"] = self.vault._fernet.encrypt(json.dumps(data).encode()).decode()
        self.vault._refresh_provider = lambda _t: (_ for _ in ()).throw(PowerPlatformVaultError("RECONNECT_REQUIRED"))
        with self.assertRaises(PowerPlatformVaultError) as caught:
            self.vault.access_token(self.principal)
        self.assertEqual(caught.exception.code, "RECONNECT_REQUIRED")
        self.assertNotIn(self.principal.document_id, self.collection.rows)

    def test_malformed_refresh_reply_cannot_overwrite_record(self):
        self._store()
        row = self.collection.rows[self.principal.document_id]
        before = self._read_secret(row)
        before["expires"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        row["ciphertext"] = self.vault._fernet.encrypt(json.dumps(before).encode()).decode()
        current_ciphertext = row["ciphertext"]
        self.vault._refresh_provider = lambda _token: {"access_token": "short", "expires_in": 3600}
        with self.assertRaises(PowerPlatformVaultError):
            self.vault.access_token(self.principal)
        self.assertEqual(self.collection.rows[self.principal.document_id]["ciphertext"], current_ciphertext)

    def test_old_access_only_record_requires_one_consent(self):
        # The two vaults must use the same key to demonstrate backward compatibility.
        key = Fernet.generate_key().decode()
        disabled = EncryptedPowerPlatformVault(collection=self.collection, encryption_key=key)
        enabled = EncryptedPowerPlatformVault(
            collection=self.collection, encryption_key=key,
            refresh_enabled=True, refresh_provider=lambda _rt: {},
        )
        disabled.save(self.principal, {"access_token": ACCESS, "expires_in": 3600})
        self.assertTrue(disabled.status(self.principal)["connected"])
        self.assertFalse(enabled.status(self.principal)["connected"])
        self.assertIsNone(enabled.access_token(self.principal))

    def test_declines_to_store_offline_without_refresh_credential(self):
        with self.assertRaises(PowerPlatformVaultError) as result:
            self.vault.save(self.principal, {"access_token": ACCESS, "expires_in": 3600})
        self.assertEqual(result.exception.code, "REFRESH_TOKEN_REQUIRED")
        self.assertEqual(self.collection.rows, {})

    def test_expired_refresh_window_requires_reconnect(self):
        row = self._store()
        content = self._read_secret(row)
        content["refreshUntil"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        content["expires"] = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        row["ciphertext"] = self.vault._fernet.encrypt(json.dumps(content).encode()).decode()
        self.assertFalse(self.vault.status(self.principal)["connected"])
        self.assertIsNone(self.vault.access_token(self.principal))

    def test_failure_messages_contain_no_token(self):
        self._store()
        row = self.collection.rows[self.principal.document_id]
        content = self._read_secret(row)
        content["expires"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        row["ciphertext"] = self.vault._fernet.encrypt(json.dumps(content).encode()).decode()
        self.vault._refresh_provider = lambda _t: (_ for _ in ()).throw(PowerPlatformVaultError("MICROSOFT_TOKEN_UNAVAILABLE"))
        with self.assertRaises(PowerPlatformVaultError) as outcome:
            self.vault.access_token(self.principal)
        self.assertNotIn(REFRESH, str(outcome.exception))
        self.assertNotIn(ACCESS, str(outcome.exception))


if __name__ == "__main__":
    unittest.main()
