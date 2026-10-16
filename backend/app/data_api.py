from __future__ import annotations

import json
import atexit
from dataclasses import dataclass
import logging
from time import perf_counter
from typing import Callable
from uuid import UUID, uuid4

import httpx

from .config import get_settings


settings = get_settings()

# Deliberately log only a controlled operation name, timing, status, and
# exception type. Never log actor IDs, bearer tokens, Cloudflare headers,
# cookies, request JSON, or whole URLs/query strings.
_UPSTREAM_LOG = logging.getLogger("riggs_bid_log.upstream")
_SLOW_UPSTREAM_MS = 1000.0


def _timed_data_api_request(
    operation: str,
    send: Callable[[], httpx.Response],
) -> httpx.Response:
    started = perf_counter()
    try:
        response = send()
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        elapsed_ms = (perf_counter() - started) * 1000.0
        _UPSTREAM_LOG.warning(
            "data_api_upstream operation=%s outcome=%s exception=%s elapsed_ms=%.1f",
            operation,
            "timeout" if isinstance(exc, httpx.TimeoutException) else "transport_error",
            type(exc).__name__,
            elapsed_ms,
        )
        raise

    elapsed_ms = (perf_counter() - started) * 1000.0
    if elapsed_ms >= _SLOW_UPSTREAM_MS or response.status_code >= 500:
        _UPSTREAM_LOG.warning(
            "data_api_upstream operation=%s outcome=response http_status=%s elapsed_ms=%.1f",
            operation,
            response.status_code,
            elapsed_ms,
        )
    return response


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


class DataAPISharedRefreshRateLimited(DataAPIError):
    def __init__(self, retry_after_seconds: int):
        self.retry_after_seconds = retry_after_seconds
        super().__init__("Shared dashboard cache refresh is rate limited.")


class DataAPIInvalidResponse(DataAPIError):
    pass


class DataAPIRequestRejected(DataAPIError):
    def __init__(
        self,
        status_code: int,
        detail: str,
    ):
        super().__init__(
            f"Riggs Data API rejected request: "
            f"HTTP {status_code} {detail}"
        )

        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class BidLogAccessUser:
    eid: int
    it_user_id: int
    display_name: str
    microsoft_username: str | None
    entra_object_id: str
    app_role: str
    employee_trade: str | None
    can_edit_billing: bool
    billing_access_source: str | None


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
    request_id: str | None = None,
    actor_eid: int | None = None,
    user_bearer_token: str | None = None,
    delegated_session_id: str | None = None,
) -> dict[str, str]:

    headers = {
        "X-Request-ID": (
            request_id
            or str(uuid4())
        ),
    }

    if actor_eid is not None:
        headers[
            "X-Riggs-User-EID"
        ] = str(
            actor_eid
        )

    if user_bearer_token is not None:
        bearer_token = (
            user_bearer_token
            .strip()
        )

        if not bearer_token:
            raise DataAPIConfigurationError(
                "Delegated Microsoft user token is empty."
            )

        headers[
            "Authorization"
        ] = (
            f"Bearer {bearer_token}"
        )

    if delegated_session_id is not None:
        session_id = (
            delegated_session_id
            .strip()
        )

        if not session_id:
            raise DataAPIConfigurationError(
                "Delegated Data API session ID is empty."
            )

        headers[
            "X-Riggs-Delegated-Session"
        ] = session_id

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
    timeout: httpx.Timeout | None = None,
) -> httpx.Response:

    try:
        response = _timed_data_api_request(
            operation,
            lambda: _get_http_client().get(
                path,
                params=params,
                headers=_request_headers(
                    include_service_auth=True,
                ),
                **({"timeout": timeout} if timeout is not None else {}),
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
        response = _timed_data_api_request(
            "Bid Log identity resolution",
            lambda: _get_http_client().post(
                "/v1/access/bid-log/resolve",
                json={
                    "entraObjectId": normalized_oid,
                },
                headers=_request_headers(
                    include_service_auth=True,
                ),
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

        employee_trade_value = (
            payload.get(
                "employeeTrade"
            )
        )

        employee_trade = (
            str(employee_trade_value)
            .strip()
            .upper()
            if employee_trade_value
            else None
        )

        can_edit_billing_value = (
            payload["canEditBilling"]
        )

        if not isinstance(
            can_edit_billing_value,
            bool,
        ):
            raise TypeError(
                "canEditBilling must be boolean"
            )

        can_edit_billing = (
            can_edit_billing_value
        )

        billing_access_source_value = (
            payload.get(
                "billingAccessSource"
            )
        )

        billing_access_source = (
            str(
                billing_access_source_value
            )
            .strip()
            .upper()
            if billing_access_source_value
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
        employee_trade=employee_trade,
        can_edit_billing=can_edit_billing,
        billing_access_source=(
            billing_access_source
        ),
    )


def create_bid_log_delegated_session(
    *,
    user_assertion: str,
    actor_eid: int,
    request_id: str,
) -> dict:
    operation = (
        "Bid Log delegated session creation"
    )

    assertion = str(
        user_assertion
        or ""
    ).strip()

    if not assertion:
        raise DataAPIConfigurationError(
            "Microsoft Data API user token is missing."
        )

    try:
        response = _get_http_client().post(
            "/v1/bid-log/delegated/session",
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
                user_bearer_token=assertion,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API delegated-session request "
            "timed out."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            "during delegated-session creation."
        ) from exc

    detail = _detail(
        response
    )

    if response.status_code in {
        401,
        403,
    } and detail in {
        "delegated_identity_rejected",
        "bid_log_delegated_identity_mismatch",
        "missing_delegated_user_token",
    }:
        raise DataAPIRequestRejected(
            response.status_code,
            detail,
        )

    _raise_common_failure(
        response,
        operation=operation,
    )

    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            "during delegated-session creation."
        )

    payload = _json_object(
        response,
        operation=operation,
    )

    session_id = str(
        payload.get(
            "sessionId"
        )
        or ""
    ).strip()

    if not session_id:
        raise DataAPIInvalidResponse(
            "Delegated-session response did not "
            "contain a session ID."
        )

    return payload


def delete_bid_log_delegated_session(
    *,
    delegated_session_id: str,
    actor_eid: int,
    request_id: str,
) -> bool:
    operation = (
        "Bid Log delegated session deletion"
    )

    session_id = str(
        delegated_session_id
        or ""
    ).strip()

    if not session_id:
        return False

    try:
        response = _get_http_client().delete(
            "/v1/bid-log/delegated/session",
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
                delegated_session_id=session_id,
            ),
        )

    except (
        httpx.TimeoutException,
        httpx.RequestError,
    ):
        # Logout must still succeed if the bridge is unreachable.
        return False

    if response.status_code in {
        401,
        403,
    }:
        return False

    try:
        _raise_common_failure(
            response,
            operation=operation,
        )

    except DataAPIError:
        return False

    if response.status_code != 200:
        return False

    try:
        payload = _json_object(
            response,
            operation=operation,
        )

    except DataAPIError:
        return False

    return bool(
        payload.get(
            "deleted"
        )
    )


def get_bid_log_pm_badges() -> dict:
    """Small badge-only lookup; available without Projected Billings access."""
    operation = "Bid Log PM badge directory"
    response = _get_service_response(
        "/v1/bid-log/reference/pm-badges", operation=operation,
    )
    payload = _json_object(response, operation=operation)
    if not isinstance(payload.get("items"), list):
        raise DataAPIInvalidResponse("Invalid PM badge directory response")
    for item in payload["items"]:
        if not isinstance(item, dict) or not isinstance(item.get("pm"), str):
            raise DataAPIInvalidResponse("Invalid PM badge identity")
    return payload


def get_bid_log_general_contractors() -> dict:
    operation = "Bid Log general contractor reference"

    response = _get_service_response(
        "/v1/bid-log/reference/general-contractors",
        operation=operation,
    )

    payload = _json_object(
        response,
        operation=operation,
    )

    items = payload.get("items")

    if not isinstance(items, list):
        raise DataAPIInvalidResponse(
            "General contractor reference response is missing its items list."
        )

    if payload.get("total") != len(items):
        raise DataAPIInvalidResponse(
            "General contractor reference response has an invalid total."
        )

    return payload


def _fetch_active_bids(
    *,
    bid_status: str | None = None,
    search: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict:
    operation = "Active Bid Log list"

    params: dict[str, object] = {
        "limit": limit,
        "offset": offset,
    }

    if bid_status is not None and bid_status.strip():
        params["status"] = bid_status.strip()

    if search is not None and search.strip():
        params["search"] = search.strip()

    response = _get_service_response(
        "/v1/bid-log/active",
        operation=operation,
        params=params,
    )

    payload = _json_object(
        response,
        operation=operation,
    )

    if not isinstance(payload.get("items"), list):
        raise DataAPIInvalidResponse(
            "Active Bid Log response is missing its items list."
        )

    return payload


def get_active_bid_detail(
    sharepoint_item_id: int,
) -> dict:
    operation = "Active Bid Log detail"

    response = _get_service_response(
        f"/v1/bid-log/active/{sharepoint_item_id}",
        operation=operation,
        resource_not_found=True,
    )

    return _json_object(
        response,
        operation=operation,
    )


def create_active_bid(
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
    delegated_session_id: str | None = None,
) -> dict:
    operation = "Create Active Bid Log bid"

    try:
        response = _get_http_client().post(
            "/v1/bid-log/active",
            json=payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
                delegated_session_id=
                    delegated_session_id,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc

    if response.status_code in {
        401,
        400,
        403,
        422,
    }:
        detail = _detail(response)

        if detail is None:
            detail = (
                "invalid_active_bid_create"
                if response.status_code in {400, 422}
                else "active_bid_create_rejected"
            )

        raise DataAPIRequestRejected(
            response.status_code,
            detail,
        )

    _raise_common_failure(
        response,
        operation=operation,
    )

    if response.status_code != 201:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )

    result = _json_object(
        response,
        operation=operation,
    )

    _dashboard_cache_invalidate_prefix(
        "active_bid_list:",
    )
    _dashboard_cache_invalidate_key(
        "active_bid_dashboard",
    )

    return result


def update_active_bid(
    sharepoint_item_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
    delegated_session_id: str | None = None,
) -> dict:
    operation = "Update Active Bid Log bid"

    try:
        response = _get_http_client().patch(
            f"/v1/bid-log/active/{sharepoint_item_id}",
            json=payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
                delegated_session_id=
                    delegated_session_id,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc

    if response.status_code in {
        401,
        400,
        403,
        404,
        409,
        422,
    }:
        detail = _detail(response)

        if detail is None:
            detail = (
                "invalid_active_bid_update"
                if response.status_code == 422
                else "active_bid_update_rejected"
            )

        raise DataAPIRequestRejected(
            response.status_code,
            detail,
        )

    _raise_common_failure(
        response,
        operation=operation,
    )

    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )

    result = _json_object(
        response,
        operation=operation,
    )

    # Active Bid edits can change values shown in both the
    # Bid Log list and the projected-billings dashboard. Keep
    # detail reads uncached so a newly opened editor always
    # receives a fresh ETag.
    _dashboard_cache_invalidate_prefix(
        "active_bid_list:",
    )
    _dashboard_cache_invalidate_key(
        "active_bid_dashboard",
    )

    return result




def merge_active_bids(
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
    delegated_session_id: str | None = None,
) -> dict:
    """Dedicated, bounded multi-SharePoint merge; ordinary edits reject Merged."""
    operation = 'Merge Active Bid Log bids'
    # Normal reads use a short timeout. Merge is a series of sequential Graph
    # writes and MUST NOT time out after only five seconds.
    timeout = httpx.Timeout(
        connect=settings.data_api_connect_timeout_seconds,
        read=90.0,
        write=settings.data_api_read_timeout_seconds,
        pool=settings.data_api_connect_timeout_seconds,
    )
    try:
        response = _get_http_client().post(
            '/v1/bid-log/active/merge',
            json=payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
                delegated_session_id=delegated_session_id,
            ),
            timeout=timeout,
        )
    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable('Merge request timed out; review bids before retrying.') from exc
    except httpx.RequestError as exc:
        raise DataAPIUnavailable('Merge outcome uncertain; review bids before retrying.') from exc

    if response.status_code in {400, 401, 403, 404, 409, 422, 502}:
        try:
            raw = response.json().get('detail')
        except (ValueError, AttributeError):
            raw = None
        detail = (
            json.dumps(raw, separators=(',', ':'))
            if isinstance(raw, dict)
            else str(raw or 'active_bid_merge_rejected')
        )
        raise DataAPIRequestRejected(response.status_code, detail)

    _raise_common_failure(response, operation=operation)
    if response.status_code != 200:
        raise DataAPIInvalidResponse('Unexpected Data API response while merging bids.')
    result = _json_object(response, operation=operation)
    _dashboard_cache_invalidate_prefix('active_bid_list:')
    _dashboard_cache_invalidate_key('active_bid_dashboard')
    return result



def transition_active_bid_lifecycle(
    sharepoint_item_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
    delegated_session_id: str | None = None,
) -> dict:
    operation = "Process Active Bid Log lifecycle action"

    try:
        response = _get_http_client().post(
            f"/v1/bid-log/active/{sharepoint_item_id}/lifecycle",
            json=payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
                delegated_session_id=
                    delegated_session_id,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc

    if response.status_code in {
        400,
        401,
        403,
        404,
        409,
        422,
        502,
    }:
        detail = None

        try:
            response_payload = response.json()
        except ValueError:
            response_payload = None

        if isinstance(response_payload, dict):
            raw_detail = response_payload.get("detail")

            if isinstance(raw_detail, dict):
                detail = json.dumps(
                    raw_detail,
                    separators=(",", ":"),
                )
            elif raw_detail is not None:
                detail = str(raw_detail)

        if detail is not None:
            raise DataAPIRequestRejected(
                response.status_code,
                detail,
            )

    _raise_common_failure(
        response,
        operation=operation,
    )

    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )

    result = _json_object(
        response,
        operation=operation,
    )

    _dashboard_cache_invalidate_prefix(
        "active_bid_list:",
    )
    _dashboard_cache_invalidate_key(
        "active_bid_dashboard",
    )

    return result



def get_bid_log_outcome_bids(
    *,
    bid_status: str,
) -> dict:
    """Return the full decided-bid population for one lifecycle status."""

    operation = f"Bid Log {bid_status} list"
    page_size = 500
    offset = 0
    items: list[dict] = []
    total: int | None = None

    while total is None or offset < total:
        response = _get_service_response(
            "/v1/bid-log/bids",
            operation=operation,
            params={
                "status": bid_status,
                "limit": page_size,
                "offset": offset,
            },
        )

        payload = _json_object(
            response,
            operation=operation,
        )

        page_items = payload.get("items")

        if not isinstance(page_items, list):
            raise DataAPIInvalidResponse(
                "Historical Bid Log response is missing its items list."
            )

        try:
            page_total = int(payload.get("total"))
        except (TypeError, ValueError) as exc:
            raise DataAPIInvalidResponse(
                "Historical Bid Log response has an invalid total."
            ) from exc

        if page_total < 0:
            raise DataAPIInvalidResponse(
                "Historical Bid Log response has an invalid total."
            )

        if total is None:
            total = page_total
        elif page_total != total:
            raise DataAPIInvalidResponse(
                "Historical Bid Log total changed while paging."
            )

        items.extend(page_items)

        if not page_items:
            break

        offset += len(page_items)

        if len(page_items) < page_size:
            break

    resolved_total = total or 0

    return {
        "items": items,
        "total": resolved_total,
        "limit": len(items),
        "offset": 0,
    }


def get_bid_log_outcome_detail(
    original_bid_log_id: int,
    *,
    bid_status: str,
) -> dict:
    operation = f"Bid Log {bid_status} outcome detail"

    response = _get_service_response(
        f"/v1/bid-log/outcomes/{original_bid_log_id}",
        operation=operation,
        params={"status": bid_status},
        resource_not_found=True,
    )

    return _json_object(
        response,
        operation=operation,
    )


def update_bid_log_outcome(
    original_bid_log_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
    delegated_session_id: str | None = None,
) -> dict:
    operation = "Update decided Bid Log bid"

    try:
        response = _get_http_client().patch(
            f"/v1/bid-log/outcomes/{original_bid_log_id}",
            json=payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
                delegated_session_id=
                    delegated_session_id,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc

    if response.status_code in {
        401,
        400,
        403,
        404,
        409,
        422,
    }:
        detail = _detail(response)

        if detail is None:
            detail = (
                "invalid_bid_log_outcome_update"
                if response.status_code in {400, 422}
                else "bid_log_outcome_update_rejected"
            )

        raise DataAPIRequestRejected(
            response.status_code,
            detail,
        )

    _raise_common_failure(
        response,
        operation=operation,
    )

    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )

    return _json_object(
        response,
        operation=operation,
    )


def get_active_project_detail(
    job_list_id: int,
) -> dict:
    operation = "Active Project detail"

    response = _get_service_response(
        f"/v1/jobs/{job_list_id}/detail",
        operation=operation,
        resource_not_found=True,
    )

    return _json_object(
        response,
        operation=operation,
    )


def get_active_project_cognito_detail(
    job_list_id: int,
) -> dict:
    operation = "Active Project Cognito detail"

    response = _get_service_response(
        f"/v1/jobs/{job_list_id}/cognito-detail",
        operation=operation,
        resource_not_found=True,
    )

    return _json_object(
        response,
        operation=operation,
    )


def get_active_project_resource_schedule(
    job_list_id: int,
) -> dict:
    operation = "Active Project resource schedule"

    response = _get_service_response(
        f"/v1/jobs/{job_list_id}/resource-schedule",
        operation=operation,
        resource_not_found=True,
    )

    return _json_object(
        response,
        operation=operation,
    )


def _active_project_write_request(
    method: str,
    path: str,
    *,
    operation: str,
    actor_eid: int,
    request_id: str,
    payload: dict | None = None,
) -> dict:
    try:
        response = _get_http_client().request(
            method,
            path,
            json=payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request failed "
            f"during {operation}."
        ) from exc

    if response.status_code in {
        400,
        403,
        404,
        409,
        422,
    }:
        detail = _detail(response)

        if detail is None:
            detail = "active_project_staffing_write_rejected"

        raise DataAPIRequestRejected(
            response.status_code,
            detail,
        )

    _raise_common_failure(
        response,
        operation=operation,
    )

    return _json_object(
        response,
        operation=operation,
    )


def assign_active_project_staffing(
    job_list_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    body = {
        "jobListId": job_list_id,
        **payload,
    }

    result = _active_project_write_request(
        "POST",
        "/v1/staffing/assignments",
        operation="Assign Active Project staffing",
        actor_eid=actor_eid,
        request_id=request_id,
        payload=body,
    )


    _invalidate_project_dashboard_cache()
    return result


def unassign_active_project_staffing(
    job_list_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    body = {
        "jobListId": job_list_id,
        **payload,
    }

    result = _active_project_write_request(
        "POST",
        "/v1/staffing/unassignments",
        operation="Unassign Active Project staffing",
        actor_eid=actor_eid,
        request_id=request_id,
        payload=body,
    )


    _invalidate_project_dashboard_cache()
    return result


def create_active_project_resource_schedule(
    job_list_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    return _active_project_write_request(
        "POST",
        f"/v1/jobs/{job_list_id}/resource-schedule",
        operation="Create Active Project resource schedule",
        actor_eid=actor_eid,
        request_id=request_id,
        payload=payload,
    )


def update_active_project_resource_schedule(
    job_list_id: int,
    schedule_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    return _active_project_write_request(
        "PUT",
        (
            f"/v1/jobs/{job_list_id}"
            f"/resource-schedule/{schedule_id}"
        ),
        operation="Update Active Project resource schedule",
        actor_eid=actor_eid,
        request_id=request_id,
        payload=payload,
    )


def cancel_active_project_resource_schedule(
    job_list_id: int,
    schedule_id: int,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    return _active_project_write_request(
        "DELETE",
        (
            f"/v1/jobs/{job_list_id}"
            f"/resource-schedule/{schedule_id}"
        ),
        operation="Cancel Active Project resource schedule",
        actor_eid=actor_eid,
        request_id=request_id,
    )


def update_active_project(
    job_list_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    operation = "Update Active Project"

    try:
        response = _get_http_client().put(
            f"/v1/jobs/{job_list_id}",
            json=payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc

    if response.status_code in {
        400,
        403,
        404,
        409,
        422,
    }:
        detail = _detail(response)

        if detail is None:
            detail = (
                "invalid_active_project_update"
                if response.status_code == 422
                else "active_project_update_rejected"
            )

        raise DataAPIRequestRejected(
            response.status_code,
            detail,
        )

    _raise_common_failure(
        response,
        operation=operation,
    )

    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )

    result = _json_object(
        response,
        operation=operation,
    )

    _invalidate_project_dashboard_cache()

    return result

def _dashboard_http_timeout() -> httpx.Timeout:
    # The bridge can need >5 seconds to build a cold SQL snapshot. Limit the
    # longer budget to the shared dashboard endpoints, not every API call.
    return httpx.Timeout(
        connect=settings.data_api_connect_timeout_seconds,
        read=settings.data_api_dashboard_read_timeout_seconds,
        write=settings.data_api_read_timeout_seconds,
        pool=settings.data_api_connect_timeout_seconds,
    )


def _dashboard_path(path: str, fresh: bool) -> str:
    if not fresh:
        return path
    separator = "&" if "?" in path else "?"
    return f"{path}{separator}fresh=true"


def _fetch_current_projected_billings(*, shared_fresh: bool = False) -> list[dict]:
    operation = "Current Project projected billings"

    response = _get_service_response(
        _dashboard_path("/v1/bid-log/current-projects?includeCompletedBilling=true", shared_fresh),
        operation=operation,
        timeout=_dashboard_http_timeout(),
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
            "?includeCompletedBilling=true"
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


def save_active_bid_projected_billing_settings(
    sharepoint_item_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    operation = (
        "Save Active Bid projected billing settings"
    )

    try:
        response = _get_http_client().put(
            (
                "/v1/bid-log/projected-billings/"
                f"{sharepoint_item_id}/settings"
            ),
            json=payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc

    if response.status_code in {
        400,
        403,
        404,
        409,
        422,
    }:
        detail = _detail(
            response
        )

        if detail is not None:
            raise DataAPIRequestRejected(
                response.status_code,
                detail,
            )

    _raise_common_failure(
        response,
        operation=operation,
    )

    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )

    result = _json_object(
        response,
        operation=operation,
    )

    if not isinstance(
        result.get("project"),
        dict,
    ):
        raise DataAPIInvalidResponse(
            "Active Bid settings response is "
            "missing project detail."
        )

    # Duration and forecast-setting edits change the projected
    # billing dashboard even when the Bid Log row itself did not
    # change. Force the next dashboard read to be authoritative.
    _dashboard_cache_invalidate_key(
        "active_bid_dashboard",
    )

    return result

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



def _fetch_completed_projects() -> list[dict]:
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



# ============================================================
# BID LOG USAGE
# ============================================================


def _bid_log_usage_request(
    path: str,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
    operation: str,
) -> dict:

    try:
        response = _timed_data_api_request(
            operation,
            lambda: _get_http_client().post(
                path,
                json=payload,
                headers=_request_headers(
                    include_service_auth=True,
                    request_id=request_id,
                    actor_eid=actor_eid,
                ),
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc


    if response.status_code in {
        400,
        403,
        404,
        409,
        422,
    }:
        detail = _detail(
            response
        )

        if detail is not None:
            raise DataAPIRequestRejected(
                response.status_code,
                detail,
            )


    _raise_common_failure(
        response,
        operation=operation,
    )


    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )


    return _json_object(
        response,
        operation=operation,
    )



def record_bid_log_usage_heartbeat(
    *,
    usage_session_id: str,
    actor_eid: int,
    it_user_id: int,
    display_name: str,
    microsoft_username: str | None,
    app_role: str,
    current_page: str | None,
    client_active: bool,
    request_id: str,
) -> dict:

    return _bid_log_usage_request(
        "/v1/bid-log/usage/heartbeat",
        {
            "usageSessionId":
                usage_session_id,

            "itUserId":
                it_user_id,

            "displayName":
                display_name,

            "microsoftUsername":
                microsoft_username,

            "appRole":
                app_role,

            "currentPage":
                current_page,

            "clientActive":
                client_active,
        },
        actor_eid=actor_eid,
        request_id=request_id,
        operation="Bid Log usage heartbeat",
    )



def end_bid_log_usage_session(
    *,
    usage_session_id: str,
    actor_eid: int,
    end_reason: str,
    request_id: str,
) -> dict:

    return _bid_log_usage_request(
        "/v1/bid-log/usage/end",
        {
            "usageSessionId":
                usage_session_id,

            "endReason":
                end_reason,
        },
        actor_eid=actor_eid,
        request_id=request_id,
        operation="Bid Log usage session end",
    )



# ============================================================
# PM / OPERATIONS FORECAST
# ============================================================

def get_pm_forecast_policy() -> dict:
    operation = "PM Forecast policy"

    response = _get_service_response(
        "/v1/bid-log/pm-forecast/policy",
        operation=operation,
    )

    return _json_object(
        response,
        operation=operation,
    )


def update_pm_forecast_policy(
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    operation = (
        "Update PM Forecast policy"
    )

    try:
        response = _get_http_client().put(
            "/v1/bid-log/pm-forecast/policy",
            json=payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc


    if response.status_code in {
        400,
        403,
        404,
        409,
        422,
    }:
        detail = _detail(
            response
        )

        if detail is not None:
            raise DataAPIRequestRejected(
                response.status_code,
                detail,
            )


    _raise_common_failure(
        response,
        operation=operation,
    )


    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )


    payload_out = _json_object(
        response,
        operation=operation,
    )


    if not isinstance(
        payload_out.get(
            "requireBaselineTotalMatch"
        ),
        bool,
    ):
        raise DataAPIInvalidResponse(
            "PM Forecast policy response is "
            "missing requireBaselineTotalMatch."
        )


    _invalidate_project_dashboard_cache()
    return payload_out


def get_current_project_pm_forecast_policy(
    job_list_id: int,
) -> dict:
    operation = (
        "Current Project PM Forecast policy"
    )

    response = _get_service_response(
        (
            "/v1/bid-log/current-projects/"
            f"{job_list_id}/pm-forecast/policy"
        ),
        operation=operation,
        resource_not_found=True,
    )

    payload = _json_object(
        response,
        operation=operation,
    )

    if payload.get(
        "jobListId"
    ) != job_list_id:
        raise DataAPIInvalidResponse(
            "Project PM Forecast policy response "
            "has an unexpected jobListId."
        )

    if not isinstance(
        payload.get(
            "requireBaselineTotalMatch"
        ),
        bool,
    ):
        raise DataAPIInvalidResponse(
            "Project PM Forecast policy response is "
            "missing requireBaselineTotalMatch."
        )

    return payload


def _pm_forecast_write_request(
    method: str,
    path: str,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
    operation: str,
) -> dict:
    try:
        response = _get_http_client().request(
            method,
            path,
            json=payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc


    if response.status_code in {
        400,
        403,
        404,
        409,
        422,
    }:
        detail = _detail(
            response
        )

        if detail is not None:
            raise DataAPIRequestRejected(
                response.status_code,
                detail,
            )


    _raise_common_failure(
        response,
        operation=operation,
    )


    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )


    return _json_object(
        response,
        operation=operation,
    )


def update_current_project_pm_forecast_policy(
    job_list_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    result = _pm_forecast_write_request(
        "PUT",
        (
            "/v1/bid-log/current-projects/"
            f"{job_list_id}/pm-forecast/policy"
        ),
        payload,
        actor_eid=actor_eid,
        request_id=request_id,
        operation=(
            "Update Current Project PM Forecast policy"
        ),
    )


    _invalidate_project_dashboard_cache()
    return result


def get_pm_forecast_portfolio_balance(*, fresh: bool = False) -> list[dict]:
    """Read all active-project coverage mismatches, independent of recipients."""
    operation = "PM Forecast portfolio balance"
    response = _get_service_response(
        _dashboard_path("/v1/bid-log/pm-forecast/portfolio-balance", fresh),
        operation=operation,
        timeout=_dashboard_http_timeout(),
    )
    return _json_object_list(response, operation=operation)


def get_pm_forecast_schedule_review(*, fresh: bool = False) -> list[dict]:
    """Portfolio-wide schedule flags, without recipient information."""
    operation = "PM Forecast schedule review"
    response = _get_service_response(
        _dashboard_path("/v1/bid-log/pm-forecast/schedule-review", fresh),
        operation=operation, timeout=_dashboard_http_timeout(),
    )
    return _json_object_list(response, operation=operation)


def get_pm_forecast_schedule_review_attention(actor_eid: int) -> list[dict]:
    """Recipient-scoped schedule notifications for the authenticated EID."""
    operation = "PM Forecast schedule review attention"
    try:
        response = _timed_data_api_request(
            operation,
            lambda: _get_http_client().get(
                "/v1/bid-log/pm-forecast/schedule-review/attention",
                headers=_request_headers(include_service_auth=True, actor_eid=actor_eid),
            ),
        )
    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(f"Riggs Data API timed out during {operation}.") from exc
    except httpx.RequestError as exc:
        raise DataAPIUnavailable(f"Unable to connect to Riggs Data API during {operation}.") from exc
    if response.status_code in {400, 403, 404, 409, 422}:
        detail = _detail(response)
        if detail is not None:
            raise DataAPIRequestRejected(response.status_code, detail)
    _raise_common_failure(response, operation=operation)
    if response.status_code != 200:
        raise DataAPIInvalidResponse(f"Unexpected response during {operation}.")
    return _json_object_list(response, operation=operation)


def get_pm_forecast_attention(
    actor_eid: int,
) -> list[dict]:
    operation = (
        "PM Forecast attention"
    )

    try:
        response = _timed_data_api_request(
            operation,
            lambda: _get_http_client().get(
                "/v1/bid-log/pm-forecast/attention",
                headers=_request_headers(
                    include_service_auth=True,
                    actor_eid=actor_eid,
                ),
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc


    if response.status_code in {
        400,
        403,
        404,
        409,
        422,
    }:
        detail = _detail(
            response
        )

        if detail is not None:
            raise DataAPIRequestRejected(
                response.status_code,
                detail,
            )


    _raise_common_failure(
        response,
        operation=operation,
    )


    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )


    return _json_object_list(
        response,
        operation=operation,
    )


def get_current_project_pm_forecast(
    job_list_id: int,
) -> dict:
    operation = (
        "Current Project PM Forecast"
    )

    response = _get_service_response(
        (
            "/v1/bid-log/current-projects/"
            f"{job_list_id}/pm-forecast"
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
            "Current Project PM Forecast response "
            "is missing its items list."
        )

    return payload


def get_current_project_pm_forecast_history(
    job_list_id: int,
) -> dict:
    operation = (
        "Current Project PM Forecast history"
    )

    response = _get_service_response(
        (
            "/v1/bid-log/current-projects/"
            f"{job_list_id}/pm-forecast/history"
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
            "PM Forecast history response "
            "is missing its items list."
        )

    return payload


def get_current_project_pm_forecast_version(
    job_list_id: int,
    forecast_version_id: int,
) -> dict:
    operation = (
        "Current Project PM Forecast version"
    )

    response = _get_service_response(
        (
            "/v1/bid-log/current-projects/"
            f"{job_list_id}/pm-forecast/history/"
            f"{forecast_version_id}"
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
            "PM Forecast version response "
            "is missing its items list."
        )

    return payload


def save_current_project_pm_forecast(
    job_list_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    operation = (
        "Save Current Project PM Forecast"
    )

    try:
        response = _get_http_client().post(
            (
                "/v1/bid-log/current-projects/"
                f"{job_list_id}/pm-forecast"
            ),
            json=payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc


    # Application-level rejections from the Data API.
    # A Cloudflare 403 normally has no Riggs JSON detail and
    # therefore falls through to _raise_common_failure().
    if response.status_code in {
        400,
        403,
        404,
        409,
        422,
    }:
        detail = _detail(
            response
        )

        if detail is not None:
            raise DataAPIRequestRejected(
                response.status_code,
                detail,
            )


    _raise_common_failure(
        response,
        operation=operation,
    )


    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )


    payload_out = _json_object(
        response,
        operation=operation,
    )

    items = payload_out.get(
        "items"
    )

    if not isinstance(
        items,
        list,
    ):
        raise DataAPIInvalidResponse(
            "PM Forecast save response "
            "is missing its items list."
        )

    _invalidate_project_dashboard_cache()
    return payload_out


def save_current_project_pm_forecast_admin_correction(
    job_list_id: int,
    payload: dict,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    payload_out = _pm_forecast_write_request(
        "POST",
        (
            "/v1/bid-log/current-projects/"
            f"{job_list_id}/pm-forecast/admin-correction"
        ),
        payload,
        actor_eid=actor_eid,
        request_id=request_id,
        operation=(
            "Save Current Project PM Forecast "
            "admin correction"
        ),
    )

    items = payload_out.get(
        "items"
    )

    if not isinstance(
        items,
        list,
    ):
        raise DataAPIInvalidResponse(
            "PM Forecast admin correction response "
            "is missing its items list."
        )

    _invalidate_project_dashboard_cache()
    return payload_out


# ============================================================
# ORIGINATING BID / CURRENT PROJECT LINK
# ============================================================

def _originating_bid_request(
    method: str,
    path: str,
    *,
    operation: str,
    request_id: str | None = None,
    actor_eid: int | None = None,
    params: dict | None = None,
    json_payload: dict | None = None,
) -> dict:
    try:
        response = _get_http_client().request(
            method,
            path,
            params=params,
            json=json_payload,
            headers=_request_headers(
                include_service_auth=True,
                request_id=request_id,
                actor_eid=actor_eid,
            ),
        )

    except httpx.TimeoutException as exc:
        raise DataAPIUnavailable(
            "Riggs Data API request timed out "
            f"during {operation}."
        ) from exc

    except httpx.RequestError as exc:
        raise DataAPIUnavailable(
            "Unable to connect to the Riggs Data API "
            f"during {operation}."
        ) from exc


    if response.status_code in {
        400,
        403,
        404,
        409,
        422,
    }:
        detail = _detail(
            response
        )

        if detail is not None:
            raise DataAPIRequestRejected(
                response.status_code,
                detail,
            )


    _raise_common_failure(
        response,
        operation=operation,
    )


    if response.status_code != 200:
        raise DataAPIInvalidResponse(
            "Unexpected Riggs Data API response "
            f"during {operation}."
        )


    return _json_object(
        response,
        operation=operation,
    )


def get_current_project_originating_bid(
    job_list_id: int,
) -> dict:
    return _originating_bid_request(
        "GET",
        (
            "/v1/bid-log/current-projects/"
            f"{job_list_id}/originating-bid"
        ),
        operation=(
            "Current Project originating bid"
        ),
    )


def get_originating_bid_attention(
    actor_eid: int,
) -> dict:
    payload = _originating_bid_request(
        "GET",
        "/v1/bid-log/originating-bid/attention",
        operation=(
            "Originating bid attention"
        ),
        actor_eid=actor_eid,
    )

    scope = payload.get("scope")
    items = payload.get("items")

    if scope not in {
        "ADMIN",
        "PM",
        "OPERATIONS_REVIEW",
        "NONE",
    }:
        raise DataAPIInvalidResponse(
            "Originating bid attention response "
            "has an invalid scope."
        )

    if (
        not isinstance(items, list)
        or not all(
            isinstance(item, dict)
            for item in items
        )
    ):
        raise DataAPIInvalidResponse(
            "Originating bid attention response "
            "is missing its items list."
        )

    for key in (
        "graceHours",
        "candidateCountBeforeGrace",
        "graceSuppressedCount",
        "attentionCount",
        "unlinkedCount",
        "reviewExceptionCount",
    ):
        value = payload.get(key)
        if (
            not isinstance(value, int)
            or isinstance(value, bool)
            or value < 0
        ):
            raise DataAPIInvalidResponse(
                "Originating bid attention response "
                f"has an invalid {key}."
            )

    if payload["attentionCount"] != len(items):
        raise DataAPIInvalidResponse(
            "Originating bid attention response "
            "count does not match its items list."
        )

    return payload



def get_current_project_change_orders(
    job_list_id: int,
) -> dict:
    payload = _originating_bid_request(
        "GET",
        (
            "/v1/bid-log/current-projects/"
            f"{job_list_id}/change-orders"
        ),
        operation=(
            "Current Project Foundation change orders"
        ),
    )


    response_job_list_id = payload.get(
        "jobListId"
    )

    job_number = payload.get(
        "jobNumber"
    )

    change_order_count = payload.get(
        "changeOrderCount"
    )

    approved_change_order_amount = payload.get(
        "approvedChangeOrderAmount"
    )

    change_order_cost_amount = payload.get(
        "changeOrderCostAmount"
    )

    items = payload.get(
        "items"
    )


    if (
        not isinstance(
            response_job_list_id,
            int,
        )
        or isinstance(
            response_job_list_id,
            bool,
        )
        or response_job_list_id
            != job_list_id
    ):
        raise DataAPIInvalidResponse(
            "Change order response has "
            "an invalid jobListId."
        )


    if (
        not isinstance(
            job_number,
            str,
        )
        or not job_number.strip()
    ):
        raise DataAPIInvalidResponse(
            "Change order response is "
            "missing jobNumber."
        )


    if (
        not isinstance(
            change_order_count,
            int,
        )
        or isinstance(
            change_order_count,
            bool,
        )
        or change_order_count < 0
    ):
        raise DataAPIInvalidResponse(
            "Change order response has "
            "an invalid changeOrderCount."
        )


    for field_name, value in (
        (
            "approvedChangeOrderAmount",
            approved_change_order_amount,
        ),
        (
            "changeOrderCostAmount",
            change_order_cost_amount,
        ),
    ):
        if (
            not isinstance(
                value,
                (
                    int,
                    float,
                ),
            )
            or isinstance(
                value,
                bool,
            )
        ):
            raise DataAPIInvalidResponse(
                "Change order response has "
                f"an invalid {field_name}."
            )


    if (
        not isinstance(
            items,
            list,
        )
        or not all(
            isinstance(
                item,
                dict,
            )
            for item in items
        )
    ):
        raise DataAPIInvalidResponse(
            "Change order response is "
            "missing its items list."
        )


    if len(items) != change_order_count:
        raise DataAPIInvalidResponse(
            "Change order response count "
            "does not match its items."
        )


    if (
        payload.get(
            "source"
        )
        != "FOUNDATION_ACTIVE_CHANGE_ORDERS"
    ):
        raise DataAPIInvalidResponse(
            "Change order response has "
            "an unexpected source."
        )


    return payload


def get_current_project_bid_candidates(
    job_list_id: int,
    *,
    actor_eid: int,
    request_id: str,
    search: str | None = None,
    limit: int = 15,
) -> dict:
    params = {
        "limit":
            limit,
    }


    if (
        search is not None
        and search.strip()
    ):
        params[
            "search"
        ] = search.strip()


    payload = _originating_bid_request(
        "GET",
        (
            "/v1/bid-log/current-projects/"
            f"{job_list_id}/bid-candidates"
        ),
        operation=(
            "Current Project bid candidates"
        ),
        request_id=request_id,
        actor_eid=actor_eid,
        params=params,
    )


    project = payload.get(
        "project"
    )

    items = payload.get(
        "items"
    )

    candidate_count = payload.get(
        "candidateCount"
    )


    if not isinstance(
        project,
        dict,
    ):
        raise DataAPIInvalidResponse(
            "Bid candidate response is "
            "missing project detail."
        )


    if (
        not isinstance(
            items,
            list,
        )
        or not all(
            isinstance(
                item,
                dict,
            )
            for item in items
        )
    ):
        raise DataAPIInvalidResponse(
            "Bid candidate response is "
            "missing its items list."
        )


    if (
        not isinstance(
            candidate_count,
            int,
        )
        or isinstance(
            candidate_count,
            bool,
        )
        or candidate_count < 0
    ):
        raise DataAPIInvalidResponse(
            "Bid candidate response is "
            "missing candidateCount."
        )


    return payload


def link_current_project_originating_bid(
    job_list_id: int,
    original_bid_log_id: int,
    *,
    actor_eid: int,
    request_id: str,
) -> dict:
    result = _originating_bid_request(
        "POST",
        (
            "/v1/bid-log/current-projects/"
            f"{job_list_id}/originating-bid"
        ),
        operation=(
            "Link Current Project originating bid"
        ),
        request_id=request_id,
        actor_eid=actor_eid,
        json_payload={
            "originalBidLogId":
                original_bid_log_id,
        },
    )


    _invalidate_project_dashboard_cache()
    _dashboard_cache_invalidate_key("active_bid_dashboard")
    return result



def _fetch_current_projects_primary_projection(*, shared_fresh: bool = False) -> dict:
    operation = "Current Project primary projection bulk"
    response = _get_service_response(
        _dashboard_path("/v1/bid-log/current-projects/primary-projection", shared_fresh),
        operation=operation, timeout=_dashboard_http_timeout(),
    )
    payload = _json_object(response, operation=operation)
    if (payload.get("contractVersion") != 1
            or not isinstance(payload.get("projects"), list)
            or not isinstance(payload.get("items"), list)):
        raise DataAPIInvalidResponse("Invalid PM-first portfolio response.")
    return payload


def get_current_projects_primary_projection(*, fresh: bool = False) -> dict:
    # The bridge owns the shared snapshot; do not create a second Cloud Run
    # TTL that would delay another user's successful manual rebuild.
    return _fetch_current_projects_primary_projection(shared_fresh=fresh)


def _fetch_current_projects_monthly_bulk(*, shared_fresh: bool = False) -> dict:
    operation = (
        "Current Project monthly bulk"
    )

    response = _get_service_response(
        _dashboard_path("/v1/bid-log/current-projects/monthly?includeCompletedBilling=true", shared_fresh),
        operation=operation,
        timeout=_dashboard_http_timeout(),
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
            "Current Project monthly bulk response "
            "is missing its items list."
        )

    return payload


def _fetch_active_bid_dashboard(*, shared_fresh: bool = False) -> dict:
    operation = (
        "Active Bid projected-billings dashboard"
    )

    response = _get_service_response(
        _dashboard_path("/v1/bid-log/projected-billings/dashboard", shared_fresh),
        operation=operation,
        timeout=_dashboard_http_timeout(),
    )

    payload = _json_object(
        response,
        operation=operation,
    )

    projects = payload.get(
        "projects"
    )

    monthly = payload.get(
        "monthly"
    )

    if not isinstance(
        projects,
        dict,
    ):
        raise DataAPIInvalidResponse(
            "Active Bid dashboard response "
            "is missing projects."
        )

    if not isinstance(
        monthly,
        list,
    ):
        raise DataAPIInvalidResponse(
            "Active Bid dashboard response "
            "is missing monthly data."
        )

    return payload


# ============================================================
# APP-LOCAL READ CACHE (other uses only)
# The six shared Projected Billings datasets now use bridge-owned snapshots.
# Other existing reads, including active-bid-list and completed-directory,
# retain the bounded process-local cache and their original invalidation.
# Detail, PM versions, policy, attention, and delegated sessions stay live.
# ============================================================

import math as _dashboard_math
import os as _dashboard_os
from .dashboard_cache import DashboardReadCache


_dashboard_read_cache = DashboardReadCache()


def _dashboard_cache_ttl_seconds() -> float:
    raw = _dashboard_os.getenv(
        "BID_LOG_DASHBOARD_CACHE_TTL_SECONDS", "30",
    ).strip()
    try:
        value = float(raw)
    except ValueError:
        return 30.0
    if not _dashboard_math.isfinite(value):
        return 30.0
    return max(0.0, min(value, 300.0))


def _dashboard_cached(key: str, loader, *, fresh: bool = False):
    return _dashboard_read_cache.get(
        key, loader, ttl=_dashboard_cache_ttl_seconds(), fresh=fresh,
    )


def _dashboard_cache_invalidate_key(key: str) -> None:
    _dashboard_read_cache.invalidate_key(key)


def _dashboard_cache_invalidate_prefix(prefix: str) -> None:
    _dashboard_read_cache.invalidate_prefix(prefix)


def _invalidate_project_dashboard_cache() -> None:
    # Invalidate read representations, not SQL policy or forecast history.
    # Legacy baseline reads and the explicit PM-first response stay separate.
    _dashboard_cache_invalidate_key("current_project_primary_projection")
    _dashboard_cache_invalidate_key("current_project_summary")
    _dashboard_cache_invalidate_key("current_project_monthly_bulk")
    _dashboard_cache_invalidate_key("completed_projects")


def get_active_bids(
    *,
    bid_status: str | None = None,
    search: str | None = None,
    limit: int = 500,
    offset: int = 0,
    fresh: bool = False,
) -> dict:
    normalized_status = bid_status.strip() if bid_status is not None else ""
    normalized_search = search.strip() if search is not None else ""
    key = (
        "active_bid_list:"
        f"{normalized_status!r}:{normalized_search!r}:{limit}:{offset}"
    )
    return _dashboard_cached(
        key,
        lambda: _fetch_active_bids(
            bid_status=normalized_status or None,
            search=normalized_search or None,
            limit=limit,
            offset=offset,
        ),
        fresh=fresh,
    )


def get_completed_projects(*, fresh: bool = False) -> list[dict]:
    return _dashboard_cached(
        "completed_projects", _fetch_completed_projects, fresh=fresh,
    )


def get_current_projected_billings(*, fresh: bool = False) -> list[dict]:
    return _fetch_current_projected_billings(shared_fresh=fresh)


def get_current_projects_monthly_bulk(*, fresh: bool = False) -> dict:
    return _fetch_current_projects_monthly_bulk(shared_fresh=fresh)


def get_active_bid_dashboard(*, fresh: bool = False) -> dict:
    return _fetch_active_bid_dashboard(shared_fresh=fresh)


# ============================================================
# SHARED BRIDGE DASHBOARD CACHE CONTROL
# ============================================================

def get_shared_dashboard_cache_status() -> dict:
    response = _get_service_response(
        "/v1/bid-log/dashboard-cache/status",
        operation="Shared dashboard cache status",
    )
    result = _json_object(response, operation="Shared dashboard cache status")
    if not isinstance(result.get("datasets"), dict):
        raise DataAPIInvalidResponse("Invalid shared dashboard cache status.")
    return result


def refresh_shared_dashboard_cache(*, actor_eid: int) -> dict:
    operation = "Shared dashboard cache refresh"
    try:
        response = _get_http_client().post(
            "/v1/bid-log/dashboard-cache/refresh",
            headers=_request_headers(include_service_auth=True, actor_eid=actor_eid),
        )
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        raise DataAPIUnavailable("Shared dashboard refresh request failed.") from exc
    if response.status_code == 429:
        if _detail(response) != "shared_dashboard_refresh_rate_limited":
            raise DataAPIInvalidResponse("Unexpected shared dashboard refresh rejection.")
        raw_retry = response.headers.get("Retry-After", "")
        try:
            retry_after = int(raw_retry)
        except ValueError:
            raise DataAPIInvalidResponse("Invalid shared dashboard cooldown response.") from None
        if retry_after < 1 or retry_after > 3600:
            raise DataAPIInvalidResponse("Invalid shared dashboard cooldown duration.")
        raise DataAPISharedRefreshRateLimited(retry_after)
    _raise_common_failure(response, operation=operation)
    if response.status_code != 202:
        raise DataAPIInvalidResponse("Unexpected shared dashboard refresh response.")
    payload = _json_object(response, operation=operation)
    if not payload.get("refreshId") or payload.get("status") not in {
        "RUNNING", "COMPLETE", "PARTIAL", "FAILED"
    }:
        raise DataAPIInvalidResponse("Invalid shared dashboard refresh receipt.")
    return payload


# Human presence is diagnostic evidence, never an authentication grant.
def get_bid_log_administration_presence(*, actor_eid: int, entra_object_id: str) -> dict:
    if type(actor_eid) is not int or actor_eid != 2021:
        raise DataAPIConfigurationError("Administration actor unavailable")
    try:
        oid = UUID(entra_object_id)
        if oid.int == 0:
            raise ValueError("empty UUID")
    except (ValueError, TypeError, AttributeError) as exc:
        raise DataAPIConfigurationError("Administration identity unavailable") from exc

    headers = _request_headers(include_service_auth=True, actor_eid=actor_eid)
    headers["X-Riggs-Actor-Entra-OID"] = str(oid)
    operation = "Bid Log Administration cross-app presence"
    try:
        response = _timed_data_api_request(
            "admin_presence",
            lambda: _get_http_client().get(
                "/v1/bid-log/admin/presence",
                headers=headers,
                timeout=httpx.Timeout(
                    connect=settings.data_api_connect_timeout_seconds,
                    read=settings.data_api_dashboard_read_timeout_seconds,
                    write=settings.data_api_read_timeout_seconds,
                    pool=settings.data_api_connect_timeout_seconds,
                ),
            ),
        )
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        raise DataAPIUnavailable("Administration presence upstream unavailable") from exc

    _raise_common_failure(response, operation=operation)
    if response.status_code != 200:
        raise DataAPIInvalidResponse("Unexpected Administration presence status")
    return _json_object(response, operation=operation)


# Session history is a bounded, owner-only aggregate, not raw tracking rows.
# Use the existing dashboard read timeout rather than the ordinary 5-second
# limit: the SQL procedure reads three history sources with an explicit cap.
def get_bid_log_administration_leaderboard(
    *, actor_eid: int, entra_object_id: str, days: int = 30, app_code: str = "ALL",
) -> dict:
    if type(actor_eid) is not int or actor_eid != 2021:
        raise DataAPIConfigurationError("Administration actor unavailable")
    try:
        oid = UUID(entra_object_id)
        if oid.int == 0:
            raise ValueError("empty UUID")
    except (ValueError, TypeError, AttributeError) as exc:
        raise DataAPIConfigurationError("Administration identity unavailable") from exc
    if type(days) is not int or days not in (7, 30, 90) or app_code not in (
        "ALL", "BID_LOG", "ACCOUNTING", "OPERATIONS",
    ):
        raise ValueError("Invalid leaderboard filters")

    headers = _request_headers(include_service_auth=True, actor_eid=actor_eid)
    headers["X-Riggs-Actor-Entra-OID"] = str(oid)
    operation = "Bid Log Administration usage leaderboard"
    try:
        response = _timed_data_api_request(
            "admin_leaderboard",
            lambda: _get_http_client().get(
                "/v1/bid-log/admin/leaderboard",
                params={"days": days, "app": app_code},
                headers=headers,
                timeout=httpx.Timeout(
                    connect=settings.data_api_connect_timeout_seconds,
                    read=settings.data_api_dashboard_read_timeout_seconds,
                    write=settings.data_api_read_timeout_seconds,
                    pool=settings.data_api_connect_timeout_seconds,
                ),
            ),
        )
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        raise DataAPIUnavailable("Administration leaderboard upstream unavailable") from exc

    _raise_common_failure(response, operation=operation)
    if response.status_code != 200:
        raise DataAPIInvalidResponse("Unexpected Administration leaderboard status")
    return _json_object(response, operation=operation)


# Private Administration metrics: owner identity originates exclusively from
# the signed Entra session after require_administration_owner in main.py.
def get_bid_log_administration_monitoring(*, actor_eid: int, entra_object_id: str) -> dict:
    if type(actor_eid) is not int or actor_eid != 2021:
        raise DataAPIConfigurationError("Administration actor unavailable")
    try:
        oid = UUID(entra_object_id)
        if oid.int == 0:
            raise ValueError("empty UUID")
    except (ValueError, TypeError, AttributeError) as exc:
        raise DataAPIConfigurationError("Administration identity unavailable") from exc

    headers = _request_headers(include_service_auth=True, actor_eid=actor_eid)
    headers["X-Riggs-Actor-Entra-OID"] = str(oid)
    operation = "Bid Log Administration aggregate monitoring"
    try:
        response = _timed_data_api_request(
            "admin_monitoring",
            lambda: _get_http_client().get(
                "/v1/bid-log/admin/monitoring",
                headers=headers,
                timeout=httpx.Timeout(
                    connect=settings.data_api_connect_timeout_seconds,
                    read=settings.data_api_dashboard_read_timeout_seconds,
                    write=settings.data_api_read_timeout_seconds,
                    pool=settings.data_api_connect_timeout_seconds,
                ),
            ),
        )
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        raise DataAPIUnavailable("Administration monitoring upstream unavailable") from exc

    _raise_common_failure(response, operation=operation)
    if response.status_code != 200:
        raise DataAPIInvalidResponse("Unexpected Administration monitoring status")
    return _json_object(response, operation=operation)
