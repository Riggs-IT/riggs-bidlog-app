"""ADMIN-only Bid Log BFF for AP4F3E SQL project Additional Members.

Browser never submits actor EID or SQL parameters. We use the same Data API
HTTP client and session/identity guard as existing Project Setup authoring.
"""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from . import data_api
from .project_setup_authoring import _admin, _same_origin_json, SafeValidationRoute
from .auth import CurrentUser

router = APIRouter(prefix="/api/active-projects", route_class=SafeValidationRoute)

_ALLOWED = {
    401: {"missing_authenticated_user"},
    403: {"project_additional_members_forbidden"},
    404: {"project_additional_members_job_not_found"},
    409: {"project_additional_members_revision_conflict", "project_additional_members_operation_conflict",
          "project_additional_members_link_conflict"},
    422: {"project_additional_members_invalid_request", "project_additional_members_invalid_member"},
    503: {"project_additional_members_busy", "project_additional_members_unavailable",
          "project_additional_members_writes_disabled", "project_setup_reads_disabled",
          "service_auth_unavailable"},
}


class ReplaceMembers(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operationId: UUID
    expectedRevision: Annotated[StrictInt, Field(ge=0, lt=9223372036854775807)]
    memberITUserIds: Annotated[list[StrictInt], Field(max_length=200)]

    @model_validator(mode="after")
    def valid(self):
        if (not self.operationId.int or len(set(self.memberITUserIds)) != len(self.memberITUserIds)
                or any(not 0 < item <= 2147483647 for item in self.memberITUserIds)):
            raise ValueError("invalid membership")
        return self


def _bridge(method: str, job_list_id: int, actor_eid: int, body: dict | None = None) -> dict:
    if type(actor_eid) is not int or actor_eid <= 0:
        raise HTTPException(401, "missing_authenticated_user")
    try:
        response = data_api._get_http_client().request(
            method, f"/v1/jobs/{job_list_id}/additional-members", json=body,
            headers=data_api._request_headers(include_service_auth=True, actor_eid=actor_eid),
        )
    except (httpx.TimeoutException, httpx.RequestError):
        # Never automatically retry an uncertain write.
        raise HTTPException(503, "project_additional_members_unavailable") from None
    if response.status_code != 200:
        detail = data_api._detail(response)
        if detail in _ALLOWED.get(response.status_code, set()):
            raise HTTPException(response.status_code, detail)
        raise HTTPException(503, "project_additional_members_unavailable")
    try:
        value = response.json()
    except ValueError:
        raise HTTPException(502, "project_additional_members_invalid_response") from None
    if (not isinstance(value, dict) or value.get("persistence") != "SQL_ROSTER_ONLY"
            or value.get("externalWrites") != 0 or value.get("jobListId") != job_list_id):
        raise HTTPException(502, "project_additional_members_invalid_response")
    if method == "GET":
        if (type(value.get("rosterRevision")) is not int or value["rosterRevision"] < 0
                or not isinstance(value.get("members"), list)
                or not isinstance(value.get("directory"), list)
                or not isinstance(value.get("timeline"), list)
                or value.get("deliveryState") not in {"READY", "REVIEW_REQUIRED"}):
            raise HTTPException(502, "project_additional_members_invalid_response")
    else:
        if (value.get("operationId") != body["operationId"]
                or type(value.get("rosterRevision")) is not int
                or value.get("resultAction") not in {"UPDATED", "UNCHANGED", "REPLAY"}):
            raise HTTPException(502, "project_additional_members_invalid_response")
    return value


@router.get("/{job_list_id}/additional-members")
def get_roster(job_list_id: int = Path(ge=1, le=2147483647),
               current_user: CurrentUser = Depends(_admin)):
    return JSONResponse(_bridge("GET", job_list_id, current_user.eid),
                        headers={"Cache-Control": "private, no-store"})


@router.put("/{job_list_id}/additional-members", dependencies=[Depends(_same_origin_json)])
def save_roster(body: ReplaceMembers, job_list_id: int = Path(ge=1, le=2147483647),
                current_user: CurrentUser = Depends(_admin)):
    return JSONResponse(_bridge("PUT", job_list_id, current_user.eid, body.model_dump(mode="json")),
                        headers={"Cache-Control": "private, no-store"})
