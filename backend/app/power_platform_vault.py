"""Encrypted, identity-bound Power Platform OAuth token storage.

Default behavior is the original short-lived access-token-only Stage F1 vault.
When explicitly enabled, an `offline_access` refresh token is encrypted with
Fernet in the existing Firestore collection and retained for no longer than
30 days. Microsoft refresh exchanges occur only on an authenticated, owner-
authorized read. Never put Microsoft tokens in app sessions, browser storage,
SQL, a log, or an HTTP response. No scheduled/unattended monitoring.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import re
from typing import Any, Callable
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken

_COLLECTION = re.compile(r"[a-z][a-z0-9_]{2,95}\Z")
_MAX_SECONDS = 3600
_REFRESH_RETENTION = timedelta(days=30)
_REFRESH_SKEW = timedelta(seconds=60)
_TOKEN_MAX = 50000

# Only stable, documented Microsoft Entra numeric error codes and error types
# are mapped. Never expose error_description, trace IDs, account IDs, URLs,
# credentials, or arbitrary upstream values to the browser or logs.
_RUNTIME_AADSTS_CODES = {
    70011: "RUNTIME_INVALID_SCOPE",
    500011: "RUNTIME_RESOURCE_NOT_FOUND",
    65001: "RUNTIME_CONSENT_REQUIRED",
    90094: "RUNTIME_CONSENT_REQUIRED",
    50076: "RUNTIME_INTERACTION_REQUIRED",
    50079: "RUNTIME_INTERACTION_REQUIRED",
    50058: "RUNTIME_INTERACTION_REQUIRED",
    700082: "RUNTIME_REAUTH_REQUIRED",
    700084: "RUNTIME_REAUTH_REQUIRED",
    50173: "RUNTIME_REAUTH_REQUIRED",
    7000215: "RUNTIME_CLIENT_AUTH_FAILED",
    7000222: "RUNTIME_CLIENT_AUTH_FAILED",
    700016: "RUNTIME_CLIENT_AUTH_FAILED",
}
_RUNTIME_OAUTH_TYPES = {
    "invalid_scope": "RUNTIME_INVALID_SCOPE",
    "invalid_resource": "RUNTIME_RESOURCE_NOT_FOUND",
    "consent_required": "RUNTIME_CONSENT_REQUIRED",
    "interaction_required": "RUNTIME_INTERACTION_REQUIRED",
    "invalid_grant": "RUNTIME_REAUTH_REQUIRED",
    "invalid_client": "RUNTIME_CLIENT_AUTH_FAILED",
    "unauthorized_client": "RUNTIME_CLIENT_AUTH_FAILED",
}


def _runtime_grant_failure(response: Any) -> str:
    """Classify only explicitly allowlisted Entra errors. No raw error leakage."""
    fallback = "RUNTIME_TOKEN_GRANT_REJECTED"
    try:
        if len(response.content) > 8192:
            return fallback
        payload = response.json()
        if not isinstance(payload, dict):
            return fallback
        codes = payload.get("error_codes")
        if isinstance(codes, list) and len(codes) <= 8:
            for code in codes:
                if type(code) is int and code in _RUNTIME_AADSTS_CODES:
                    return _RUNTIME_AADSTS_CODES[code]
        category = payload.get("error")
        if isinstance(category, str):
            return _RUNTIME_OAUTH_TYPES.get(category, fallback)
    except (ValueError, UnicodeError, TypeError, AttributeError):
        pass
    return fallback


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


def _token_text(value: object, *, label: str) -> str:
    if not isinstance(value, str) or not 10 <= len(value) <= _TOKEN_MAX:
        raise PowerPlatformVaultError(label)
    return value


def _token_expiry(token: dict, now: datetime) -> datetime:
    seconds = token.get("expires_in")
    if type(seconds) is not int or not 60 <= seconds <= 86400:
        raise PowerPlatformVaultError("INVALID_TOKEN_RESPONSE")
    return now + timedelta(seconds=min(seconds, _MAX_SECONDS))


def _datetime(value: object) -> datetime:
    try:
        item = datetime.fromisoformat(str(value))
        if item.tzinfo is None:
            raise ValueError()
        return item
    except (TypeError, ValueError):
        raise PowerPlatformVaultError("VAULT_INVALID_RECORD") from None


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
    """Existing Firestore token vault; refresh custody is an opt-in extension."""

    def __init__(
        self,
        *,
        collection: Any,
        encryption_key: str,
        refresh_enabled: bool = False,
        refresh_provider: Callable[[str], dict] | None = None,
        purpose: str = "platform",
    ):
        if not encryption_key:
            raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED")
        try:
            self._fernet = Fernet(encryption_key.encode("ascii"))
        except (ValueError, TypeError, AttributeError):
            raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED") from None
        if purpose not in ("platform", "runtime"):
            raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED")
        self._purpose = purpose
        self._collection = collection
        self._refresh_enabled = bool(refresh_enabled)
        self._refresh_provider = refresh_provider
        if self._refresh_enabled and self._refresh_provider is None:
            raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED")

    @classmethod
    def from_settings(cls, settings: Any, *, purpose: str = "platform") -> "EncryptedPowerPlatformVault":
        name = str(getattr(settings, "power_platform_firestore_collection", ""))
        key = str(getattr(settings, "power_platform_token_key", ""))
        if not _COLLECTION.fullmatch(name) or not key:
            raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED")
        if purpose not in ("platform", "runtime"):
            raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED")
        enabled = bool(getattr(settings, "power_platform_refresh_enabled", False))
        provider = None
        if enabled:
            tenant = _guid(getattr(settings, "entra_tenant_id", ""))
            client_id = _guid(getattr(settings, "entra_client_id", ""))
            client_secret = str(getattr(settings, "entra_client_secret", ""))
            if not client_secret:
                raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED")

            def provider(stored_refresh_token: str) -> dict:
                # Fixed tenant authority, form-encoded server-only credential.
                # Never print token, response body, headers, or exception details.
                import httpx
                endpoint = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
                requested_scope = (
                    "https://service.flow.microsoft.com//.default offline_access"
                    if purpose == "runtime" else
                    "https://api.powerplatform.com/EnvironmentManagement.Environments.Read "
                    "https://api.powerplatform.com/PowerAutomate.Flows.Read "
                    "https://api.powerplatform.com/ResourceQuery.Resources.Read "
                    "offline_access"
                )
                try:
                    with httpx.Client(
                        timeout=httpx.Timeout(7, connect=3),
                        trust_env=False, follow_redirects=False,
                    ) as client:
                        response = client.post(endpoint, data={
                            "grant_type": "refresh_token",
                            "client_id": client_id,
                            "client_secret": client_secret,
                            "refresh_token": stored_refresh_token,
                            "scope": requested_scope,
                        }, headers={"Accept": "application/json"})
                except httpx.RequestError:
                    raise PowerPlatformVaultError("MICROSOFT_TOKEN_UNAVAILABLE") from None
                if response.status_code in (400, 401, 403):
                    # Never disconnect the working platform credential because
                    # a separate Flow runtime audience has rejected a grant.
                    # Entra's optional numeric error_codes are reduced to a
                    # fixed safe enum; raw OAuth responses are never emitted.
                    raise PowerPlatformVaultError(
                        _runtime_grant_failure(response) if purpose == "runtime"
                        else "RECONNECT_REQUIRED"
                    )
                if response.status_code != 200 or len(response.content) > 100000:
                    raise PowerPlatformVaultError("MICROSOFT_TOKEN_UNAVAILABLE")
                try:
                    body = response.json()
                except (ValueError, UnicodeError):
                    raise PowerPlatformVaultError("INVALID_TOKEN_RESPONSE") from None
                if not isinstance(body, dict):
                    raise PowerPlatformVaultError("INVALID_TOKEN_RESPONSE")
                return body

        try:
            from google.cloud import firestore
            collection = firestore.Client().collection(name)
        except Exception:
            raise PowerPlatformVaultError("VAULT_UNAVAILABLE") from None
        return cls(
            collection=collection,
            encryption_key=key,
            refresh_enabled=enabled,
            refresh_provider=provider,
            purpose=purpose,
        )

    def _document_key(self, principal: VerifiedPrincipal) -> str:
        # Preserve ALL preexisting v1/v2 Power Platform document IDs. The
        # experimental runtime credential has a separate opaque document.
        if self._purpose == "platform":
            return principal.document_id
        return sha256(f"{principal.document_id}:runtime:v1".encode()).hexdigest()

    def runtime_access_token_from(self, principal: VerifiedPrincipal, source: "EncryptedPowerPlatformVault") -> str | None:
        """Derive runtime access only from THIS verified user's platform grant.

        The bootstrap result is stored in a distinct encrypted record. The
        existing Power Platform refresh grant is never overwritten by the
        experimental runtime reader and must never leave the backend.
        """
        if self._purpose != "runtime" or source._purpose != "platform":
            raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED")
        access = self.access_token(principal)
        if access:
            return access
        source_record = source._read(principal)
        if not source_record or not isinstance(source_record.get("refresh"), str):
            return None
        if not self._refresh_provider:
            raise PowerPlatformVaultError("VAULT_NOT_CONFIGURED")
        result = self._refresh_provider(source_record["refresh"])
        access = _token_text(result.get("access_token") if isinstance(result, dict) else None,
                             label="INVALID_TOKEN_RESPONSE")
        _token_expiry(result, datetime.now(timezone.utc))
        # Microsoft may issue only an access token for the second audience.
        # That is usable for THIS request but cannot create a persistent
        # runtime grant. The existing platform grant remains untouched.
        if result.get("refresh_token"):
            self.save(principal, result)
        return access

    def _persist(
        self, principal: VerifiedPrincipal, record: dict, *, ttl: datetime, version: int,
    ) -> None:
        encrypted = self._fernet.encrypt(
            json.dumps(record, separators=(",", ":")).encode()
        ).decode()
        try:
            self._collection.document(self._document_key(principal)).set({
                "ciphertext": encrypted,
                "expiresAt": ttl,
                "schemaVersion": version,
            })
        except Exception:
            raise PowerPlatformVaultError("VAULT_UNAVAILABLE") from None

    def save(self, principal: VerifiedPrincipal, token: dict) -> datetime:
        if not isinstance(token, dict):
            raise PowerPlatformVaultError("INVALID_TOKEN_RESPONSE")
        now = datetime.now(timezone.utc)
        access = _token_text(token.get("access_token"), label="INVALID_TOKEN_RESPONSE")
        expires = _token_expiry(token, now)
        record = {
            "tenant": principal.tenant_id,
            "oid": principal.entra_oid,
            "eid": principal.eid,
            "access": access,
            "expires": expires.isoformat(),
        }
        if self._refresh_enabled:
            refresh = _token_text(token.get("refresh_token"), label="REFRESH_TOKEN_REQUIRED")
            refresh_until = now + _REFRESH_RETENTION
            record.update(refresh=refresh, refreshUntil=refresh_until.isoformat())
            self._persist(principal, record, ttl=refresh_until, version=2)
        else:
            # Backward-compatible, intentionally access-only legacy behavior.
            self._persist(principal, record, ttl=expires, version=1)
        return expires

    def _read(self, principal: VerifiedPrincipal) -> dict | None:
        try:
            snapshot = self._collection.document(self._document_key(principal)).get()
            row = snapshot.to_dict() if snapshot.exists else None
        except Exception:
            raise PowerPlatformVaultError("VAULT_UNAVAILABLE") from None
        if not row:
            return None
        if not isinstance(row, dict) or row.get("schemaVersion") not in (1, 2):
            raise PowerPlatformVaultError("VAULT_INVALID_RECORD")
        try:
            plaintext = self._fernet.decrypt(str(row["ciphertext"]).encode())
            record = json.loads(plaintext)
            exp = _datetime(record["expires"])
            if (record.get("oid"), record.get("tenant"), record.get("eid")) != (
                principal.entra_oid, principal.tenant_id, principal.eid,
            ):
                raise ValueError()
            _token_text(record.get("access"), label="VAULT_INVALID_RECORD")
            if row["schemaVersion"] == 2:
                _token_text(record.get("refresh"), label="VAULT_INVALID_RECORD")
                deadline = _datetime(record["refreshUntil"])
                if deadline < exp:
                    raise ValueError()
        except (InvalidToken, ValueError, KeyError, TypeError, UnicodeDecodeError, PowerPlatformVaultError):
            raise PowerPlatformVaultError("VAULT_INVALID_RECORD") from None

        now = datetime.now(timezone.utc)
        if self._refresh_enabled:
            # Existing access-only connections require ONE new delegated consent.
            if row["schemaVersion"] != 2 or deadline <= now + _REFRESH_SKEW:
                return None
        elif exp <= now + timedelta(seconds=30):
            return None
        return record

    def status(self, principal: VerifiedPrincipal) -> dict:
        record = self._read(principal)
        # expiresAtUTC is used by React as a connection identity; use the
        # durable refresh window to avoid clearing inventory after every renew.
        availability_expiry = (
            record.get("refreshUntil") if self._refresh_enabled and record
            else record.get("expires") if record else None
        )
        return {
            "connected": record is not None,
            "availability": "CONNECTED" if record else "RECONNECT_REQUIRED",
            "expiresAtUTC": availability_expiry,
            "credentialStorage": "SERVER_SIDE_ENCRYPTED",
        }

    def access_token(self, principal: VerifiedPrincipal) -> str | None:
        record = self._read(principal)
        if not record:
            return None
        now = datetime.now(timezone.utc)
        if _datetime(record["expires"]) > now + _REFRESH_SKEW:
            return record["access"]
        if not self._refresh_enabled or self._refresh_provider is None:
            return None
        try:
            result = self._refresh_provider(record["refresh"])
            if not isinstance(result, dict):
                raise PowerPlatformVaultError("INVALID_TOKEN_RESPONSE")
            access = _token_text(result.get("access_token"), label="INVALID_TOKEN_RESPONSE")
            expires = _token_expiry(result, datetime.now(timezone.utc))
            next_refresh = _token_text(
                result.get("refresh_token") or record["refresh"],
                label="INVALID_TOKEN_RESPONSE",
            )
        except PowerPlatformVaultError as exc:
            if exc.code == "RECONNECT_REQUIRED":
                self.disconnect(principal)
            raise
        # Keep the original 30-day retention deadline; refresh does not extend it.
        next_record = {**record, "access": access, "expires": expires.isoformat(),
                       "refresh": next_refresh}
        self._persist(
            principal, next_record,
            ttl=_datetime(record["refreshUntil"]), version=2,
        )
        return access

    def disconnect(self, principal: VerifiedPrincipal) -> None:
        try:
            self._collection.document(self._document_key(principal)).delete()
        except Exception:
            raise PowerPlatformVaultError("VAULT_UNAVAILABLE") from None
