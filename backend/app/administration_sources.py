"""Sanitize on-demand Riggs source evidence for owner-only Administration.

A timestamp in an imported row is NOT evidence a producer or worker is alive.
No business rows, raw payloads, Microsoft identities or secrets are returned.
"""
from __future__ import annotations

from datetime import datetime

from .administration import _timestamp, _unavailability_code
from .data_api import get_bid_log_administration_source_evidence

ORDER = (
    "foundation_jobs", "foundation_billings", "sharepoint_bids",
    "sharepoint_orders", "ops_projects",
)
BASIS = {
    "foundation_jobs": ("SOURCE_LAST_MODIFIED", "UTC"),
    "foundation_billings": ("SOURCE_LAST_MODIFIED", "UNVERIFIED_SOURCE_CLOCK"),
    "sharepoint_bids": ("MIRROR_ITEM_SYNC", "UTC"),
    "sharepoint_orders": ("MIRROR_ITEM_SYNC", "UTC"),
    "ops_projects": ("SOURCE_LAST_MODIFIED", "UNVERIFIED_SOURCE_CLOCK"),
}


def _verified_payload(raw: object) -> dict:
    if not isinstance(raw, dict) or raw.get("readOnly") is not True \
            or raw.get("source") != "RIGGSDATAHUB_SOURCE_EVIDENCE":
        raise ValueError("Source evidence identity mismatch")
    observed = _timestamp(raw.get("observedAtUTC"))
    rows = raw.get("rows")
    if not observed or not isinstance(rows, list) or len(rows) != len(ORDER):
        raise ValueError("Source evidence missing")
    seen = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Source evidence row invalid")
        key = row.get("sourceKey")
        if key not in BASIS or key in seen:
            raise ValueError("Source evidence key invalid")
        evidence_type, timestamp_basis = BASIS[key]
        if row.get("evidenceType") != evidence_type or row.get("timestampBasis") != timestamp_basis:
            raise ValueError("Source evidence basis mismatch")
        if type(row.get("recordFound")) is not bool:
            raise ValueError("Source evidence presence invalid")
        raw_value = row.get("lastRecordedValue")
        if raw_value is not None:
            if not isinstance(raw_value, str) or not 19 <= len(raw_value) <= 35:
                raise ValueError("Source evidence timestamp invalid")
            try:
                parsed = datetime.fromisoformat(raw_value)
            except ValueError as exc:
                raise ValueError("Source evidence timestamp invalid") from exc
            if parsed.tzinfo is not None or parsed.year < 2000 or not row["recordFound"]:
                raise ValueError("Source evidence timestamp invalid")
            # No timezone attachment for unverified source clocks.
        seen[key] = {
            "sourceKey": key, "evidenceType": evidence_type,
            "timestampBasis": timestamp_basis, "recordFound": row["recordFound"],
            "lastRecordedValue": raw_value,
        }
    if set(seen) != set(ORDER):
        raise ValueError("Source evidence incomplete")
    return {
        "readOnly": True, "availability": "AVAILABLE",
        "source": "RIGGSDATAHUB_SOURCE_EVIDENCE",
        "observedAtUTC": observed,
        "rows": [seen[key] for key in ORDER],
    }


def get_administration_source_evidence(*, owner_eid: int, owner_oid: str) -> dict:
    try:
        upstream = get_bid_log_administration_source_evidence(
            actor_eid=owner_eid, entra_object_id=owner_oid,
        )
        return _verified_payload(upstream)
    except Exception as exc:
        return {
            "readOnly": True, "availability": "UNAVAILABLE",
            "source": "RIGGSDATAHUB_SOURCE_EVIDENCE",
            "reasonCode": _unavailability_code(exc) if not isinstance(exc, ValueError)
                          else "INVALID_RESPONSE",
        }
