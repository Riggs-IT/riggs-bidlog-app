"""Typed M9D3B pilot scheduling contract; mirror at the two HTTP boundaries."""
from datetime import date
from typing import Annotated, Literal
from uuid import UUID
import re
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator

# JSON integer precision is bounded for the browser, even though SQL uses BIGINT.
SafeId = Annotated[StrictInt, Field(gt=0, le=9007199254740991)]
Role = Literal['SUPER', 'FOREMAN']

class StaffingSaveRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    operationId: UUID
    expectedRevision: Annotated[StrictInt, Field(ge=0, lt=9007199254740991)]
    action: Literal['ADD', 'EDIT', 'REMOVE']
    resourceRole: Role
    scheduleId: SafeId | None = None
    employeeEid: Annotated[StrictInt, Field(gt=0, le=2147483647)] | None = None
    startDate: date | None = None
    endDate: date | None = None

    @field_validator('startDate', 'endDate', mode='before')
    @classmethod
    def exact_date(cls, value):
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value)):
            raise ValueError('expected ISO calendar date')
        return value

    @model_validator(mode='after')
    def validate_command(self):
        if not self.operationId.int or (self.action == 'ADD') != (self.scheduleId is None):
            raise ValueError('invalid operation identity')
        inputs = (self.employeeEid, self.startDate, self.endDate)
        if self.action == 'REMOVE':
            if any(v is not None for v in inputs):
                raise ValueError('remove accepts only schedule identity')
        elif any(v is None for v in inputs) or self.endDate < self.startDate:
            raise ValueError('employee and valid explicit dates required')
        return self
