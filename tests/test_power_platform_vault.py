"""Offline identity-bound, encrypted, cross-instance token-record tests."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import unittest
from cryptography.fernet import Fernet

from backend.app.power_platform_vault import (
    VerifiedPrincipal, EncryptedPowerPlatformVault, PowerPlatformVaultError,
)

OID = '11111111-1111-4111-8111-111111111111'
TENANT = '22222222-2222-4222-8222-222222222222'
ACCESS = 'synthetic-access-token-not-real-test-only'

class FakeDocument:
    def __init__(self, parent, name):
        self.parent = parent
        self.name = name
    def set(self, row):
        self.parent.rows[self.name] = row
    def get(self):
        data = self.parent.rows.get(self.name)
        class Snapshot:
            exists = data is not None
            def to_dict(self): return data
        return Snapshot()
    def delete(self):
        self.parent.rows.pop(self.name, None)

class FakeCollection:
    def __init__(self): self.rows = {}
    def document(self, key): return FakeDocument(self, key)

class VaultTests(unittest.TestCase):
    def setUp(self):
        self.coll = FakeCollection()
        self.key = Fernet.generate_key().decode()
        self.vault = EncryptedPowerPlatformVault(collection=self.coll, encryption_key=self.key)
        self.owner = VerifiedPrincipal(eid=2021, entra_oid=OID, tenant_id=TENANT)
        self.other = VerifiedPrincipal(eid=176, entra_oid=OID, tenant_id=TENANT)

    def test_round_trip_encrypts_and_never_persists_refresh(self):
        expires = self.vault.save(self.owner, {'access_token': ACCESS,
            'expires_in': 3599, 'refresh_token': 'never-save-me'})
        raw = next(iter(self.coll.rows.values()))
        self.assertNotIn(ACCESS, str(raw))
        self.assertNotIn('never-save-me', str(raw))
        self.assertEqual(raw['schemaVersion'], 1)
        self.assertEqual(self.vault.access_token(self.owner), ACCESS)
        info = self.vault.status(self.owner)
        self.assertTrue(info['connected'])
        self.assertNotIn(ACCESS, str(info))
        self.assertLessEqual((expires - datetime.now(timezone.utc)).total_seconds(), 3600)

    def test_denies_other_actors_even_with_same_oid(self):
        self.vault.save(self.owner, {'access_token': ACCESS, 'expires_in': 120})
        self.assertIsNone(self.vault.access_token(self.other))

    def test_absent_or_expired_is_not_zero_or_connected(self):
        self.assertEqual(self.vault.status(self.owner)['availability'], 'RECONNECT_REQUIRED')
        self.vault.save(self.owner, {'access_token': ACCESS, 'expires_in': 120})
        raw = self.coll.rows[self.owner.document_id]
        payload = self.vault._fernet.decrypt(raw['ciphertext'].encode())
        import json
        body = json.loads(payload)
        body['expires'] = (datetime.now(timezone.utc)-timedelta(minutes=10)).isoformat()
        raw['ciphertext'] = self.vault._fernet.encrypt(json.dumps(body).encode()).decode()
        self.assertIsNone(self.vault.access_token(self.owner))

    def test_tamper_denied_without_leak(self):
        self.vault.save(self.owner, {'access_token': ACCESS, 'expires_in': 90})
        self.coll.rows[self.owner.document_id]['ciphertext'] = 'invalid'
        with self.assertRaises(PowerPlatformVaultError) as ex:
            self.vault.access_token(self.owner)
        self.assertEqual(ex.exception.code, 'VAULT_INVALID_RECORD')
        self.assertNotIn(ACCESS, str(ex.exception))

    def test_expiration_bounds_and_wrong_type_denied(self):
        for expires in (None, '3600', 30, 99999, True):
            with self.subTest(expires=expires):
                with self.assertRaises(PowerPlatformVaultError):
                    self.vault.save(self.owner, {'access_token': ACCESS, 'expires_in': expires})

    def test_explicit_disconnect_deletes_credential_record_only(self):
        self.vault.save(self.owner, {'access_token': ACCESS, 'expires_in': 500})
        self.vault.disconnect(self.owner)
        self.assertFalse(self.coll.rows)

    def test_invalid_identity_and_encryption_key_denied(self):
        for oid in ('', 'fake', '00000000-0000-0000-0000-000000000000'):
            with self.assertRaises(PowerPlatformVaultError):
                VerifiedPrincipal(eid=2021, entra_oid=oid, tenant_id=TENANT)
        with self.assertRaises(PowerPlatformVaultError):
            EncryptedPowerPlatformVault(collection=self.coll, encryption_key='')

if __name__ == '__main__': unittest.main()
