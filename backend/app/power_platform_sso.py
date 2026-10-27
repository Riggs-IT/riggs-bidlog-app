"""Best-effort, one-login Power Platform credential bootstrap.

ONLY invoked for the already resolved/pinned Administration owner after the
normal Entra authorization-code callback. This never alters the human session,
passes credentials to the browser, or logs Microsoft HTTP response bodies.
"""
from __future__ import annotations

from uuid import UUID

import httpx

from .power_platform_vault import (
    EncryptedPowerPlatformVault, PowerPlatformVaultError, VerifiedPrincipal,
)

_PLATFORM_SCOPES = (
    "https://api.powerplatform.com/EnvironmentManagement.Environments.Read "
    "https://api.powerplatform.com/PowerAutomate.Flows.Read "
    "https://api.powerplatform.com/ResourceQuery.Resources.Read offline_access"
)


def exchange_login_refresh(settings, refresh_token: str, *, client: httpx.Client | None = None) -> dict:
    """Exchange one same-app, validated-login refresh grant for PP read scopes.

    Granting consent is a Microsoft tenant/admin operation; a missing grant is
    a recoverable NOT_CONNECTED status and never a login failure.
    """
    try:
        tenant = str(UUID(settings.entra_tenant_id))
        client_id = str(UUID(settings.entra_client_id))
        secret = settings.entra_client_secret
        if not isinstance(secret, str) or not secret or not isinstance(refresh_token, str) or not 10 <= len(refresh_token) <= 50000:
            raise ValueError
    except (ValueError, AttributeError, TypeError):
        raise PowerPlatformVaultError("SSO_CREDENTIAL_UNAVAILABLE") from None
    endpoint = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    owned = client is None
    http = client or httpx.Client(timeout=httpx.Timeout(7, connect=3), trust_env=False, follow_redirects=False)
    try:
        try:
            result = http.post(endpoint, headers={"Accept": "application/json"}, data={
                "grant_type": "refresh_token", "client_id": client_id,
                "client_secret": secret, "refresh_token": refresh_token,
                "scope": _PLATFORM_SCOPES,
            })
        except httpx.RequestError:
            raise PowerPlatformVaultError("SSO_TOKEN_UNAVAILABLE") from None
    finally:
        if owned:
            http.close()
    if result.status_code in (400, 401, 403):
        raise PowerPlatformVaultError("SSO_CONSENT_OR_REAUTH_REQUIRED")
    if result.status_code != 200 or len(result.content) > 100000:
        raise PowerPlatformVaultError("SSO_TOKEN_UNAVAILABLE")
    try:
        token = result.json()
    except (ValueError, UnicodeError):
        raise PowerPlatformVaultError("SSO_TOKEN_UNAVAILABLE") from None
    if not isinstance(token, dict):
        raise PowerPlatformVaultError("SSO_TOKEN_UNAVAILABLE")
    return token


def bootstrap_owner_connection(settings, principal: VerifiedPrincipal, login_refresh_token: str) -> str:
    """No exceptions escape a normal login. Returns only safe diagnostic codes."""
    if not (getattr(settings, "power_platform_monitoring_enabled", False)
            and getattr(settings, "power_platform_refresh_enabled", False)
            and getattr(settings, "power_platform_sso_enabled", False)):
        return "DISABLED"
    if not isinstance(login_refresh_token, str) or not 10 <= len(login_refresh_token) <= 50000:
        return "NO_LOGIN_REFRESH_GRANT"
    try:
        vault = EncryptedPowerPlatformVault.from_settings(settings)
        if vault.status(principal)["connected"]:
            return "ALREADY_CONNECTED"
        token = exchange_login_refresh(settings, login_refresh_token)
        vault.save(principal, token)
        return "CONNECTED"
    except PowerPlatformVaultError as exc:
        # Whitelist only static internal codes; never return exception details.
        if exc.code in ("SSO_CONSENT_OR_REAUTH_REQUIRED", "SSO_TOKEN_UNAVAILABLE",
                        "REFRESH_TOKEN_REQUIRED", "VAULT_UNAVAILABLE", "INVALID_TOKEN_RESPONSE"):
            return exc.code
        return "SSO_NOT_AVAILABLE"
    except Exception:
        return "SSO_NOT_AVAILABLE"
