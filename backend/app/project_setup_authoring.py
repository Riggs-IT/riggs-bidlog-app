"""AP4F ADMIN-only BFF. The browser never supplies the trusted actor or seed."""
from __future__ import annotations
import json
from typing import Annotated, Any
from urllib.parse import urlsplit
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Path, Request
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, model_validator
from .auth import CurrentUser, get_current_user
from .config import get_settings
from . import data_api

from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from fastapi.responses import JSONResponse

class SafeValidationRoute(APIRoute):
    """Never echo submitted contacts, draft payloads or invalid headers in errors."""
    def get_route_handler(self):
        handler = super().get_route_handler()
        async def safe(request):
            try:
                return await handler(request)
            except RequestValidationError:
                return JSONResponse({"detail": "project_setup_invalid_request"},
                    status_code=422, headers={"Cache-Control": "private, no-store"})
        return safe

router = APIRouter(prefix="/api/project-setups/authoring", route_class=SafeValidationRoute)

class StartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operationId: UUID
    expectedSourceVersion: Annotated[StrictStr, Field(pattern=r"^[0-9a-f]{64}$")]
    @model_validator(mode="after")
    def nonzero(self):
        if not self.operationId.int:
            raise ValueError("invalid operation")
        return self

class EditRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operationId: UUID
    expectedRevision: Annotated[StrictInt, Field(gt=0, lt=9223372036854775807)]
    changes: dict[str, Any]
    @model_validator(mode="after")
    def bounded(self):
        if not self.operationId.int or not self.changes:
            raise ValueError("invalid edit")
        if len(json.dumps(self.changes, ensure_ascii=False).encode()) > 262144:
            raise ValueError("draft edit exceeds bound")
        # Detailed canonical field/type validation remains in the protected API.
        # Never pass caller-supplied actor, origin, job identities or controls.
        allowed = {"jobName", "numberOfBuildings", "jobType", "purpose", "streetAddress",
                   "city", "state", "postalCode", "contractAmount", "retentionPercent",
                   "anticipatedStartDate", "estimatedDurationMonths", "gcContactInfo",
                   "projectOwnerInfo", "bond", "parcel", "scope", "leed", "ndaRequired",
                   "keywords", "comments", "buildingNames"}
        if not set(self.changes).issubset(allowed):
            raise ValueError("unsupported draft field")
        return self


def _admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if str(user.app_role).strip().upper() != "ADMIN":
        raise HTTPException(403, "bid_log_admin_required")
    if type(user.eid) is not int or user.eid <= 0:
        raise HTTPException(401, "missing_authenticated_user")
    return user


def _same_origin_json(request: Request):
    if (request.headers.get("X-Riggs-Setup-Write") != "1"
            or request.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json"
            or request.headers.get("Sec-Fetch-Site", "").lower() == "cross-site"):
        raise HTTPException(403, "project_setup_write_origin_required")
    origin = request.headers.get("Origin")
    if origin:
        settings = get_settings()
        expected = urlsplit(str(request.base_url) if getattr(settings, "auth_mode", "entra") == "dev"
                            else settings.entra_redirect_uri or str(request.base_url))
        actual = urlsplit(origin)
        if (actual.scheme, actual.netloc) != (expected.scheme, expected.netloc):
            raise HTTPException(403, "project_setup_write_origin_required")


def _respond(call):
    try:
        return JSONResponse(call(), headers={"Cache-Control": "private, no-store"})
    except data_api.DataAPIRequestRejected as exc:
        # Client below restricts this to fixed status/code pairs.
        raise HTTPException(exc.status_code, exc.detail) from None
    except data_api.DataAPIInvalidResponse:
        raise HTTPException(502, "project_setup_invalid_response") from None
    except Exception:
        raise HTTPException(503, "project_setup_unavailable") from None


@router.get("/awards/{bid_id}")
def award_context(bid_id: int = Path(ge=1, le=2147483647),
                  current_user: CurrentUser = Depends(_admin)):
    return _respond(lambda: data_api.get_project_setup_award_context(
        bid_id=bid_id, actor_eid=current_user.eid))


@router.post("/awards/{bid_id}/start", dependencies=[Depends(_same_origin_json)])
def start_initial(body: StartRequest, bid_id: int = Path(ge=1, le=2147483647),
                  current_user: CurrentUser = Depends(_admin)):
    return _respond(lambda: data_api.start_initial_project_setup(
        bid_id=bid_id, actor_eid=current_user.eid, body=body.model_dump(mode="json")))


@router.patch("/drafts/{setup_id}/edits", dependencies=[Depends(_same_origin_json)])
def edit_draft(setup_id: UUID, body: EditRequest,
               current_user: CurrentUser = Depends(_admin)):
    if not setup_id.int:
        raise HTTPException(422, "project_setup_invalid_request")
    return _respond(lambda: data_api.edit_project_setup_draft(
        setup_id=setup_id, actor_eid=current_user.eid, body=body.model_dump(mode="json")))
