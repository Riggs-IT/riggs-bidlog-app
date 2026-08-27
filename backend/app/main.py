from __future__ import annotations

from pathlib import Path

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
    DataAPIResourceNotFound,
    DataAPIServiceAuthRejected,
    DataAPISQLCapacityUnavailable,
    DataAPISQLUnavailable,
    DataAPIUnavailable,
    check_data_api_ready,
    get_active_bid_monthly,
    get_active_bid_projected_billings,
    get_current_project_monthly,
    get_current_projected_billings,
    get_project_close_accountability,
)


settings = get_settings()

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
    session_cookie="riggs_bid_log_session",
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

    if request.url.path.startswith(
        "/api/"
    ):
        response.headers[
            "Cache-Control"
        ] = "no-store"

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
        raise HTTPException(
            status_code=503,
            detail="entra_not_configured",
        )

    request.session[
        "auth_return_to"
    ] = _safe_return_path(
        return_to
    )

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
        raise HTTPException(
            status_code=503,
            detail="entra_not_configured",
        )

    try:
        token = await (
            oauth.entra.authorize_access_token(
                request
            )
        )

    except OAuthError as exc:
        raise HTTPException(
            status_code=401,
            detail="microsoft_sign_in_failed",
        ) from exc

    userinfo = token.get(
        "userinfo"
    )

    if not userinfo:
        raise HTTPException(
            status_code=401,
            detail="microsoft_identity_missing",
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

    resolve_entra_user(
        identity
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
        return_to
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

    return {
        "status": "signed_out",
        "authMode":
            settings.auth_mode,
    }


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

    return FileResponse(
        index_file
    )
