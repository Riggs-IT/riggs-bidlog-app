"""Administration's bounded read-only watchdog incident feed.

User identity comes only from the server-validated Entra session. The shared
Data API and SQL procedure independently enforce the two-admin allowlist.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .administration import _unavailability_code
from .data_api import get_bid_log_administration_terminal_incidents

_ALLOWED_STATUS = frozenset({'NOT PURSUING', 'DEAD', 'LOST'})
_ALLOWED_KIND = frozenset({'BLOCKED', 'UNCERTAIN'})
_ALLOWED_REASON = frozenset({
    'EXISTING_LIFECYCLE_OPERATION_REQUIRES_REVIEW',
    'EXISTING_DESTINATION_SQL_REQUIRES_REVIEW',
    'EXISTING_CANONICAL_BID_REQUIRES_REVIEW',
    'EXISTING_SHAREPOINT_DESTINATION_REQUIRES_REVIEW',
    'RESPONSE_INCOMPLETE_REQUIRES_REVIEW',
    'RESPONSE_IDENTITY_MISMATCH_REQUIRES_REVIEW',
    'SOURCE_REMAINS_AFTER_RESPONSE_REQUIRES_REVIEW',
    'OPERATION_EXCEPTION',
    'TERMINAL_RESPONSE_UNCERTAIN_STOP_WORKER',
    'AUTO_AGE_WINDOW_EXCEEDED_REQUIRES_REVIEW',
})


def _timestamp(value: object) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 48:
        raise ValueError('Invalid incident timestamp')
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValueError('Invalid incident timestamp') from exc
    if dt.utcoffset() is None:
        raise ValueError('Naive incident timestamp')
    return dt.astimezone(timezone.utc).isoformat(timespec='seconds')


def _count(value: object) -> int:
    if type(value) is not int or not 0 <= value <= 2_000_000_000:
        raise ValueError('Invalid incident count')
    return value


def _normalise(raw: object) -> dict:
    if not isinstance(raw, dict) or raw.get('source') != 'RIGGSDATAHUB_WATCHDOG_INCIDENTS':
        raise ValueError('Unexpected incident source')
    total, blocked, uncertain = (_count(raw.get(k)) for k in
                                 ('totalCount', 'blockedCount', 'uncertainCount'))
    if total != blocked + uncertain or raw.get('captureHealth') != 'NOT_COLLECTED':
        raise ValueError('Invalid incident totals/health')
    items = raw.get('incidents')
    if not isinstance(items, list) or len(items) > 20 or (total == 0) != (len(items) == 0):
        raise ValueError('Invalid incident rows')
    rows = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Invalid incident item')
        incident_id = _count(item.get('incidentId'))
        bid_id = _count(item.get('bidId'))
        if (not incident_id or not bid_id or incident_id in seen
            or item.get('kind') not in _ALLOWED_KIND
            or item.get('status') not in _ALLOWED_STATUS
            or item.get('reasonCode') not in _ALLOWED_REASON):
            raise ValueError('Invalid incident identity')
        seen.add(incident_id)
        seen_at = _timestamp(item.get('firstObservedAtUTC'))
        rows.append({
            'incidentId': incident_id, 'bidId': bid_id,
            'status': item['status'], 'kind': item['kind'],
            'reasonCode': item['reasonCode'],
            'sourceModifiedAtUTC': _timestamp(item.get('sourceModifiedAtUTC')),
            'firstObservedAtUTC': seen_at,
            'lastObservedAtUTC': _timestamp(item.get('lastObservedAtUTC')),
            'observationCount': _count(item.get('observationCount')),
        })
    return {
        'availability': 'AVAILABLE',
        'observedAtUTC': _timestamp(raw.get('observedAtUTC')),
        'source': 'RIGGSDATAHUB_WATCHDOG_INCIDENTS',
        'totalCount': total, 'blockedCount': blocked,
        'uncertainCount': uncertain, 'captureHealth': 'NOT_COLLECTED',
        'incidents': rows, 'readOnly': True,
    }


def get_administration_terminal_incidents(*, owner_eid: int, owner_oid: str) -> dict:
    # Unlike generic health checks, this failure is explicitly unavailable;
    # never return a healthy zero or erase the last verified UI incidents.
    try:
        raw = get_bid_log_administration_terminal_incidents(
            actor_eid=owner_eid, entra_object_id=owner_oid,
        )
        return _normalise(raw)
    except Exception as exc:
        return {
            'readOnly': True, 'availability': 'UNAVAILABLE',
            'reasonCode': _unavailability_code(exc),
        }
