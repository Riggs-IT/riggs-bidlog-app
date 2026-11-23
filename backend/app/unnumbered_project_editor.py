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
def get_jis(setup_id: UUID, user: CurrentUser = Depends(_reader)):
    return _respond(lambda: data_api.request_unnumbered_project_editor(actor_eid=user.eid, setup_id=setup_id))

@router.patch('/{setup_id}', dependencies=[Depends(_same_origin_json)])
def save_jis(setup_id: UUID, body: SaveRequest, user: CurrentUser = Depends(_admin)):
    return _respond(lambda: data_api.request_unnumbered_project_editor(actor_eid=user.eid, setup_id=setup_id,
                     body=body.model_dump(mode='json')))
