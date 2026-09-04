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
        response = _get_http_client().post(
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


    return payload_out


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

    net_cost_adjustment = payload.get(
        "netCostAdjustment"
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


    if (
        not isinstance(
            net_cost_adjustment,
            (
                int,
                float,
            ),
        )
        or isinstance(
            net_cost_adjustment,
            bool,
        )
    ):
        raise DataAPIInvalidResponse(
            "Change order response has "
            "an invalid netCostAdjustment."
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
            "valueMeaning"
        )
        != "COST_BUDGET_ADJUSTMENT"
    ):
        raise DataAPIInvalidResponse(
            "Change order response has "
            "an unexpected value meaning."
        )


    if (
        payload.get(
            "source"
        )
        != "FOUNDATION_JOB_CHANGE_BUDGET"
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
    return _originating_bid_request(
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



def get_current_projects_monthly_bulk() -> dict:
    operation = (
        "Current Project monthly bulk"
    )

    response = _get_service_response(
        "/v1/bid-log/current-projects/monthly",
        operation=operation,
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


def get_active_bid_dashboard() -> dict:
    operation = (
        "Active Bid projected-billings dashboard"
    )

    response = _get_service_response(
        "/v1/bid-log/projected-billings/dashboard",
        operation=operation,
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
# DASHBOARD READ CACHE
#
# Short-lived process-local cache for the three expensive
# portfolio/dashboard datasets.
#
# Direct project detail, PM Forecast, history, writes, auth,
# health, etc. remain uncached.
#
# Cache is process-local by design. Multiple Cloud Run
# instances may each hold their own <=30 second copy.
# ============================================================

import os as _dashboard_os
import threading as _dashboard_threading
import time as _dashboard_time


def _dashboard_cache_ttl_seconds() -> float:
    raw = _dashboard_os.getenv(
        "BID_LOG_DASHBOARD_CACHE_TTL_SECONDS",
        "30",
    ).strip()

    try:
        value = float(raw)
    except ValueError:
        return 30.0

    return max(
        0.0,
        min(
            value,
            300.0,
        ),
    )


_dashboard_cache_guard = (
    _dashboard_threading.Lock()
)

_dashboard_cache_values: dict[
    str,
    tuple[
        float,
        object,
    ],
] = {}

_dashboard_cache_key_locks: dict[
    str,
    _dashboard_threading.Lock,
] = {}


def _dashboard_cache_key_lock(
    key: str,
):
    with _dashboard_cache_guard:
        lock = (
            _dashboard_cache_key_locks
            .get(key)
        )

        if lock is None:
            lock = (
                _dashboard_threading.Lock()
            )

            _dashboard_cache_key_locks[
                key
            ] = lock

        return lock


def _dashboard_cached(
    key: str,
    loader,
):
    ttl = (
        _dashboard_cache_ttl_seconds()
    )

    if ttl <= 0:
        return loader()


    now = (
        _dashboard_time.monotonic()
    )


    with _dashboard_cache_guard:
        cached = (
            _dashboard_cache_values
            .get(key)
        )

        if (
            cached is not None
            and cached[0] > now
        ):
            return cached[1]


    key_lock = (
        _dashboard_cache_key_lock(
            key
        )
    )


    # Only serialize callers for the SAME dataset.
    #
    # Current summary, current monthly, and Active Bid
    # dashboard can still load concurrently.
    with key_lock:

        now = (
            _dashboard_time.monotonic()
        )


        # Re-check after acquiring the per-key lock.
        # Another request may have filled the cache while
        # this request was waiting.
        with _dashboard_cache_guard:
            cached = (
                _dashboard_cache_values
                .get(key)
            )

            if (
                cached is not None
                and cached[0] > now
            ):
                return cached[1]


        value = loader()


        expires_at = (
            _dashboard_time.monotonic()
            + ttl
        )


        with _dashboard_cache_guard:
            _dashboard_cache_values[
                key
            ] = (
                expires_at,
                value,
            )


        return value


# ============================================================
# Wrap only the three portfolio-load functions.
#
# Preserve the original implementations for direct invocation
# and easy rollback/debugging.
# ============================================================

_uncached_get_current_projected_billings = (
    get_current_projected_billings
)

_uncached_get_current_projects_monthly_bulk = (
    get_current_projects_monthly_bulk
)

_uncached_get_active_bid_dashboard = (
    get_active_bid_dashboard
)


def get_current_projected_billings(
    *args,
    **kwargs,
):
    # If some future caller adds parameters, do not accidentally
    # mix parameterized datasets into this dashboard cache key.
    if args or kwargs:
        return (
            _uncached_get_current_projected_billings(
                *args,
                **kwargs,
            )
        )

    return _dashboard_cached(
        "current_project_summary",
        _uncached_get_current_projected_billings,
    )


def get_current_projects_monthly_bulk(
    *args,
    **kwargs,
):
    if args or kwargs:
        return (
            _uncached_get_current_projects_monthly_bulk(
                *args,
                **kwargs,
            )
        )

    return _dashboard_cached(
        "current_project_monthly_bulk",
        _uncached_get_current_projects_monthly_bulk,
    )


def get_active_bid_dashboard(
    *args,
    **kwargs,
):
    if args or kwargs:
        return (
            _uncached_get_active_bid_dashboard(
                *args,
                **kwargs,
            )
        )

    return _dashboard_cached(
        "active_bid_dashboard",
        _uncached_get_active_bid_dashboard,
    )
