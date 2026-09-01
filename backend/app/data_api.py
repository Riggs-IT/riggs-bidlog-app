from __future__ import annotations

import atexit
from dataclasses import dataclass
from uuid import UUID, uuid4

import httpx

from .config import get_settings


settings = get_settings()


class DataAPIError(Exception):
    pass


class DataAPIConfigurationError(DataAPIError):
    pass


class DataAPIEdgeRejected(DataAPIError):
    pass


class DataAPIServiceAuthRejected(DataAPIError):
    pass


class DataAPIUserNotFound(DataAPIError):
    pass


class DataAPIIdentityConflict(DataAPIError):
    pass


class DataAPIResourceNotFound(DataAPIError):
    pass


class DataAPISQLCapacityUnavailable(DataAPIError):
    pass


class DataAPISQLUnavailable(DataAPIError):
    pass


class DataAPIUnavailable(DataAPIError):
    pass


class DataAPIInvalidResponse(DataAPIError):
    pass


@dataclass(frozen=True)
class BidLogAccessUser:
    eid: int
    it_user_id: int
    display_name: str
    microsoft_username: str | None
    entra_object_id: str
    app_role: str


def _build_http_client() -> httpx.Client:
    timeout = httpx.Timeout(
        connect=settings.data_api_connect_timeout_seconds,
        read=settings.data_api_read_timeout_seconds,
        write=settings.data_api_read_timeout_seconds,
        pool=settings.data_api_connect_timeout_seconds,
    )

    limits = httpx.Limits(
        max_connections=20,
        max_keepalive_connections=10,
        keepalive_expiry=30.0,
    )

    return httpx.Client(
        base_url=(
            settings.data_api_base_url
            .strip()
            .rstrip("/")
        ),
        timeout=timeout,
        limits=limits,
        headers={
            "Accept": "application/json",
            "User-Agent":
                f"riggs-bid-log/{settings.app_version}",
        },
        follow_redirects=False,
    )


_http_client: httpx.Client | None = None


def _get_http_client() -> httpx.Client:
    global _http_client

    if not settings.data_api_base_configured:
        raise DataAPIConfigurationError(
            "Riggs Data API base URL is not configured."
        )

    if _http_client is None:
        _http_client = _build_http_client()

    return _http_client


def _close_http_client() -> None:
    global _http_client

    if _http_client is not None:
        _http_client.close()
        _http_client = None


atexit.register(_close_http_client)


def _request_headers(
    *,
    include_service_auth: bool,
) -> dict[str, str]:

    headers = {
        "X-Request-ID": str(uuid4()),
    }

    cf_id = (
        settings.data_api_cf_access_client_id
        .strip()
    )

    cf_secret = (
        settings.data_api_cf_access_client_secret
        .strip()
    )

    if cf_id or cf_secret:
        if not (cf_id and cf_secret):
            raise DataAPIConfigurationError(
                "Cloudflare Access credentials are "
                "partially configured."
            )

        headers[
            "CF-Access-Client-Id"
        ] = cf_id

        headers[
            "CF-Access-Client-Secret"
        ] = cf_secret

    if include_service_auth:
        token = (
            settings.data_api_client_token
            .strip()
        )

        if not token:
            raise DataAPIConfigurationError(
                "Bid Log Data API client token "
                "is not configured."
            )

        headers[
            "X-Riggs-Client-Token"
        ] = token

    return headers


def _detail(
    response: httpx.Response,
) -> str | None:

    try:
        payload = response.json()
    except ValueError:
        return None

    if not isinstance(payload, dict):
        return None

    value = payload.get("detail")

    return (
        str(value)
        if value is not None
        else None
    )


def _raise_common_failure(
    response: httpx.Response,
    *,
    operation: str,
) -> None:

    if response.status_code in {
        301,
        302,
        303,
        307,
        308,
        403,
    }:
        raise DataAPIEdgeRejected(
            f"Cloudflare Access rejected {operation}."
        )

    detail = _detail(response)

    if response.status_code == 401:
        if detail is None:
            raise DataAPIEdgeRejected(
                f"Cloudflare Access rejected {operation}."
            )

        raise DataAPIServiceAuthRejected(
            "Riggs Data API rejected Bid Log "
            f"service authentication during {operation}."
        )

    if response.status_code == 503:
        if detail == "sql_capacity_unavailable":
            raise DataAPISQLCapacityUnavailable()

        if detail == "sql_unavailable":
            raise DataAPISQLUnavailable()

        raise DataAPIUnavailable(
            f"Riggs Data API returned HTTP 503 "
            f"during {operation}."
        )

    if response.status_code >= 500:
        raise DataAPIUnavailable(
            f"Riggs Data API returned HTTP "
            f"{response.status_code} during {operation}."
        )


def _json_object(
    response: httpx.Response,
    *,
    operation: str,
) -> dict:

    try:
        payload = response.json()
    except ValueError as exc:
        raise DataAPIInvalidResponse(
            f"Invalid JSON during {operation}."
        ) from exc

    if not isinstance(payload, dict):
        raise DataAPIInvalidResponse(
            f"Invalid response structure during {operation}."
        )

    return payload


def _json_object_list(
    response: httpx.Response,
    *,
    operation: str,
) -> list[dict]:

    try:
        payload = response.json()
    except ValueError as exc:
        raise DataAPIInvalidResponse(
            f"Invalid JSON during {operation}."
        ) from exc

    if not isinstance(payload, list):
        raise DataAPIInvalidResponse(
            f"Invalid response structure during {operation}."
        )

    if not all(
        isinstance(item, dict)
        for item in payload
    ):
        raise DataAPIInvalidResponse(
            f"Invalid item structure during {operation}."
        )

    return payload


def _get_service_response(
    path: str,
    *,
    operation: str,
    params: dict | None = None,
    resource_not_found: bool = False,
) -> httpx.Response:

    try:
        response = _get_http_client().get(
            path,
            params=params,
            headers=_request_headers(
                include_service_auth=True,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            f"Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            f"Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc

    if (
        resource_not_found
        and response.status_code == 404
    ):
        raise DataAPIResourceNotFound()

    _raise_common_failure(
        response,
        operation=operation,
    )

    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            f"Unexpected Riggs Data API response "
            f"during {operation}."
        )

    return response


def check_data_api_ready() -> dict:
    try:
        response = _get_http_client().get(
            "/ready",
            headers=_request_headers(
                include_service_auth=False,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API readiness request timed out."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API."
        ) from exc

    _raise_common_failure(
        response,
        operation="readiness check",
    )

    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected readiness response."
        )

    payload = _json_object(
        response,
        operation="readiness check",
    )

    if (
        payload.get("status") != "ok"
        or payload.get("sql") != "connected"
    ):
        raise DataAPIInvalidResponse(
            "Riggs Data API is not healthy."
        )

    return payload


def resolve_bid_log_user(
    entra_object_id: str,
) -> BidLogAccessUser:

    try:
        normalized_oid = str(
            UUID(entra_object_id)
        )

    except (
        ValueError,
        TypeError,
        AttributeError,
    ) as exc:

        raise DataAPIInvalidResponse(
            "Invalid Entra Object ID."
        ) from exc

    try:
        response = _get_http_client().post(
            "/v1/access/bid-log/resolve",
            json={
                "entraObjectId":
                    normalized_oid,
            },
            headers=_request_headers(
                include_service_auth=True,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Bid Log identity request timed out."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API."
        ) from exc

    if response.status_code == 404:
        raise DataAPIUserNotFound()

    if response.status_code == 409:
        raise DataAPIIdentityConflict()

    _raise_common_failure(
        response,
        operation="Bid Log identity resolution",
    )

    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Bid Log identity response."
        )

    payload = _json_object(
        response,
        operation="Bid Log identity resolution",
    )

    try:
        eid = int(payload["eid"])
        it_user_id = int(payload["itUserId"])

        display_name = str(
            payload["displayName"]
        ).strip()

        returned_oid = str(
            UUID(
                str(
                    payload[
                        "entraObjectId"
                    ]
                )
            )
        )

        app_role = str(
            payload["appRole"]
        ).strip().upper()

        username_value = (
            payload.get(
                "microsoftUsername"
            )
        )

        microsoft_username = (
            str(username_value).strip()
            if username_value
            else None
        )

    except (
        KeyError,
        TypeError,
        ValueError,
        AttributeError,
    ) as exc:

        raise DataAPIInvalidResponse(
            "Bid Log identity response has "
            "invalid required fields."
        ) from exc

    if (
        eid <= 0
        or it_user_id <= 0
        or not display_name
        or not app_role
    ):
        raise DataAPIInvalidResponse(
            "Bid Log identity response has "
            "invalid values."
        )

    if returned_oid != normalized_oid:
        raise DataAPIInvalidResponse(
            "Bid Log identity response returned "
            "a different Entra Object ID."
        )

    return BidLogAccessUser(
        eid=eid,
        it_user_id=it_user_id,
        display_name=display_name,
        microsoft_username=microsoft_username,
        entra_object_id=returned_oid,
        app_role=app_role,
    )


def get_current_projected_billings() -> list[dict]:
    operation = "Current Project projected billings"

    response = _get_service_response(
        "/v1/bid-log/current-projects",
        operation=operation,
    )

    return _json_object_list(
        response,
        operation=operation,
    )


def get_current_project_monthly(
    job_list_id: int,
) -> dict:

    operation = (
        "Current Project monthly projected billings"
    )

    response = _get_service_response(
        (
            "/v1/bid-log/current-projects/"
            f"{job_list_id}/monthly"
        ),
        operation=operation,
        resource_not_found=True,
    )

    payload = _json_object(
        response,
        operation=operation,
    )

    items = payload.get("items")

    if not isinstance(items, list):
        raise DataAPIInvalidResponse(
            "Current Project monthly response "
            "is missing its items list."
        )

    return payload


def get_active_bid_projected_billings() -> dict:
    operation = "Active Bid projected billings"

    response = _get_service_response(
        "/v1/bid-log/projected-billings",
        operation=operation,
        params={
            "limit": 500,
            "offset": 0,
        },
    )

    payload = _json_object(
        response,
        operation=operation,
    )

    items = payload.get("items")

    if not isinstance(items, list):
        raise DataAPIInvalidResponse(
            "Active Bid projected-billings response "
            "is missing its items list."
        )

    return payload


def get_active_bid_monthly(
    sharepoint_item_id: int,
) -> dict:

    operation = (
        "Active Bid monthly projected billings"
    )

    response = _get_service_response(
        (
            "/v1/bid-log/projected-billings/"
            f"{sharepoint_item_id}/monthly"
        ),
        operation=operation,
        resource_not_found=True,
    )

    payload = _json_object(
        response,
        operation=operation,
    )

    items = payload.get("items")

    if not isinstance(items, list):
        raise DataAPIInvalidResponse(
            "Active Bid monthly response "
            "is missing its items list."
        )

    return payload

def get_project_close_accountability() -> list[dict]:
    operation = "Project close accountability"

    response = _get_service_response(
        "/v1/bid-log/project-close-accountability",
        operation=operation,
    )

    return _json_object_list(
        response,
        operation=operation,
    )



def get_completed_projects() -> list[dict]:
    operation = "Completed Projects"

    response = _get_service_response(
        "/v1/bid-log/completed-projects",
        operation=operation,
    )

    return _json_object_list(
        response,
        operation=operation,
    )


def get_completed_project_monthly(
    job_list_id: int,
) -> dict:
    operation = "Completed Project monthly billings"

    response = _get_service_response(
        (
            "/v1/bid-log/completed-projects/"
            f"{job_list_id}/monthly"
        ),
        operation=operation,
        resource_not_found=True,
    )

    payload = _json_object(
        response,
        operation=operation,
    )

    items = payload.get(
        "items"
    )

    if not isinstance(
        items,
        list,
    ):
        raise DataAPIInvalidResponse(
            "Completed Project monthly response "
            "is missing its items list."
        )

    return payload
