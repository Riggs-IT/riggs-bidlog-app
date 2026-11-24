"""Unnumbered project editor BFF; use existing session-derived identity and origin checks."""
from typing import Any, Annotated
from uuid import UUID
import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, StrictInt, Field, model_validator
from .project_setup_authoring import SafeValidationRoute, _reader, _admin, _same_origin_json, _respond
from .auth import CurrentUser
from . import data_api

router = APIRouter(prefix='/api/project-setups/jis', route_class=SafeValidationRoute)

class SaveRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    operationId: UUID
    expectedRevision: Annotated[StrictInt, Field(ge=1)]
    expectedEntryId: Annotated[StrictInt, Field(ge=1,le=2147483647)]
    expectedVersion: Annotated[StrictInt, Field(ge=1,le=2147483647)]
    changes: dict[str, Any]

    @model_validator(mode='after')
    def bounded(self):
        if not self.operationId.int or not self.changes or len(json.dumps(self.changes,allow_nan=False).encode())>262144:
            raise ValueError('invalid project editor request')
        return self

@router.get('')
def list_jis(user: CurrentUser = Depends(_reader)):
    return _respond(lambda: data_api.request_unnumbered_project_editor(actor_eid=user.eid))

@router.get('/{setup_id}')
def get_jis(setup_id: UUID, user: CurrentUser = Depends(_reader), fresh: bool = False):
    return _respond(lambda: data_api.request_unnumbered_project_editor(actor_eid=user.eid, setup_id=setup_id, **({"fresh": True} if fresh else {})))

@router.patch('/{setup_id}', dependencies=[Depends(_same_origin_json)])
def save_jis(setup_id: UUID, body: SaveRequest, user: CurrentUser = Depends(_admin)):
    return _respond(lambda: data_api.request_unnumbered_project_editor(actor_eid=user.eid, setup_id=setup_id,
                     body=body.model_dump(mode='json')))


from pydantic import StrictBool, StrictStr

class MetricsSaveRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    operationId: UUID
    expectedRevision: Annotated[StrictInt, Field(ge=1, lt=9223372036854775807)]
    setSquareFootage: StrictBool
    setCubicYards: StrictBool
    squareFootage: Annotated[StrictStr, Field(pattern=r'^\d{1,15}(?:\.\d{1,4})?$')] | None = None
    cubicYards: Annotated[StrictStr, Field(pattern=r'^\d{1,15}(?:\.\d{1,4})?$')] | None = None

    @model_validator(mode='after')
    def validate_metrics(self):
        if not self.operationId.int or not (self.setSquareFootage or self.setCubicYards):
            raise ValueError('invalid metric patch')
        if self.setSquareFootage != (self.squareFootage is not None) or self.setCubicYards != (self.cubicYards is not None):
            raise ValueError('invalid metric patch')
        return self

@router.get('/{setup_id}/metrics')
def get_setup_metrics(setup_id: UUID, user: CurrentUser = Depends(_reader)):
    return _respond(lambda: data_api.request_unnumbered_project_metrics(actor_eid=user.eid, setup_id=setup_id))

@router.patch('/{setup_id}/metrics', dependencies=[Depends(_same_origin_json)])
def save_setup_metrics(setup_id: UUID, body: MetricsSaveRequest, user: CurrentUser = Depends(_admin)):
    return _respond(lambda: data_api.request_unnumbered_project_metrics(actor_eid=user.eid, setup_id=setup_id,
                     body=body.model_dump(mode='json',exclude_none=True)))


from typing import Literal
from fastapi import Query

@router.get('/field-team/availability')
def field_team_availability(role: Literal['SUPER', 'FOREMAN'], user: CurrentUser = Depends(_reader),
                            employeeEid: int | None = Query(default=None, gt=0, le=2147483647)):
    return _respond(lambda: data_api.request_field_team_availability(actor_eid=user.eid, role=role,
                                                                    employee_eid=employeeEid))


from .setup_staffing_contract import StaffingSaveRequest

@router.get('/{setup_id}/field-team/plans')
def get_setup_staffing(setup_id: UUID, user: CurrentUser = Depends(_reader)):
    return _respond(lambda: data_api.request_setup_staffing(actor_eid=user.eid, setup_id=setup_id))

@router.patch('/{setup_id}/field-team/plans', dependencies=[Depends(_same_origin_json)])
def save_setup_staffing(setup_id: UUID, body: StaffingSaveRequest, user: CurrentUser = Depends(_admin)):
    return _respond(lambda: data_api.request_setup_staffing(actor_eid=user.eid, setup_id=setup_id,
                     body=body.model_dump(mode='json', exclude_none=True)))


# Reuse the same BFF request validation, service auth and session actor binding.
from fastapi.responses import JSONResponse
from .project_additional_members import ReplaceMembers as AdditionalMembersRequest, _bridge as _roster_bridge


class SetupAdditionalMembersRequest(AdditionalMembersRequest):
    expectedRevision: Annotated[StrictInt, Field(ge=0, le=9007199254740990)]


@router.get('/{setup_id}/additional-members')
def get_setup_additional_members(setup_id: UUID, user: CurrentUser = Depends(_reader)):
    return JSONResponse(_roster_bridge('GET', None, user.eid, setup_id=setup_id),
                        headers={'Cache-Control': 'private, no-store'})


@router.put('/{setup_id}/additional-members', dependencies=[Depends(_same_origin_json)])
def save_setup_additional_members(setup_id: UUID, body: SetupAdditionalMembersRequest, user: CurrentUser = Depends(_admin)):
    return JSONResponse(_roster_bridge('PUT', None, user.eid, body.model_dump(mode='json'), setup_id=setup_id),
                        headers={'Cache-Control': 'private, no-store'})

from fastapi import HTTPException
from .auth import get_current_user
from .project_setup_reviewers import _require_authenticated_actor

def numbered_reader(user: CurrentUser=Depends(get_current_user)):
    _require_authenticated_actor(user)
    if str(user.app_role or '').strip().upper() not in {'ADMIN','OPERATIONS','MANAGEMENT_ADMIN','VIEWER'}:raise HTTPException(403,'project_setup_forbidden')
    return user

def numbered_writer(user: CurrentUser=Depends(get_current_user)):
    numbered_reader(user)
    if str(user.app_role or '').strip().upper()=='VIEWER':raise HTTPException(403,'project_setup_forbidden')
    return user

@router.get('/numbered/{job_id}')
def get_numbered_jis(job_id: int,user: CurrentUser=Depends(numbered_reader),fresh: bool=False):
    return _respond(lambda:data_api.request_numbered_project_editor(actor_eid=user.eid,job_id=job_id,fresh=fresh))

@router.patch('/numbered/{job_id}',dependencies=[Depends(_same_origin_json)])
def save_numbered_jis(job_id: int,body: SaveRequest,user: CurrentUser=Depends(numbered_writer)):
    return _respond(lambda:data_api.request_numbered_project_editor(actor_eid=user.eid,job_id=job_id,body=body.model_dump(mode='json')))
