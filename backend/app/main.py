from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

from authlib.integrations.starlette_client import (
    OAuth,
    OAuthError,
)
from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Path as FastAPIPath,
    Request,
)
from fastapi.responses import (
    FileResponse,
    JSONResponse,
    RedirectResponse,
)
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import (
    SessionMiddleware,
)

from .auth import (
    CurrentUser,
    get_current_user,
    resolve_entra_user,
)
from .config import get_settings
from .data_api import (
    DataAPIConfigurationError,
    DataAPIEdgeRejected,
    DataAPIInvalidResponse,
    DataAPIRequestRejected,
    DataAPIResourceNotFound,
    DataAPIServiceAuthRejected,
    DataAPISQLCapacityUnavailable,
    DataAPISQLUnavailable,
    DataAPIUnavailable,
    check_data_api_ready,
    get_active_bid_dashboard,
    get_active_bid_monthly,
    get_active_bid_projected_billings,
    get_current_project_monthly,
    get_current_projected_billings,
    get_current_projects_monthly_bulk,
    get_completed_project_monthly,
    get_completed_projects,
    get_project_close_accountability,
    get_pm_forecast_policy,
    get_current_project_pm_forecast,
    get_current_project_pm_forecast_history,
    get_current_project_pm_forecast_version,
    save_current_project_pm_forecast,
)


settings = get_settings()

SESSION_COOKIE_NAME = "riggs_bid_log_session"

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
)


app.add_middleware(
    SessionMiddleware,
    secret_key=(
        settings.session_secret
        or
        "development-only-riggs-bid-log-session-placeholder"
    ),
    session_cookie=SESSION_COOKIE_NAME,
    max_age=settings.session_max_age_seconds,
    same_site="lax",
    https_only=settings.session_cookie_secure,
)


oauth = OAuth()

oauth.register(
    name="entra",
    client_id=settings.entra_client_id,
    client_secret=settings.entra_client_secret,
    server_metadata_url=settings.entra_metadata_url,
    client_kwargs={
        "scope":
            "openid profile email",
        "code_challenge_method":
            "S256",
    },
)


_AUTH_ERROR_CODES = {
    "microsoft_sign_in_failed",
    "microsoft_identity_missing",
    "bid_log_user_not_authorized",
    "bid_log_identity_conflict",
    "data_api_cloudflare_access_rejected",
    "data_api_bid_log_service_auth_rejected",
    "sql_capacity_unavailable",
    "sql_unavailable",
    "data_api_unavailable",
    "data_api_not_configured",
    "invalid_data_api_response",
    "entra_not_configured",
}


def _auth_error_redirect(
    detail: str,
) -> RedirectResponse:
    safe_detail = (
        detail
        if detail in _AUTH_ERROR_CODES
        else "data_api_unavailable"
    )

    return RedirectResponse(
        url=f"/?auth_error={safe_detail}",
        status_code=303,
    )


@app.middleware("http")
async def security_headers(
    request: Request,
    call_next,
):
    response = await call_next(
        request
    )

    response.headers[
        "X-Content-Type-Options"
    ] = "nosniff"

    response.headers[
        "X-Frame-Options"
    ] = "DENY"

    response.headers[
        "Referrer-Policy"
    ] = "same-origin"

    response.headers[
        "Permissions-Policy"
    ] = (
        "camera=(), microphone=(), "
        "geolocation=()"
    )

    response.headers[
        "Content-Security-Policy"
    ] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "font-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )

    request_path = request.url.path

    if request_path.startswith(
        "/api/"
    ):
        response.headers[
            "Cache-Control"
        ] = (
            "no-store, private, "
            "max-age=0"
        )

        response.headers[
            "Pragma"
        ] = "no-cache"

        response.headers[
            "Expires"
        ] = "0"

    elif request_path.startswith(
        "/assets/"
    ):
        response.headers[
            "Cache-Control"
        ] = (
            "public, max-age=31536000, "
            "immutable"
        )

    if settings.is_production_runtime:
        response.headers[
            "Strict-Transport-Security"
        ] = (
            "max-age=31536000; "
            "includeSubDomains"
        )

    return response


def _safe_return_path(
    value: str | None,
) -> str:

    if (
        value
        and value.startswith("/")
        and not value.startswith("//")
    ):
        return value

    return "/"


def _raise_projected_billings_error(
    exc: Exception,
) -> None:

    if isinstance(
        exc,
        DataAPIEdgeRejected,
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "data_api_cloudflare_access_rejected"
            ),
        ) from exc

    if isinstance(
        exc,
        DataAPIServiceAuthRejected,
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "data_api_bid_log_service_auth_rejected"
            ),
        ) from exc

    if isinstance(
        exc,
        DataAPISQLCapacityUnavailable,
    ):
        raise HTTPException(
            status_code=503,
            detail="sql_capacity_unavailable",
        ) from exc

    if isinstance(
        exc,
        DataAPISQLUnavailable,
    ):
        raise HTTPException(
            status_code=503,
            detail="sql_unavailable",
        ) from exc

    if isinstance(
        exc,
        DataAPIConfigurationError,
    ):
        raise HTTPException(
            status_code=503,
            detail="data_api_not_configured",
        ) from exc

    if isinstance(
        exc,
        DataAPIResourceNotFound,
    ):
        raise HTTPException(
            status_code=404,
            detail="projected_billing_resource_not_found",
        ) from exc

    if isinstance(
        exc,
        DataAPIInvalidResponse,
    ):
        raise HTTPException(
            status_code=502,
            detail="invalid_data_api_response",
        ) from exc

    if isinstance(
        exc,
        DataAPIUnavailable,
    ):
        raise HTTPException(
            status_code=503,
            detail="data_api_unavailable",
        ) from exc

    raise exc


def _browser_request_id(
    request: Request,
) -> str:
    raw = (
        request.headers
        .get(
            "X-Request-ID",
            "",
        )
        .strip()
    )

    if not raw:
        return str(
            uuid4()
        )

    try:
        return str(
            UUID(
                raw
            )
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="invalid_request_id",
        ) from exc


def _raise_pm_forecast_proxy_error(
    exc: Exception,
) -> None:
    if isinstance(
        exc,
        DataAPIRequestRejected,
    ):
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.detail,
        ) from exc

    _raise_projected_billings_error(
        exc
    )


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "application":
            settings.app_name,
        "version":
            settings.app_version,
        "authMode":
            settings.auth_mode,
    }


@app.get(
    "/api/auth/login",
    include_in_schema=False,
)
async def auth_login(
    request: Request,
    return_to: str | None = None,
):
    if settings.auth_mode == "dev":
        return RedirectResponse(
            _safe_return_path(
                return_to
            )
        )

    if not settings.entra_configured:
        request.session.clear()
        return _auth_error_redirect(
            "entra_not_configured"
        )

    return_path = _safe_return_path(
        return_to
    )

    # Start every Microsoft sign-in from a clean session.
    # Authlib stores OAuth state in the signed session cookie,
    # so stale/retried login attempts must not accumulate old
    # state and eventually produce an oversized/bad cookie.
    request.session.clear()

    request.session[
        "auth_return_to"
    ] = return_path

    return await (
        oauth.entra.authorize_redirect(
            request,
            settings.entra_redirect_uri,
        )
    )


@app.get(
    "/api/auth/callback",
    include_in_schema=False,
)
async def auth_callback(
    request: Request,
):
    if settings.auth_mode != "entra":
        return RedirectResponse("/")

    if not settings.entra_configured:
        request.session.clear()
        return _auth_error_redirect(
            "entra_not_configured"
        )

    try:
        token = await (
            oauth.entra.authorize_access_token(
                request
            )
        )

    except OAuthError:
        request.session.clear()

        return _auth_error_redirect(
            "microsoft_sign_in_failed"
        )

    userinfo = token.get(
        "userinfo"
    )

    if not userinfo:
        request.session.clear()

        return _auth_error_redirect(
            "microsoft_identity_missing"
        )

    identity = {
        key: userinfo.get(key)
        for key in (
            "oid",
            "tid",
            "sub",
            "preferred_username",
            "email",
            "upn",
            "name",
        )
        if userinfo.get(key)
        is not None
    }

    try:
        resolve_entra_user(
            identity
        )

    except HTTPException as exc:
        request.session.clear()

        detail = (
            exc.detail
            if isinstance(
                exc.detail,
                str,
            )
            else "data_api_unavailable"
        )

        return _auth_error_redirect(
            detail
        )

    return_to = _safe_return_path(
        request.session.get(
            "auth_return_to"
        )
    )

    request.session.clear()

    request.session[
        "entra_identity"
    ] = identity

    return RedirectResponse(
        return_to,
        status_code=303,
    )


@app.get("/api/auth/me")
def auth_me(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    return (
        current_user
        .to_public_dict()
    )


@app.post("/api/auth/logout")
def auth_logout(
    request: Request,
):
    request.session.clear()

    response = JSONResponse(
        content={
            "status": "signed_out",
            "authMode":
                settings.auth_mode,
        }
    )

    # Explicitly expire the browser session cookie.
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="lax",
    )

    return response


@app.get("/api/platform/status")
def platform_status(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    if (
        current_user.app_role
        .strip()
        .upper()
        != "ADMIN"
    ):
        raise HTTPException(
            status_code=403,
            detail="bid_log_admin_required",
        )

    try:
        ready = check_data_api_ready()

    except DataAPIEdgeRejected as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "data_api_cloudflare_access_rejected"
            ),
        ) from exc

    except DataAPISQLCapacityUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail="sql_capacity_unavailable",
        ) from exc

    except DataAPISQLUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail="sql_unavailable",
        ) from exc

    except DataAPIConfigurationError as exc:
        raise HTTPException(
            status_code=503,
            detail="data_api_not_configured",
        ) from exc

    except DataAPIInvalidResponse as exc:
        raise HTTPException(
            status_code=502,
            detail="invalid_data_api_response",
        ) from exc

    except DataAPIUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail="data_api_unavailable",
        ) from exc

    return {
        "status": "ok",
        "user":
            current_user.to_public_dict(),
        "dataApi": {
            "status":
                ready.get("status"),
            "sql":
                ready.get("sql"),
            "database":
                ready.get("database"),
        },
    }


@app.get(
    "/api/projected-billings/current-projects"
)
def projected_billings_current_projects(
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return get_current_projected_billings()

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


@app.get(
    "/api/projected-billings/current-projects/monthly"
)
def projected_billings_current_projects_monthly_bulk(
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return get_current_projects_monthly_bulk()

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


@app.get(
    (
        "/api/projected-billings/"
        "current-projects/"
        "{job_list_id}/monthly"
    )
)
def projected_billings_current_project_monthly(
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return get_current_project_monthly(
            job_list_id
        )

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


@app.get(
    "/api/projected-billings/active-bids"
)
def projected_billings_active_bids(
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return get_active_bid_projected_billings()

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


@app.get(
    "/api/projected-billings/active-bids/dashboard"
)
def projected_billings_active_bid_dashboard(
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return get_active_bid_dashboard()

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


@app.get(
    (
        "/api/projected-billings/"
        "active-bids/"
        "{sharepoint_item_id}/monthly"
    )
)
def projected_billings_active_bid_monthly(
    sharepoint_item_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return get_active_bid_monthly(
            sharepoint_item_id
        )

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


# ============================================================
# PM / OPERATIONS FORECAST
# ============================================================

@app.get(
    "/api/pm-forecast/policy"
)
def pm_forecast_policy(
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return get_pm_forecast_policy()

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )


@app.get(
    "/api/current-projects/{job_list_id}/pm-forecast"
)
def current_project_pm_forecast(
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return get_current_project_pm_forecast(
            job_list_id
        )

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )


@app.get(
    (
        "/api/current-projects/"
        "{job_list_id}/pm-forecast/history"
    )
)
def current_project_pm_forecast_history(
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return (
            get_current_project_pm_forecast_history(
                job_list_id
            )
        )

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )


@app.get(
    (
        "/api/current-projects/"
        "{job_list_id}/pm-forecast/history/"
        "{forecast_version_id}"
    )
)
def current_project_pm_forecast_version(
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    forecast_version_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return (
            get_current_project_pm_forecast_version(
                job_list_id,
                forecast_version_id,
            )
        )

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )


@app.post(
    "/api/current-projects/{job_list_id}/pm-forecast"
)
async def save_current_project_pm_forecast_proxy(
    request: Request,
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        payload = await request.json()

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="invalid_json_body",
        ) from exc


    if not isinstance(
        payload,
        dict,
    ):
        raise HTTPException(
            status_code=400,
            detail="invalid_pm_forecast_payload",
        )


    role = (
        current_user.app_role
        .strip()
        .upper()
    )

    if role not in {
        "ADMIN",
        "OPERATIONS",
    }:
        raise HTTPException(
            status_code=403,
            detail="bid_log_pm_forecast_user_not_authorized",
        )


    try:
        return save_current_project_pm_forecast(
            job_list_id,
            payload,
            actor_eid=current_user.eid,
            request_id=_browser_request_id(
                request
            ),
        )

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )


@app.get(
    "/api/completed-projects"
)
def completed_projects(
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return get_completed_projects()

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


@app.get(
    (
        "/api/completed-projects/"
        "{job_list_id}/monthly"
    )
)
def completed_project_monthly(
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return get_completed_project_monthly(
            job_list_id
        )

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


@app.get(
    "/api/project-accountability"
)
def project_accountability(
    _current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    try:
        return get_project_close_accountability()

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


FRONTEND_DIST = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "dist"
)

assets_dir = (
    FRONTEND_DIST
    / "assets"
)

if assets_dir.exists():
    app.mount(
        "/assets",
        StaticFiles(
            directory=assets_dir
        ),
        name="assets",
    )


@app.get(
    "/{full_path:path}",
    include_in_schema=False,
)
def frontend(
    full_path: str,
):
    if full_path.startswith(
        "api/"
    ):
        return JSONResponse(
            status_code=404,
            content={
                "detail":
                    "not_found"
            },
        )

    index_file = (
        FRONTEND_DIST
        / "index.html"
    )

    if not index_file.exists():
        raise HTTPException(
            status_code=503,
            detail="frontend_not_built",
        )

    response = FileResponse(
        index_file
    )

    # Never retain a stale SPA bootstrap across deployments.
    # Vite's hashed assets are cached separately under /assets/.
    response.headers[
        "Cache-Control"
    ] = "no-store, max-age=0"

    response.headers[
        "Pragma"
    ] = "no-cache"

    response.headers[
        "Expires"
    ] = "0"

    return response
