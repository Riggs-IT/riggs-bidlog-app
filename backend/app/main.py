from __future__ import annotations

from pathlib import Path
from urllib.parse import urlencode, urlparse
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
    Query as FastAPIQuery,
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
    get_active_bid_detail,
    create_active_bid,
    get_active_bid_monthly,
    get_active_bid_projected_billings,
    get_active_bids,
    get_bid_log_outcome_bids,
    get_bid_log_outcome_detail,
    get_active_project_detail,
    get_active_project_cognito_detail,
    get_bid_log_general_contractors,
    create_bid_log_delegated_session,
    delete_bid_log_delegated_session,
    save_active_bid_projected_billing_settings,
    transition_active_bid_lifecycle,
    update_active_bid,
    update_bid_log_outcome,
    update_active_project,
    get_current_project_monthly,
    get_current_projected_billings,
    get_current_projects_monthly_bulk,
    get_current_project_originating_bid,
    get_current_project_change_orders,
    get_current_project_bid_candidates,
    link_current_project_originating_bid,
    get_completed_project_monthly,
    get_completed_projects,
    end_bid_log_usage_session,
    record_bid_log_usage_heartbeat,
    get_project_close_accountability,
    get_pm_forecast_policy,
    update_pm_forecast_policy,
    get_current_project_pm_forecast_policy,
    update_current_project_pm_forecast_policy,
    get_pm_forecast_attention,
    get_current_project_pm_forecast,
    get_current_project_pm_forecast_history,
    get_current_project_pm_forecast_version,
    save_current_project_pm_forecast,
    save_current_project_pm_forecast_admin_correction,
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
            settings.entra_oauth_scope,
        "code_challenge_method":
            "S256",
    },
)


_AUTH_ERROR_CODES = {
    "microsoft_sign_in_failed",
    "microsoft_identity_missing",
    "microsoft_data_api_token_missing",
    "delegated_identity_rejected",
    "bid_log_delegated_identity_mismatch",
    "delegated_auth_unavailable",
    "delegated_auth_configuration_unavailable",
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


def _clear_bid_log_auth_session(
    request: Request,
) -> tuple[str, int | None]:
    delegated_session_id = str(
        request.session.get(
            "delegated_session_id"
        )
        or ""
    ).strip()

    raw_actor_eid = request.session.get(
        "delegated_actor_eid"
    )

    try:
        actor_eid = int(
            raw_actor_eid
        )
    except (TypeError, ValueError):
        actor_eid = None

    request.session.clear()

    return (
        delegated_session_id,
        actor_eid,
    )


def _delete_delegated_session_best_effort(
    delegated_session_id: str,
    actor_eid: int | None,
) -> None:
    if (
        not delegated_session_id
        or actor_eid is None
    ):
        return

    try:
        delete_bid_log_delegated_session(
            delegated_session_id=
                delegated_session_id,
            actor_eid=actor_eid,
            request_id=str(uuid4()),
        )
    except Exception:
        # A bridge restart clears the process-local delegated
        # vault. Stale remote state must never prevent local
        # Bid Log sign-out.
        pass


def _expire_session_cookie(
    response,
) -> None:
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="lax",
    )


async def _entra_end_session_url() -> str | None:
    if settings.auth_mode != "entra":
        return None

    post_logout_redirect_uri = (
        settings
        .entra_post_logout_redirect_uri
        .strip()
    )

    if not post_logout_redirect_uri:
        return None

    try:
        metadata = await (
            oauth.entra.load_server_metadata()
        )
    except Exception:
        return None

    end_session_endpoint = str(
        metadata.get(
            "end_session_endpoint"
        )
        or ""
    ).strip()

    parsed_endpoint = urlparse(
        end_session_endpoint
    )

    if (
        parsed_endpoint.scheme != "https"
        or parsed_endpoint.netloc.lower()
        != "login.microsoftonline.com"
    ):
        return None

    return (
        end_session_endpoint
        + "?"
        + urlencode(
            {
                "post_logout_redirect_uri":
                    post_logout_redirect_uri,
            }
        )
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


def _raise_active_bid_proxy_error(
    exc: Exception,
) -> None:
    if isinstance(exc, DataAPIRequestRejected):
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.detail,
        ) from exc

    if isinstance(exc, DataAPIEdgeRejected):
        raise HTTPException(
            status_code=503,
            detail="data_api_cloudflare_access_rejected",
        ) from exc

    if isinstance(exc, DataAPIServiceAuthRejected):
        raise HTTPException(
            status_code=503,
            detail="data_api_bid_log_service_auth_rejected",
        ) from exc

    if isinstance(exc, DataAPISQLCapacityUnavailable):
        raise HTTPException(
            status_code=503,
            detail="sql_capacity_unavailable",
        ) from exc

    if isinstance(exc, DataAPISQLUnavailable):
        raise HTTPException(
            status_code=503,
            detail="sql_unavailable",
        ) from exc

    if isinstance(exc, DataAPIConfigurationError):
        raise HTTPException(
            status_code=503,
            detail="data_api_not_configured",
        ) from exc

    if isinstance(exc, DataAPIResourceNotFound):
        raise HTTPException(
            status_code=404,
            detail="active_bid_log_bid_not_found",
        ) from exc

    if isinstance(exc, DataAPIInvalidResponse):
        raise HTTPException(
            status_code=502,
            detail="invalid_data_api_response",
        ) from exc

    if isinstance(exc, DataAPIUnavailable):
        raise HTTPException(
            status_code=503,
            detail="data_api_unavailable",
        ) from exc

    raise exc



def _raise_active_project_proxy_error(
    exc: Exception,
) -> None:
    if isinstance(exc, DataAPIRequestRejected):
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.detail,
        ) from exc

    if isinstance(exc, DataAPIEdgeRejected):
        raise HTTPException(
            status_code=503,
            detail="data_api_cloudflare_access_rejected",
        ) from exc

    if isinstance(exc, DataAPIServiceAuthRejected):
        raise HTTPException(
            status_code=503,
            detail="data_api_bid_log_service_auth_rejected",
        ) from exc

    if isinstance(exc, DataAPISQLCapacityUnavailable):
        raise HTTPException(
            status_code=503,
            detail="sql_capacity_unavailable",
        ) from exc

    if isinstance(exc, DataAPISQLUnavailable):
        raise HTTPException(
            status_code=503,
            detail="sql_unavailable",
        ) from exc

    if isinstance(exc, DataAPIConfigurationError):
        raise HTTPException(
            status_code=503,
            detail="data_api_not_configured",
        ) from exc

    if isinstance(exc, DataAPIResourceNotFound):
        raise HTTPException(
            status_code=404,
            detail="active_project_not_found",
        ) from exc

    if isinstance(exc, DataAPIInvalidResponse):
        raise HTTPException(
            status_code=502,
            detail="invalid_data_api_response",
        ) from exc

    if isinstance(exc, DataAPIUnavailable):
        raise HTTPException(
            status_code=503,
            detail="data_api_unavailable",
        ) from exc

    raise exc

def _normalized_app_role(
    current_user: CurrentUser,
) -> str:
    return (
        str(current_user.app_role or "")
        .strip()
        .upper()
    )


def _normalized_employee_trade(
    current_user: CurrentUser,
) -> str:
    return (
        str(current_user.employee_trade or "")
        .strip()
        .upper()
    )


def _workspace_profile(
    current_user: CurrentUser,
) -> str:
    role = _normalized_app_role(
        current_user
    )

    if role == "ADMIN":
        return "ADMIN"

    if role == "VIEWER":
        return "VIEWER"

    if role == "OPERATIONS":
        if (
            _normalized_employee_trade(
                current_user
            )
            == "PM"
        ):
            return "PM"

        return "BID_LOG_ONLY"

    return "NONE"


def _workspace_capabilities(
    current_user: CurrentUser,
) -> dict[str, bool]:
    profile = _workspace_profile(
        current_user
    )

    return {
        "canViewProjectedBillings": (
            bool(
                current_user.can_edit_billing
            )
            or profile
            in {
                "ADMIN",
                "PM",
                "VIEWER",
            }
        ),

        "canViewBidLog":
            profile
            in {
                "ADMIN",
                "PM",
                "BID_LOG_ONLY",
                "VIEWER",
            },

        "canViewProjects":
            profile
            in {
                "ADMIN",
                "VIEWER",
            },

        "canViewCompletedBillings":
            profile
            in {
                "ADMIN",
                "VIEWER",
            },
    }


def _can_edit_bid_log(
    current_user: CurrentUser,
) -> bool:
    return (
        _normalized_app_role(
            current_user
        )
        in {
            "ADMIN",
            "OPERATIONS",
        }
    )


def _can_edit_current_project_projection(
    current_user: CurrentUser,
) -> bool:
    return (
        _workspace_profile(
            current_user
        )
        in {
            "ADMIN",
            "PM",
        }
    )


def _require_bid_log_editor(
    current_user: CurrentUser,
) -> None:
    if not _can_edit_bid_log(
        current_user
    ):
        raise HTTPException(
            status_code=403,
            detail="bid_log_user_not_authorized",
        )


def _require_projected_workspace_access(
    current_user: CurrentUser,
) -> None:
    if not _workspace_capabilities(
        current_user
    )["canViewProjectedBillings"]:
        raise HTTPException(
            status_code=403,
            detail=(
                "projected_billings_user_not_authorized"
            ),
        )


def _require_bid_log_workspace_access(
    current_user: CurrentUser,
) -> None:
    if not _workspace_capabilities(
        current_user
    )["canViewBidLog"]:
        raise HTTPException(
            status_code=403,
            detail="bid_log_user_not_authorized",
        )


def _require_projects_workspace_access(
    current_user: CurrentUser,
) -> None:
    if not _workspace_capabilities(
        current_user
    )["canViewProjects"]:
        raise HTTPException(
            status_code=403,
            detail="projects_user_not_authorized",
        )


def _require_completed_workspace_access(
    current_user: CurrentUser,
) -> None:
    if not _workspace_capabilities(
        current_user
    )["canViewCompletedBillings"]:
        raise HTTPException(
            status_code=403,
            detail=(
                "completed_billings_user_not_authorized"
            ),
        )


def _require_project_editor(
    current_user: CurrentUser,
) -> None:
    if (
        _normalized_app_role(
            current_user
        )
        != "ADMIN"
    ):
        raise HTTPException(
            status_code=403,
            detail="bid_log_admin_required",
        )


def _require_current_project_projection_editor(
    current_user: CurrentUser,
) -> None:
    if not current_user.can_edit_billing:
        raise HTTPException(
            status_code=403,
            detail=(
                "bid_log_pm_forecast_user_not_authorized"
            ),
        )


def _role_scoped_bid_log_payload(
    payload,
    current_user: CurrentUser,
):
    # Bid estimate Margin is editable business data for ADMIN and OPERATIONS.
    # This is intentionally separate from historical/projected margin analytics,
    # which remain ADMIN-only through _role_scoped_financial_payload.
    if _can_edit_bid_log(current_user):
        return payload

    return _redact_margin_fields(payload)


def _bid_log_delegated_session_for_write(
    request: Request,
    current_user: CurrentUser,
) -> str | None:
    """
    Return the opaque Data API delegated-session identifier
    established during Microsoft login.

    Local AUTH_MODE=dev has no real Microsoft delegated session,
    so it returns None rather than inventing one.
    """

    if (
        settings.auth_mode == "dev"
        or not settings.bid_log_delegated_writes_enabled
    ):
        return None

    session_id = str(
        request.session.get(
            "delegated_session_id"
        )
        or ""
    ).strip()

    raw_actor_eid = (
        request.session.get(
            "delegated_actor_eid"
        )
    )

    try:
        session_actor_eid = int(
            raw_actor_eid
        )

    except (
        TypeError,
        ValueError,
    ):
        session_actor_eid = None

    if not session_id:
        raise HTTPException(
            status_code=401,
            detail="delegated_session_required",
        )

    if (
        session_actor_eid is None
        or session_actor_eid
        != current_user.eid
    ):
        raise HTTPException(
            status_code=403,
            detail="delegated_session_actor_mismatch",
        )

    return session_id


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
            prompt="select_account",
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
        current_user = (
            resolve_entra_user(
                identity
            )
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

    delegated_session_id = None

    if settings.bid_log_delegated_auth_enabled:
        microsoft_access_token = str(
            token.get(
                "access_token"
            )
            or ""
        ).strip()

        if not microsoft_access_token:
            request.session.clear()

            return _auth_error_redirect(
                "microsoft_data_api_token_missing"
            )

        try:
            delegated_session = (
                create_bid_log_delegated_session(
                    user_assertion=
                        microsoft_access_token,

                    actor_eid=
                        current_user.eid,

                    request_id=
                        str(
                            uuid4()
                        ),
                )
            )

        except DataAPIRequestRejected as exc:
            request.session.clear()

            return _auth_error_redirect(
                exc.detail
            )

        except DataAPIEdgeRejected:
            request.session.clear()

            return _auth_error_redirect(
                "data_api_cloudflare_access_rejected"
            )

        except DataAPIServiceAuthRejected:
            request.session.clear()

            return _auth_error_redirect(
                "data_api_bid_log_service_auth_rejected"
            )

        except DataAPISQLCapacityUnavailable:
            request.session.clear()

            return _auth_error_redirect(
                "sql_capacity_unavailable"
            )

        except DataAPISQLUnavailable:
            request.session.clear()

            return _auth_error_redirect(
                "sql_unavailable"
            )

        except DataAPIConfigurationError:
            request.session.clear()

            return _auth_error_redirect(
                "delegated_auth_configuration_unavailable"
            )

        except DataAPIInvalidResponse:
            request.session.clear()

            return _auth_error_redirect(
                "invalid_data_api_response"
            )

        except DataAPIUnavailable:
            request.session.clear()

            return _auth_error_redirect(
                "delegated_auth_unavailable"
            )

        delegated_session_id = str(
            delegated_session.get(
                "sessionId"
            )
            or ""
        ).strip()

        if not delegated_session_id:
            request.session.clear()

            return _auth_error_redirect(
                "invalid_data_api_response"
            )

    return_to = _safe_return_path(
        request.session.get(
            "auth_return_to"
        )
    )

    # The Microsoft bearer token intentionally dies here.
    # Only the opaque Data API delegated-session identifier
    # survives into the browser's signed application session.
    request.session.clear()

    request.session[
        "entra_identity"
    ] = identity

    request.session[
        "session_revision"
    ] = settings.session_revision

    if delegated_session_id:
        request.session[
            "delegated_session_id"
        ] = delegated_session_id

        request.session[
            "delegated_actor_eid"
        ] = current_user.eid

    return RedirectResponse(
        return_to,
        status_code=303,
    )


@app.get("/api/auth/me")
def auth_me(
    request: Request,

    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    payload = (
        current_user
        .to_public_dict()
    )

    payload[
        "workspaceProfile"
    ] = _workspace_profile(
        current_user
    )

    payload[
        "capabilities"
    ] = _workspace_capabilities(
        current_user
    )

    payload[
        "delegatedAccessReady"
    ] = bool(
        request.session.get(
            "delegated_session_id"
        )
    )

    return payload


@app.post(
    "/api/usage/heartbeat"
)
async def bid_log_usage_heartbeat_proxy(
    request: Request,

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
            detail="invalid_usage_payload",
        )


    try:
        usage_session_id = str(
            UUID(
                str(
                    payload.get(
                        "usageSessionId"
                    )
                )
            )
        )

    except (
        ValueError,
        TypeError,
        AttributeError,
    ) as exc:
        raise HTTPException(
            status_code=400,
            detail="invalid_usage_session_id",
        ) from exc


    current_page = payload.get(
        "currentPage"
    )

    if current_page is not None:
        if (
            not isinstance(
                current_page,
                str,
            )
            or len(current_page) > 100
        ):
            raise HTTPException(
                status_code=400,
                detail="invalid_usage_current_page",
            )


    client_active = payload.get(
        "clientActive",
        True,
    )

    if not isinstance(
        client_active,
        bool,
    ):
        raise HTTPException(
            status_code=400,
            detail="invalid_usage_active_state",
        )


    try:
        return record_bid_log_usage_heartbeat(
            usage_session_id=
                usage_session_id,

            actor_eid=
                current_user.eid,

            it_user_id=
                current_user.it_user_id,

            display_name=
                current_user.display_name,

            microsoft_username=
                current_user.microsoft_username,

            app_role=
                current_user.app_role,

            current_page=
                current_page,

            client_active=
                client_active,

            request_id=
                _browser_request_id(
                    request
                ),
        )

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )



@app.post(
    "/api/usage/end"
)
async def bid_log_usage_end_proxy(
    request: Request,

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
            detail="invalid_usage_payload",
        )


    try:
        usage_session_id = str(
            UUID(
                str(
                    payload.get(
                        "usageSessionId"
                    )
                )
            )
        )

    except (
        ValueError,
        TypeError,
        AttributeError,
    ) as exc:
        raise HTTPException(
            status_code=400,
            detail="invalid_usage_session_id",
        ) from exc


    end_reason = payload.get(
        "endReason"
    )

    if end_reason not in {
        "manual_logout",
        "inactivity_timeout",
    }:
        raise HTTPException(
            status_code=400,
            detail="invalid_usage_end_reason",
        )


    try:
        return end_bid_log_usage_session(
            usage_session_id=
                usage_session_id,

            actor_eid=
                current_user.eid,

            end_reason=
                end_reason,

            request_id=
                _browser_request_id(
                    request
                ),
        )

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )



@app.post("/api/auth/logout")
async def auth_logout(
    request: Request,
):
    (
        delegated_session_id,
        actor_eid,
    ) = _clear_bid_log_auth_session(
        request
    )

    _delete_delegated_session_best_effort(
        delegated_session_id,
        actor_eid,
    )

    microsoft_logout_url = (
        await _entra_end_session_url()
    )

    response = JSONResponse(
        content={
            "status": "signed_out",
            "authMode":
                settings.auth_mode,
            "logoutUrl": (
                microsoft_logout_url
                or "/?signed_out=1"
            ),
        }
    )

    _expire_session_cookie(response)

    return response


@app.get(
    "/api/auth/signed-out",
    include_in_schema=False,
)
def auth_signed_out(
    request: Request,
):
    request.session.clear()

    response = RedirectResponse(
        url="/?signed_out=1",
        status_code=303,
    )

    _expire_session_cookie(response)

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


def _can_view_margin(
    current_user: CurrentUser,
) -> bool:
    return (
        str(
            current_user.app_role
            or ""
        ).upper()
        == "ADMIN"
    )


def _redact_margin_fields(value):
    if isinstance(value, list):
        return [
            _redact_margin_fields(item)
            for item in value
        ]

    if isinstance(value, dict):
        return {
            key: _redact_margin_fields(item)
            for key, item in value.items()
            if "margin" not in str(key).lower()
        }

    return value


def _role_scoped_financial_payload(
    payload,
    current_user: CurrentUser,
):
    if _can_view_margin(current_user):
        return payload

    return _redact_margin_fields(payload)


@app.get(
    "/api/projected-billings/current-projects"
)
def projected_billings_current_projects(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_current_projected_billings(),
            current_user,
        )

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


@app.get(
    "/api/projected-billings/current-projects/monthly"
)
def projected_billings_current_projects_monthly_bulk(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_current_projects_monthly_bulk(),
            current_user,
        )

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
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_current_project_monthly(
                job_list_id
            ),
            current_user,
        )

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )



# ============================================================
# ACTIVE PROJECTS WORKSPACE
# ============================================================

@app.get(
    "/api/active-projects"
)
def active_projects_list_proxy(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projects_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_current_projected_billings(),
            current_user,
        )

    except Exception as exc:
        _raise_active_project_proxy_error(exc)


@app.get(
    "/api/projects/completed-directory"
)
def completed_project_directory_proxy(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projects_workspace_access(current_user)

    """Return completed projects as project-directory metadata only.

    Keep completed-project financial/accountability fields out of the
    general Projects workspace. The full completed-project endpoint remains
    available to its dedicated reporting view.
    """
    try:
        rows = get_completed_projects()

        return [
            {
                "jobListId": row.get("jobListId"),
                "jobNumber": row.get("jobNumber"),
                "jobName": row.get("jobName"),
                "generalContractors": row.get("generalContractor"),
                "pm": row.get("projectManager"),
                "apm": row.get("apm"),
                "pe": row.get("projectEngineer"),
                "superintendent": row.get("superintendent"),
                "projectType": row.get("projectType"),
                "purpose": row.get("purpose"),
                "effectiveStartDate": row.get("resolvedStartDate"),
                "projectedCompletionDate": row.get("resolvedEndDate"),
                "originalContractAmount": row.get("contractAmount"),
                "projectCompleted": True,
                "dateCompleted": (
                    row.get("operationsCompletionDate")
                    or row.get("resolvedEndDate")
                ),
            }
            for row in rows
        ]

    except Exception as exc:
        _raise_active_project_proxy_error(exc)


@app.get(
    "/api/active-projects/{job_list_id}"
)
def active_project_detail_proxy(
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projects_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_active_project_detail(
                job_list_id
            ),
            current_user,
        )

    except Exception as exc:
        _raise_active_project_proxy_error(exc)


@app.get(
    "/api/active-projects/{job_list_id}/cognito-detail"
)
def active_project_cognito_detail_proxy(
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projects_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_active_project_cognito_detail(
                job_list_id
            ),
            current_user,
        )

    except Exception as exc:
        _raise_active_project_proxy_error(exc)


@app.put(
    "/api/active-projects/{job_list_id}"
)
async def active_project_update_proxy(
    request: Request,
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projects_workspace_access(current_user)
    _require_project_editor(current_user)

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="invalid_json_body",
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="invalid_active_project_update",
        )

    try:
        # Browser-supplied actor identity is never trusted. The current
        # authenticated Bid Log session supplies the EID server-to-server.
        return update_active_project(
            job_list_id,
            payload,
            actor_eid=current_user.eid,
            request_id=_browser_request_id(request),
        )

    except Exception as exc:
        _raise_active_project_proxy_error(exc)

# ============================================================
# ACTIVE BID LOG WORKSPACE
# ============================================================

@app.get(
    "/api/bid-log/reference/general-contractors"
)
def bid_log_general_contractors_proxy(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_log_workspace_access(current_user)
    _require_bid_log_editor(current_user)

    try:
        return get_bid_log_general_contractors()

    except Exception as exc:
        _raise_active_bid_proxy_error(exc)


@app.get(
    "/api/bid-log/active"
)
def bid_log_active_list_proxy(
    status: str | None = FastAPIQuery(default=None),
    search: str | None = FastAPIQuery(default=None),
    limit: int = FastAPIQuery(default=500, ge=1, le=500),
    offset: int = FastAPIQuery(default=0, ge=0),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_log_workspace_access(current_user)

    try:
        return _role_scoped_bid_log_payload(
            get_active_bids(
                bid_status=status,
                search=search,
                limit=limit,
                offset=offset,
            ),
            current_user,
        )

    except Exception as exc:
        _raise_active_bid_proxy_error(exc)


@app.post(
    "/api/bid-log/active",
    status_code=201,
)
async def bid_log_active_create_proxy(
    request: Request,
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_log_workspace_access(current_user)
    _require_bid_log_editor(current_user)

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="invalid_json_body",
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="invalid_active_bid_create",
        )

    delegated_session_id = (
        _bid_log_delegated_session_for_write(
            request,
            current_user,
        )
    )

    try:
        return _role_scoped_bid_log_payload(
            create_active_bid(
                payload,
                actor_eid=current_user.eid,
                request_id=_browser_request_id(request),
                delegated_session_id=
                    delegated_session_id,
            ),
            current_user,
        )

    except Exception as exc:
        _raise_active_bid_proxy_error(exc)


@app.get(
    "/api/bid-log/active/{sharepoint_item_id}"
)
def bid_log_active_detail_proxy(
    sharepoint_item_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_log_workspace_access(current_user)

    try:
        return _role_scoped_bid_log_payload(
            get_active_bid_detail(sharepoint_item_id),
            current_user,
        )

    except Exception as exc:
        _raise_active_bid_proxy_error(exc)


@app.patch(
    "/api/bid-log/active/{sharepoint_item_id}"
)
async def bid_log_active_update_proxy(
    request: Request,
    sharepoint_item_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_log_workspace_access(current_user)
    _require_bid_log_editor(current_user)

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="invalid_json_body",
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="invalid_active_bid_update",
        )

    delegated_session_id = (
        _bid_log_delegated_session_for_write(
            request,
            current_user,
        )
    )

    try:
        # Browser-supplied actor identity is never trusted. The current
        # authenticated session supplies both the EID and opaque delegated
        # session identifier sent server-to-server.
        return _role_scoped_bid_log_payload(
            update_active_bid(
                sharepoint_item_id,
                payload,
                actor_eid=current_user.eid,
                request_id=_browser_request_id(request),
                delegated_session_id=
                    delegated_session_id,
            ),
            current_user,
        )

    except Exception as exc:
        _raise_active_bid_proxy_error(exc)


@app.post(
    "/api/bid-log/active/{sharepoint_item_id}/lifecycle"
)
async def bid_log_active_lifecycle_proxy(
    request: Request,
    sharepoint_item_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_log_workspace_access(current_user)
    _require_bid_log_editor(current_user)

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="invalid_json_body",
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="invalid_active_bid_lifecycle",
        )

    delegated_session_id = (
        _bid_log_delegated_session_for_write(
            request,
            current_user,
        )
    )

    try:
        return _role_scoped_bid_log_payload(
            transition_active_bid_lifecycle(
                sharepoint_item_id,
                payload,
                actor_eid=current_user.eid,
                request_id=_browser_request_id(request),
                delegated_session_id=
                    delegated_session_id,
            ),
            current_user,
        )

    except Exception as exc:
        _raise_active_bid_proxy_error(exc)


# ============================================================
# DECIDED / OUTCOME BID LOG WORKSPACE
# ============================================================

@app.get(
    "/api/bid-log/outcomes"
)
def bid_log_outcome_list_proxy(
    status: str = FastAPIQuery(..., min_length=1, max_length=100),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_log_workspace_access(current_user)

    try:
        return _role_scoped_bid_log_payload(
            get_bid_log_outcome_bids(
                bid_status=status,
            ),
            current_user,
        )

    except Exception as exc:
        _raise_active_bid_proxy_error(exc)


@app.get(
    "/api/bid-log/outcomes/{original_bid_log_id}"
)
def bid_log_outcome_detail_proxy(
    original_bid_log_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    status: str = FastAPIQuery(..., min_length=1, max_length=100),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_log_workspace_access(current_user)

    try:
        return _role_scoped_bid_log_payload(
            get_bid_log_outcome_detail(
                original_bid_log_id,
                bid_status=status,
            ),
            current_user,
        )

    except Exception as exc:
        _raise_active_bid_proxy_error(exc)


@app.patch(
    "/api/bid-log/outcomes/{original_bid_log_id}"
)
async def bid_log_outcome_update_proxy(
    request: Request,
    original_bid_log_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_log_workspace_access(current_user)
    _require_bid_log_editor(current_user)

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="invalid_json_body",
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="invalid_bid_log_outcome_update",
        )

    delegated_session_id = (
        _bid_log_delegated_session_for_write(
            request,
            current_user,
        )
    )

    try:
        return _role_scoped_bid_log_payload(
            update_bid_log_outcome(
                original_bid_log_id,
                payload,
                actor_eid=current_user.eid,
                request_id=_browser_request_id(request),
                delegated_session_id=
                    delegated_session_id,
            ),
            current_user,
        )

    except Exception as exc:
        _raise_active_bid_proxy_error(exc)


@app.get(
    "/api/projected-billings/active-bids"
)
def projected_billings_active_bids(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_active_bid_projected_billings(),
            current_user,
        )

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


@app.get(
    "/api/projected-billings/active-bids/dashboard"
)
def projected_billings_active_bid_dashboard(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_active_bid_dashboard(),
            current_user,
        )

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
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_log_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_active_bid_monthly(
                sharepoint_item_id
            ),
            current_user,
        )

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


@app.put(
    (
        "/api/projected-billings/"
        "active-bids/"
        "{sharepoint_item_id}/settings"
    )
)
async def update_projected_billings_active_bid_settings(
    request: Request,
    sharepoint_item_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_log_workspace_access(current_user)
    _require_bid_log_editor(current_user)

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
            detail="invalid_bid_log_forecast_settings",
        )

    try:
        return _role_scoped_financial_payload(
            save_active_bid_projected_billing_settings(
                sharepoint_item_id,
                payload,
                # Browser-supplied actor identity is ignored.
                # The authenticated server session owns the EID.
                actor_eid=current_user.eid,
                request_id=_browser_request_id(
                    request
                ),
            ),
            current_user,
        )

    except DataAPIRequestRejected as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.detail,
        ) from exc

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
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

    try:
        return get_pm_forecast_policy()

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )


@app.put(
    "/api/pm-forecast/policy"
)
async def update_pm_forecast_policy_proxy(
    request: Request,

    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    role = (
        current_user.app_role
        .strip()
        .upper()
    )

    if role != "ADMIN":
        raise HTTPException(
            status_code=403,
            detail="bid_log_admin_required",
        )


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
            detail="invalid_pm_forecast_policy_payload",
        )


    value = payload.get(
        "requireBaselineTotalMatch"
    )

    if not isinstance(
        value,
        bool,
    ):
        raise HTTPException(
            status_code=400,
            detail="invalid_pm_forecast_policy_payload",
        )


    try:
        return update_pm_forecast_policy(
            {
                "requireBaselineTotalMatch":
                    value,
            },

            # Browser-supplied actor headers are ignored.
            # The authenticated session owns actor identity.
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
    "/api/pm-forecast/attention"
)
def pm_forecast_attention(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

    try:
        return get_pm_forecast_attention(
            current_user.eid
        )

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )


@app.get(
    (
        "/api/current-projects/"
        "{job_list_id}/pm-forecast/policy"
    )
)
def current_project_pm_forecast_policy(
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

    try:
        return get_current_project_pm_forecast_policy(
            job_list_id
        )

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )


@app.put(
    (
        "/api/current-projects/"
        "{job_list_id}/pm-forecast/policy"
    )
)
async def update_current_project_pm_forecast_policy_proxy(
    request: Request,

    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),

    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    role = (
        current_user.app_role
        .strip()
        .upper()
    )

    if role != "ADMIN":
        raise HTTPException(
            status_code=403,
            detail="bid_log_admin_required",
        )


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
            detail="invalid_pm_forecast_policy_payload",
        )


    value = payload.get(
        "requireBaselineTotalMatch"
    )

    if not isinstance(
        value,
        bool,
    ):
        raise HTTPException(
            status_code=400,
            detail="invalid_pm_forecast_policy_payload",
        )


    try:
        return update_current_project_pm_forecast_policy(
            job_list_id,

            {
                "requireBaselineTotalMatch":
                    value,
            },

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
    "/api/current-projects/{job_list_id}/pm-forecast"
)
def current_project_pm_forecast(
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

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
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

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
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

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


    _require_current_project_projection_editor(
        current_user
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


@app.post(
    (
        "/api/current-projects/"
        "{job_list_id}/pm-forecast/admin-correction"
    )
)
async def save_current_project_pm_forecast_admin_correction_proxy(
    request: Request,

    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),

    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    role = (
        current_user.app_role
        .strip()
        .upper()
    )

    if role != "ADMIN":
        raise HTTPException(
            status_code=403,
            detail="bid_log_admin_required",
        )


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
            detail=(
                "invalid_pm_forecast_"
                "admin_correction_payload"
            ),
        )


    correction_reason = payload.get(
        "correctionReason"
    )

    if (
        not isinstance(
            correction_reason,
            str,
        )
        or not correction_reason.strip()
    ):
        raise HTTPException(
            status_code=400,
            detail="admin_correction_reason_required",
        )


    expected_version = payload.get(
        "expectedLatestForecastVersionId"
    )

    if (
        not isinstance(
            expected_version,
            int,
        )
        or isinstance(
            expected_version,
            bool,
        )
        or expected_version < 1
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "invalid_pm_forecast_"
                "admin_correction_payload"
            ),
        )


    forwarded_payload = dict(
        payload
    )

    forwarded_payload[
        "correctionReason"
    ] = correction_reason.strip()


    try:
        return (
            save_current_project_pm_forecast_admin_correction(
                job_list_id,
                forwarded_payload,

                actor_eid=current_user.eid,

                request_id=_browser_request_id(
                    request
                ),
            )
        )

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )


# ============================================================
# ORIGINATING BID / CURRENT PROJECT LINK
# ============================================================

def _require_bid_link_editor(
    current_user: CurrentUser,
) -> None:
    if not _can_edit_current_project_projection(
        current_user
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "bid_log_bid_link_user_not_authorized"
            ),
        )


@app.get(
    (
        "/api/current-projects/"
        "{job_list_id}/originating-bid"
    )
)
def current_project_originating_bid_proxy(
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

    try:
        return (
            get_current_project_originating_bid(
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
        "{job_list_id}/change-orders"
    )
)
def current_project_change_orders_proxy(
    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_projected_workspace_access(current_user)

    try:
        return (
            get_current_project_change_orders(
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
        "{job_list_id}/bid-candidates"
    )
)
def current_project_bid_candidates_proxy(
    request: Request,

    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),

    search: str | None = FastAPIQuery(
        default=None,
        max_length=100,
    ),

    limit: int = FastAPIQuery(
        default=15,
        ge=1,
        le=50,
    ),

    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_link_editor(
        current_user
    )

    try:
        return (
            get_current_project_bid_candidates(
                job_list_id,

                actor_eid=
                    current_user.eid,

                request_id=
                    _browser_request_id(
                        request
                    ),

                search=search,
                limit=limit,
            )
        )

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )


@app.post(
    (
        "/api/current-projects/"
        "{job_list_id}/originating-bid"
    )
)
async def link_current_project_originating_bid_proxy(
    request: Request,

    job_list_id: int = FastAPIPath(
        ...,
        ge=1,
    ),

    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_bid_link_editor(
        current_user
    )


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
            detail=(
                "invalid_originating_bid_link_payload"
            ),
        )


    if (
        set(
            payload.keys()
        )
        != {
            "originalBidLogId"
        }
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "invalid_originating_bid_link_payload"
            ),
        )


    original_bid_log_id = payload.get(
        "originalBidLogId"
    )


    if (
        not isinstance(
            original_bid_log_id,
            int,
        )
        or isinstance(
            original_bid_log_id,
            bool,
        )
        or original_bid_log_id <= 0
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "invalid_originating_bid_link_payload"
            ),
        )


    try:
        return (
            link_current_project_originating_bid(
                job_list_id,

                original_bid_log_id,

                # Trusted actor identity comes only from the
                # authenticated application session.
                actor_eid=
                    current_user.eid,

                request_id=
                    _browser_request_id(
                        request
                    ),
            )
        )

    except Exception as exc:
        _raise_pm_forecast_proxy_error(
            exc
        )



@app.get(
    "/api/completed-projects"
)
def completed_projects(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_completed_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_completed_projects(),
            current_user,
        )

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
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_completed_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_completed_project_monthly(
                job_list_id
            ),
            current_user,
        )

    except Exception as exc:
        _raise_projected_billings_error(
            exc
        )


@app.get(
    "/api/project-accountability"
)
def project_accountability(
    current_user: CurrentUser = Depends(
        get_current_user
    ),
):
    _require_completed_workspace_access(current_user)

    try:
        return _role_scoped_financial_payload(
            get_project_close_accountability(),
            current_user,
        )

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
    "/gong-favicon.png",
    include_in_schema=False,
)
def gong_favicon():
    favicon_file = (
        FRONTEND_DIST
        / "gong-favicon.png"
    )

    if not favicon_file.exists():
        raise HTTPException(
            status_code=404,
            detail="favicon_not_found",
        )

    response = FileResponse(
        favicon_file,
        media_type="image/png",
    )

    response.headers[
        "Cache-Control"
    ] = "public, max-age=86400"

    return response


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
