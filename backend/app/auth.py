from __future__ import annotations

from dataclasses import dataclass
from time import time
from typing import Annotated
from uuid import UUID

from fastapi import (
    Depends,
    HTTPException,
    Request,
    status,
)

from .config import get_settings
from .data_api import (
    BidLogAccessUser,
    DataAPIConfigurationError,
    DataAPIEdgeRejected,
    DataAPIIdentityConflict,
    DataAPIInvalidResponse,
    DataAPIServiceAuthRejected,
    DataAPISQLCapacityUnavailable,
    DataAPISQLUnavailable,
    DataAPIUnavailable,
    DataAPIUserNotFound,
    resolve_bid_log_user,
)


settings = get_settings()


@dataclass(frozen=True)
class CurrentUser:
    eid: int
    it_user_id: int
    display_name: str
    app_role: str
    microsoft_username: str | None
    entra_object_id: str
    tenant_id: str

    def to_public_dict(self) -> dict:
        return {
            "eid": self.eid,
            "itUserId": self.it_user_id,
            "displayName": self.display_name,
            "appRole": self.app_role,
            "microsoftUsername":
                self.microsoft_username,
            "authMode":
                settings.auth_mode,
        }


def _from_access_user(
    access: BidLogAccessUser,
    *,
    tenant_id: str,
    microsoft_username: str | None,
) -> CurrentUser:

    return CurrentUser(
        eid=access.eid,
        it_user_id=access.it_user_id,
        display_name=access.display_name,
        app_role=access.app_role,
        microsoft_username=(
            microsoft_username
            or access.microsoft_username
        ),
        entra_object_id=access.entra_object_id,
        tenant_id=tenant_id,
    )


def _normalize_oid(value: str) -> str:
    try:
        return str(
            UUID(value.strip())
        )

    except (
        ValueError,
        TypeError,
        AttributeError,
    ) as exc:

        raise HTTPException(
            status_code=401,
            detail="invalid_entra_object_id",
        ) from exc


def _resolve_access_user(
    object_id: str,
) -> BidLogAccessUser:

    try:
        return resolve_bid_log_user(
            object_id
        )

    except DataAPIUserNotFound as exc:
        raise HTTPException(
            status_code=403,
            detail="bid_log_user_not_authorized",
        ) from exc

    except DataAPIIdentityConflict as exc:
        raise HTTPException(
            status_code=403,
            detail="bid_log_identity_conflict",
        ) from exc

    except DataAPIEdgeRejected as exc:
        raise HTTPException(
            status_code=503,
            detail="data_api_cloudflare_access_rejected",
        ) from exc

    except DataAPIServiceAuthRejected as exc:
        raise HTTPException(
            status_code=503,
            detail="data_api_bid_log_service_auth_rejected",
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
            detail="invalid_data_api_identity_response",
        ) from exc

    except DataAPIUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail="data_api_unavailable",
        ) from exc


def resolve_dev_user() -> CurrentUser:
    object_id = _normalize_oid(
        settings.dev_auth_entra_object_id
    )

    access = _resolve_access_user(
        object_id
    )

    return _from_access_user(
        access,
        tenant_id="development",
        microsoft_username=(
            access.microsoft_username
        ),
    )


def resolve_entra_user(
    identity: dict,
) -> CurrentUser:

    tenant_id = str(
        identity.get("tid")
        or ""
    ).strip()

    configured_tenant = (
        settings.entra_tenant_id
        .strip()
    )

    if (
        not tenant_id
        or not configured_tenant
        or tenant_id.lower()
        != configured_tenant.lower()
    ):
        raise HTTPException(
            status_code=403,
            detail="entra_tenant_not_authorized",
        )

    object_id = _normalize_oid(
        str(
            identity.get("oid")
            or ""
        )
    )

    microsoft_username = None

    for claim in (
        "preferred_username",
        "email",
        "upn",
    ):
        value = str(
            identity.get(claim)
            or ""
        ).strip()

        if value:
            microsoft_username = value
            break

    access = _resolve_access_user(
        object_id
    )

    return _from_access_user(
        access,
        tenant_id=tenant_id,
        microsoft_username=microsoft_username,
    )


def _enforce_idle_timeout(
    request: Request,
) -> None:

    now = int(time())

    last_activity = (
        request.session.get(
            "last_activity_at"
        )
    )

    if last_activity is not None:
        try:
            idle_seconds = (
                now
                - int(last_activity)
            )

        except (
            TypeError,
            ValueError,
        ):
            request.session.clear()

            raise HTTPException(
                status_code=401,
                detail="invalid_session",
            )

        if (
            idle_seconds
            > settings.session_idle_timeout_seconds
        ):
            request.session.clear()

            raise HTTPException(
                status_code=401,
                detail="session_inactive_timeout",
            )

    request.session[
        "last_activity_at"
    ] = now


def get_current_user(
    request: Request,
) -> CurrentUser:

    if settings.auth_mode == "dev":
        return resolve_dev_user()

    if not settings.entra_configured:
        raise HTTPException(
            status_code=503,
            detail="entra_not_configured",
        )

    identity = request.session.get(
        "entra_identity"
    )

    if not identity:
        raise HTTPException(
            status_code=401,
            detail="authentication_required",
        )

    if not isinstance(
        identity,
        dict,
    ):
        request.session.clear()

        raise HTTPException(
            status_code=401,
            detail="invalid_session",
        )

    _enforce_idle_timeout(
        request
    )

    return resolve_entra_user(
        identity
    )


AuthenticatedUser = Annotated[
    CurrentUser,
    Depends(get_current_user),
]
