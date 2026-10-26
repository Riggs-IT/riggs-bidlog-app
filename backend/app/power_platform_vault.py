"""Short-lived, per-Entra-user Power Platform token custody (Stage F1).

No refresh tokens are retained: the signed-in user reconnects when the
short-lived access token expires. This intentionally is NOT unattended 24/7
monitoring. Firestore supplies cross-Cloud-Run-instance storage; a Secret
Manager-supplied Fernet key protects ciphertext at the application layer.

Never log/return access tokens, OIDs, Microsoft HTTP response bodies, or
credential-store exception messages. No RiggsDataHub or worker writes.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import re
from uuid import UUID
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

_COLLECTION = re.compile(r"[a-z][a-z0-9_]{2,95}\Z")
_MAX_SECONDS = 3600


class PowerPlatformVaultError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _guid(value: object) -> str:
    try:
        guid = UUID(str(value))
        if guid.int:
            return str(guid)
    except (ValueError, TypeError, AttributeError):
        pass
    raise PowerPlatformVaultError("INVALID_IDENTITY")


@dataclass(frozen=True)
class VerifiedPrincipal:
    eid: int
    entra_oid: str
    tenant_id: str

    def __post_init__(self) -> None:
        if type(self.eid) is not int or self.eid <= 0:
            raise PowerPlatformVaultError("INVALID_IDENTITY")
        object.__setattr__(self, "entra_oid", _guid(self.entra_oid))
        object.__setattr__(self, "tenant_id", _guid(self.tenant_id))

    @property
    def document_id(self) -> str:
        return sha256(f"riggs-pp:v1:{self.tenant_id}:{self.entra_oid}:{self.eid}".encode()).hexdigest()


class EncryptedPowerPlatformVault:
    """Dependency-injectable Firestore collection; not an in-memory token cache."""

    def __init__(self, *, collection: Any, encryption_key: str):
        if not encryption_key:
            raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED")
        try:
            self._fernet = Fernet(encryption_key.encode("ascii"))
        except (ValueError, TypeError, AttributeError) as exc:
            raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED") from None
        self._collection = collection

    @classmethod
    def from_settings(cls, settings: Any) -> "EncryptedPowerPlatformVault":
        name = str(getattr(settings, "power_platform_firestore_collection", ""))
        key = str(getattr(settings, "power_platform_token_key", ""))
        if not _COLLECTION.fullmatch(name) or not key:
            raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED")
        try:
            from google.cloud import firestore
            collection = firestore.Client().collection(name)
        except Exception:
            raise PowerPlatformVaultError("VAULT_UNAVAILABLE") from None
        return cls(collection=collection, encryption_key=key)

    def save(self, principal: VerifiedPrincipal, token: dict) -> datetime:
        access = token.get("access_token") if isinstance(token, dict) else None
        expires_in = token.get("expires_in") if isinstance(token, dict) else None
        if not isinstance(access, str) or not 10 <= len(access) <= 50000:
            raise PowerPlatformVaultError("INVALID_TOKEN_RESPONSE")
        if type(expires_in) is not int or not 60 <= expires_in <= 86400:
            raise PowerPlatformVaultError("INVALID_TOKEN_RESPONSE")
        now = datetime.now(timezone.utc)
        expires = now + timedelta(seconds=min(expires_in, _MAX_SECONDS))
        body = {
            "tenant": principal.tenant_id,
            "oid": principal.entra_oid,
            "eid": principal.eid,
            "access": access,
            "expires": expires.isoformat(),
        }
        encrypted = self._fernet.encrypt(json.dumps(body, separators=(",", ":")).encode()).decode()
        try:
            self._collection.document(principal.document_id).set({
                "ciphertext": encrypted,
                "expiresAt": expires,  # Optional Firestore TTL policy can purge expired docs
                "schemaVersion": 1,
            })
        except Exception:
            raise PowerPlatformVaultError("VAULT_UNAVAILABLE") from None
        return expires

    def _read(self, principal: VerifiedPrincipal) -> dict | None:
        try:
            snapshot = self._collection.document(principal.document_id).get()
            row = snapshot.to_dict() if snapshot.exists else None
        except Exception:
            raise PowerPlatformVaultError("VAULT_UNAVAILABLE") from None
        if not row:
            return None
        if not isinstance(row, dict) or row.get("schemaVersion") != 1:
            raise PowerPlatformVaultError("VAULT_INVALID_RECORD")
        try:
            plaintext = self._fernet.decrypt(str(row["ciphertext"]).encode())
            record = json.loads(plaintext)
            exp = datetime.fromisoformat(record["expires"])
            if exp.tzinfo is None:
                raise ValueError()
            if (record.get("oid"), record.get("tenant"), record.get("eid")) != (
                principal.entra_oid, principal.tenant_id, principal.eid
            ):
                raise ValueError()
            if not isinstance(record.get("access"), str):
                raise ValueError()
        except (InvalidToken, ValueError, KeyError, TypeError, UnicodeDecodeError):
            raise PowerPlatformVaultError("VAULT_INVALID_RECORD") from None
        if exp <= datetime.now(timezone.utc) + timedelta(seconds=30):
            return None
        return record

    def status(self, principal: VerifiedPrincipal) -> dict:
        record = self._read(principal)
        return {
            "connected": record is not None,
            "availability": "CONNECTED" if record else "RECONNECT_REQUIRED",
            "expiresAtUTC": record["expires"] if record else None,
            "credentialStorage": "SERVER_SIDE_ENCRYPTED",
        }

    def access_token(self, principal: VerifiedPrincipal) -> str | None:
        record = self._read(principal)
        return record["access"] if record else None

    def disconnect(self, principal: VerifiedPrincipal) -> None:
        try:
            self._collection.document(principal.document_id).delete()
        except Exception:
            raise PowerPlatformVaultError("VAULT_UNAVAILABLE") from None
