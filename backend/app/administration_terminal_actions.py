"""Owner-only, typed manual review/repair proxy (no browser-controlled EID)."""
from __future__ import annotations

from uuid import UUID
import httpx

from .data_api import (
    _get_http_client, _request_headers, _timed_data_api_request,
    _raise_common_failure, _json_object,
    settings, DataAPIUnavailable, DataAPIInvalidResponse,
)


class AdministrationCaseConflict(RuntimeError):
    def __init__(self, reason: str):
        super().__init__('incident_requires_review')
        self.reason = reason


class AdministrationCaseNotFound(LookupError):
    pass


def _auth(actor_eid: int, actor_oid: str) -> dict[str,str]:
    if type(actor_eid) is not int or actor_eid not in (2021,176):
        raise ValueError('invalid_administration_actor')
    oid = UUID(actor_oid)
    if oid.int == 0:
        raise ValueError('invalid_administration_oid')
    result = _request_headers(include_service_auth=True,actor_eid=actor_eid)
    result['X-Riggs-Actor-Entra-OID']=str(oid)
    return result


def _call(path: str, *, actor_eid: int, actor_oid: str, body: dict | None = None) -> dict:
    headers = _auth(actor_eid,actor_oid)
    operation = 'Bid Log admin terminal case'
    try:
        if body is None:
            response = _timed_data_api_request('admin_terminal_case',lambda:
                _get_http_client().get(path,headers=headers,
                    timeout=httpx.Timeout(connect=3,read=12,write=5,pool=3)))
        else:
            response = _timed_data_api_request('admin_terminal_case_action',lambda:
                _get_http_client().post(path,headers=headers,json=body,
                    timeout=httpx.Timeout(connect=3,read=45,write=5,pool=3)))
    except (httpx.TimeoutException,httpx.RequestError) as exc:
        raise DataAPIUnavailable('Incident case upstream unavailable') from exc
    if response.status_code==404:
        raise AdministrationCaseNotFound()
    if response.status_code==409:
        payload = response.json() if response.headers.get('content-type','').startswith('application/json') else {}
        reason = payload.get('detail') if isinstance(payload,dict) else None
        allowed = {
            'REPAIR_DISABLED','RETRY_DISABLED','ITEM_BUSY','RESOLUTION_EVIDENCE_INCOMPLETE',
            'RETRY_GUARD_BLOCKED','SOURCE_CHANGED','CONFLICT_BEFORE_WRITE',
            'DESTINATION_ALREADY_EXISTS','UNCERTAIN_WRITE_STOP_NO_RETRY',
            'SOURCE_STILL_PRESENT_NO_RETRY','incident_already_resolved',
        }
        raise AdministrationCaseConflict(reason if reason in allowed else 'REVIEW_REQUIRED')
    _raise_common_failure(response,operation=operation)
    if response.status_code!=200:
        raise DataAPIInvalidResponse('Unexpected incident case response')
    return _json_object(response,operation=operation)


def get_administration_terminal_cases(*,owner_eid: int,owner_oid: str) -> dict:
    return _call('/v1/bid-log/admin/terminal-cases',actor_eid=owner_eid,actor_oid=owner_oid)


def get_administration_terminal_case_review(*,incident_id: int,owner_eid: int,owner_oid: str) -> dict:
    if type(incident_id) is not int or incident_id<=0:
        raise ValueError('invalid_incident_id')
    return _call(f'/v1/bid-log/admin/terminal-cases/{incident_id}/review',actor_eid=owner_eid,actor_oid=owner_oid)


def send_administration_terminal_case_action(*,incident_id: int,owner_eid: int,owner_oid: str,
                                               request_id: UUID,operation: str) -> dict:
    if type(incident_id) is not int or incident_id<=0 or not isinstance(request_id,UUID) or request_id.int==0:
        raise ValueError('invalid_incident_action')
    if operation not in ('VERIFY_RESOLVED','RETRY_NOT_PURSUING'):
        raise ValueError('invalid_incident_operation')
    return _call(f'/v1/bid-log/admin/terminal-cases/{incident_id}/action',
                 actor_eid=owner_eid,actor_oid=owner_oid,
                 body={'requestId':str(request_id),'operation':operation,'confirmed':True})
