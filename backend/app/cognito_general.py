"""App proxy client: no SQL/Cognito credentials; reuse the existing Data API pool."""
from __future__ import annotations
import httpx
from . import data_api


def general_request(job_list_id: int, *, payload: dict | None = None,
                    actor_eid: int | None = None, request_id: str | None = None) -> dict:
    method = "PATCH" if payload is not None else "GET"
    try:
        response = data_api._get_http_client().request(
            method, f"/v1/jobs/{job_list_id}/cognito-general", json=payload,
            headers=data_api._request_headers(include_service_auth=True,
                request_id=request_id, actor_eid=actor_eid),
            # Multiple bounded Cognito requests; do not inherit the 5-second list-read timeout.
            timeout=httpx.Timeout(connect=5.0, read=90.0, write=15.0, pool=5.0),
        )
    except httpx.RequestError as exc:
        raise data_api.DataAPIUnavailable("General Information request could not be completed.") from exc
    if response.status_code in {400, 403, 404, 409, 422, 502, 503}:
        detail = data_api._detail(response) or "cognito_general_unavailable"
        raise data_api.DataAPIRequestRejected(response.status_code, detail)
    data_api._raise_common_failure(response, operation="General Information")
    if response.status_code != 200:
        raise data_api.DataAPIInvalidResponse("General Information returned an unexpected status.")
    return data_api._json_object(response, operation="General Information")
