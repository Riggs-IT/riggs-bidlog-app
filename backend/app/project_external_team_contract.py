"""Typed external project recipient roster. Never implies guest or group membership."""
import re
import unicodedata
from typing import Annotated
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator, model_validator

_EMAIL_LOCAL = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+")
_DOMAIN_LABEL = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?")


class ExternalContact(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: Annotated[StrictStr, Field(min_length=1,max_length=200)]
    email: Annotated[StrictStr, Field(min_length=3,max_length=254)]

    @field_validator('name')
    @classmethod
    def valid_name(cls,value):
        value=value.strip()
        if not value or len(value.encode('utf-16-le'))>400 or any(unicodedata.category(c).startswith('C') for c in value):
            raise ValueError('invalid contact name')
        return value

    @field_validator('email')
    @classmethod
    def valid_email(cls,value):
        value=value.strip().lower()
        if value.count('@')!=1:
            raise ValueError('invalid email')
        local,domain=value.split('@')
        if (not _EMAIL_LOCAL.fullmatch(local) or len(local)>64 or local.startswith('.') or local.endswith('.') or '..' in local
                or '.' not in domain or not all(_DOMAIN_LABEL.fullmatch(part) for part in domain.split('.'))):
            raise ValueError('invalid email')
        return value


class ExternalTeamSaveRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    operationId: UUID
    expectedRevision: Annotated[StrictInt,Field(ge=0,le=9007199254740990)]
    contacts: Annotated[list[ExternalContact],Field(max_length=100)]

    @model_validator(mode='after')
    def validate_roster(self):
        if not self.operationId.int or len({contact.email for contact in self.contacts})!=len(self.contacts):
            raise ValueError('invalid external team roster')
        return self
