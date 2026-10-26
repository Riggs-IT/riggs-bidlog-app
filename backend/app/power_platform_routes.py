"""Owner-only, opt-in Power Platform monitoring routes for Riggs Administration.

The feature is DISABLED BY DEFAULT and independent of RiggsDataHub, Cognito,
SharePoint and the bridge. Power Platform access is a separate delegated OAuth
resource from the existing Bid Log/Data API login. No flow mutation endpoint.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

from .auth import CurrentUser, require_administration_owner
from .power_automate_monitoring import PowerPlatformReadClient, PowerPlatformReadError
from .power_platform_vault import (
    EncryptedPowerPlatformVault, PowerPlatformVaultError, VerifiedPrincipal,
)


def _deny(detail: str, status: int = 503) -> None:
    raise HTTPException(status_code=status, detail=detail)


def _principal(user: CurrentUser) -> VerifiedPrincipal:
    return VerifiedPrincipal(
        eid=user.eid, entra_oid=user.entra_object_id, tenant_id=user.tenant_id
    )


def _vault(settings):
    try:
        return EncryptedPowerPlatformVault.from_settings(settings)
    except PowerPlatformVaultError as exc:
        _deny(exc.code)


def _connection_html(success: bool) -> HTMLResponse:
    # Static, script-free, with zero auth details rendered. No tokens in URL.
    title = "Power Automate connected" if success else "Power Automate connection failed"
    guidance = (
        "Return to Administration and select Check connection to load your flows."
        if success else "Return to Administration and retry the connection."
    )
    return HTMLResponse(
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<title>Riggs Power Automate connection</title></head><body>"
        f"<h2>{title}</h2><p>{guidance}</p></body></html>",
        headers={"Cache-Control": "private, no-store"},
    )


def create_power_platform_router(*, oauth, settings) -> APIRouter:
    """Register only narrow, hardcoded Microsoft read routes and OAuth callback."""
    router = APIRouter(prefix="/api/admin/power-platform", tags=["Administration"])

    def enabled():
        if not settings.power_platform_monitoring_enabled:
            _deny("power_platform_monitoring_disabled", 404)
        if (
            settings.auth_mode != "entra" or not settings.entra_configured
            or not settings.power_platform_redirect_uri
            or not settings.power_platform_token_key
        ):
            _deny("power_platform_monitoring_not_configured")

    def token_for(user: CurrentUser) -> str:
        enabled()
        try:
            access = _vault(settings).access_token(_principal(user))
        except PowerPlatformVaultError as exc:
            _deny(exc.code)
        if not access:
            _deny("power_platform_reconnect_required", 409)
        return access

    @router.get("/status")
    def status(current_user: CurrentUser = Depends(require_administration_owner)):
        if not settings.power_platform_monitoring_enabled:
            return JSONResponse({"enabled": False}, headers={"Cache-Control": "private, no-store"})
        enabled()
        try:
            info = _vault(settings).status(_principal(current_user))
        except PowerPlatformVaultError as exc:
            _deny(exc.code)
        return JSONResponse(
            {"enabled": True, **info, "accessScope": "SIGNED_IN_USER_ONLY"},
            headers={"Cache-Control": "private, no-store"},
        )

    @router.get("/connect", include_in_schema=False)
    async def connect(
        request: Request, current_user: CurrentUser = Depends(require_administration_owner),
    ):
        enabled()
        # Fail BEFORE sending the user to Microsoft if storage is unavailable.
        _vault(settings)
        request.session["power_platform_connect_intent"] = {
            "eid": current_user.eid,
            "oid": current_user.entra_object_id,
            "tid": current_user.tenant_id,
        }
        try:
            return await oauth.power_platform.authorize_redirect(
                request, settings.power_platform_redirect_uri, prompt="select_account",
            )
        except Exception:
            request.session.pop("power_platform_connect_intent", None)
            return _connection_html(False)

    @router.get("/callback", include_in_schema=False)
    async def callback(
        request: Request, current_user: CurrentUser = Depends(require_administration_owner),
    ):
        enabled()
        intent = request.session.pop("power_platform_connect_intent", None)
        if not isinstance(intent, dict) or (
            intent.get("oid"), intent.get("tid"), intent.get("eid")
        ) != (current_user.entra_object_id, current_user.tenant_id, current_user.eid):
            return _connection_html(False)
        try:
            result = await oauth.power_platform.authorize_access_token(request)
            userinfo = result.get("userinfo")
            if not hasattr(userinfo, "get"):
                raise ValueError("missing_identity")
            identity_oid = str(UUID(str(userinfo.get("oid"))))
            identity_tenant = str(UUID(str(userinfo.get("tid"))))
            if (identity_oid, identity_tenant) != (
                current_user.entra_object_id, current_user.tenant_id,
            ):
                raise ValueError("identity_mismatch")
            # NEVER store returned refresh_token or pass tokens to the browser.
            # The access token is encrypted in Firestore and expires <= 1 hour.
            _vault(settings).save(_principal(current_user), result)
        except Exception:
            # OAuth/HTTP/vault errors never disclose tokens, OIDs or raw bodies.
            return _connection_html(False)
        return _connection_html(True)

    def _read(user: CurrentUser, operation, *args):
        access = token_for(user)
        try:
            with PowerPlatformReadClient(delegated_access_token=access) as client:
                return JSONResponse(
                    operation(client, *args), headers={"Cache-Control": "private, no-store"}
                )
        except PowerPlatformReadError as exc:
            _deny(exc.code, 422)

    @router.get("/environments")
    def environments(user: CurrentUser = Depends(require_administration_owner)):
        return _read(user, lambda client: client.list_environments())

    @router.get("/environments/{environment_id}/flows")
    def flows(environment_id: str, user: CurrentUser = Depends(require_administration_owner)):
        return _read(user, lambda client, env: client.list_flows(env), environment_id)

    @router.get("/environments/{environment_id}/flows/{workflow_id}/runs")
    def runs(
        environment_id: str, workflow_id: str,
        user: CurrentUser = Depends(require_administration_owner),
    ):
        return _read(user, lambda client, env, workflow: client.list_runs(env, workflow),
                     environment_id, workflow_id)

    @router.post("/disconnect")
    def disconnect(
        request: Request, user: CurrentUser = Depends(require_administration_owner),
    ):
        enabled()
        # Custom same-origin header prevents a simple cross-site form POST.
        if request.headers.get("X-Riggs-PowerPlatform-Action") != "disconnect":
            _deny("invalid_power_platform_action", 403)
        try:
            _vault(settings).disconnect(_principal(user))
        except PowerPlatformVaultError as exc:
            _deny(exc.code)
        return JSONResponse(
            {"disconnected": True}, headers={"Cache-Control": "private, no-store"},
        )

    return router
