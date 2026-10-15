"""Owner-only, GET-only Administration overview.

The caller is authenticated and owner-gated in main.py *before* invoking this
module. Never broaden the bridge's machine client or expose unrestricted SQL,
user records, raw exception messages, tokens, or request headers here.
"""
from __future__ import annotations

from datetime import datetime, timezone
import math
import os
import re
from uuid import UUID

from .config import get_settings
from .data_api import (
    DataAPIConfigurationError,
    DataAPIEdgeRejected,
    DataAPIInvalidResponse,
    DataAPIServiceAuthRejected,
    DataAPISQLCapacityUnavailable,
    DataAPISQLUnavailable,
    DataAPIUnavailable,
    check_data_api_ready,
    get_shared_dashboard_cache_status,
    get_bid_log_administration_monitoring,
)

_DATASETS = (
    "current_project_summary",
    "current_project_monthly_bulk",
    "current_project_primary_projection",
    "active_bid_dashboard",
    "portfolio_balance",
    "schedule_review",
)
_CACHE_STATES = frozenset({"FRESH", "STALE", "EXPIRED", "MISSING"})
_REFRESH_STATES = frozenset({"IDLE", "RUNNING", "COMPLETE", "PARTIAL", "FAILED"})
_ERROR_TYPE = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,63}\Z")
_REVISION = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,95}\Z")


def _unavailability_code(exc: Exception) -> str:
    for klass, code in (
        (DataAPISQLCapacityUnavailable, "SQL_CAPACITY"),
        (DataAPISQLUnavailable, "SQL_UNAVAILABLE"),
        (DataAPIEdgeRejected, "EDGE_REJECTED"),
        (DataAPIServiceAuthRejected, "SERVICE_AUTH_REJECTED"),
        (DataAPIConfigurationError, "NOT_CONFIGURED"),
        (DataAPIInvalidResponse, "INVALID_RESPONSE"),
        (DataAPIUnavailable, "UPSTREAM_UNAVAILABLE"),
    ):
        if isinstance(exc, klass):
            return code
    return "UNEXPECTED_ERROR"


def _timestamp(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip() or len(value) > 48:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.utcoffset() is None:
        return None
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")


def _count(value: object, maximum: int) -> int | None:
    return value if type(value) is int and 0 <= value <= maximum else None


def _seconds(value: object) -> float | None:
    if type(value) not in (float, int) or not math.isfinite(value):
        return None
    return round(float(value), 1) if 0 <= value <= 1_000_000 else None


def _run_id(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        return str(UUID(value))
    except ValueError:
        return None


def _sanitize_cache(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("cache payload not object")
    source_rows = payload.get("datasets")
    if not isinstance(source_rows, dict) or set(source_rows) != set(_DATASETS):
        raise ValueError("cache dataset contract mismatch")
    if payload.get("totalDatasets") != len(_DATASETS):
        raise ValueError("cache dataset count mismatch")
    status = payload.get("status")
    if status not in _REFRESH_STATES:
        raise ValueError("cache refresh status invalid")
    complete = _count(payload.get("completedDatasets"), len(_DATASETS))
    failed = payload.get("failedDatasets")
    if complete is None or not isinstance(failed, list) or not all(
        isinstance(k, str) and k in _DATASETS for k in failed
    ) or len(set(failed)) != len(failed):
        raise ValueError("cache refresh counts invalid")

    datasets = []
    for key in _DATASETS:
        row = source_rows[key]
        if not isinstance(row, dict) or row.get("state") not in _CACHE_STATES:
            raise ValueError("cache dataset state invalid")
        error_type = row.get("lastErrorType")
        safe_error = (
            error_type if isinstance(error_type, str) and
            _ERROR_TYPE.fullmatch(error_type) else None
        )
        datasets.append({
            "key": key,
            "state": row["state"],
            "ageSeconds": _seconds(row.get("ageSeconds")),
            "updatedAtUTC": _timestamp(row.get("updatedAtUTC")),
            "errorType": safe_error,
        })

    settings = {}
    for key in (
        "ttlSeconds", "maxStaleSeconds", "manualCooldownSeconds",
        "perUserCooldownSeconds",
    ):
        settings[key] = _seconds(payload.get(key))

    return {
        "availability": "AVAILABLE",
        "source": "BRIDGE_PROCESS_CACHE",
        "refresh": {
            "runId": _run_id(payload.get("refreshId")),
            "status": status,
            "startedAtUTC": _timestamp(payload.get("startedAtUTC")),
            "finishedAtUTC": _timestamp(payload.get("finishedAtUTC")),
            "completedDatasets": complete,
            "totalDatasets": len(_DATASETS),
            "failedDatasetKeys": [k for k in _DATASETS if k in failed],
        },
        "policy": settings,
        "datasets": datasets,
    }



_QUEUE_LANES = (
    "accounting_tickets", "cognito_staffing", "job_cognito",
    "job_sharepoint", "ordering_center", "project_forecast",
)


def _sanitize_monitoring(payload: object) -> dict:
    if not isinstance(payload, dict) or payload.get("source") != "RIGGSDATAHUB_AGGREGATE":
        raise ValueError("monitoring source invalid")
    observed = _timestamp(payload.get("observedAtUTC"))
    usage = payload.get("usage")
    queues = payload.get("queues")
    maintenance = payload.get("reconciliation")
    if not observed or not isinstance(usage, dict) or not isinstance(queues, list) or not isinstance(maintenance, dict):
        raise ValueError("monitoring payload invalid")

    count_keys = (
        "totalSessions", "openSessions", "recentlyActiveSessions",
        "eligibleForCloseout", "endedSessions", "heartbeatExpiredSessions",
        "endedLast24Hours",
    )
    counts = {k: _count(usage.get(k), 2_000_000_000) for k in count_keys}
    if any(value is None for value in counts.values()) or usage.get("activeDefinitionSeconds") != 120:
        raise ValueError("monitoring counts invalid")
    if counts["openSessions"] + counts["endedSessions"] != counts["totalSessions"]:
        raise ValueError("monitoring session totals invalid")
    if (counts["recentlyActiveSessions"] > counts["openSessions"]
        or counts["eligibleForCloseout"] > counts["openSessions"]
        or counts["heartbeatExpiredSessions"] > counts["endedSessions"]
        or counts["endedLast24Hours"] > counts["endedSessions"]):
        raise ValueError("monitoring session subcounts invalid")

    if len(queues) != len(_QUEUE_LANES):
        raise ValueError("monitoring queue count invalid")
    seen = {}
    for row in queues:
        if not isinstance(row, dict):
            raise ValueError("monitoring queue item invalid")
        key = row.get("laneKey")
        if key not in _QUEUE_LANES or key in seen or row.get("processHealth") != "NOT_COLLECTED":
            raise ValueError("monitoring queue identity invalid")
        numbers = {name: _count(row.get(name), 2_000_000_000)
                   for name in ("pendingCount", "processingCount", "failedCount")}
        if any(value is None for value in numbers.values()):
            raise ValueError("monitoring queue values invalid")
        seen[key] = {
            "laneKey": key,
            **numbers,
            "oldestPendingAtUTC": _timestamp(row.get("oldestPendingAtUTC")),
            "latestProcessedAtUTC": _timestamp(row.get("latestProcessedAtUTC")),
            "processHealth": "NOT_COLLECTED",
        }
    if set(seen) != set(_QUEUE_LANES):
        raise ValueError("monitoring queue set incomplete")

    if type(maintenance.get("enabled")) is not bool or (
        maintenance.get("intervalSeconds") != 900
        or maintenance.get("batchLimit") != 50
        or maintenance.get("minimumIdleMinutes") != 65
        or maintenance.get("lastRunAtUTC") is not None
        or maintenance.get("lastRunSource") != "NOT_COLLECTED"
    ):
        raise ValueError("monitoring reconciler policy invalid")

    return {
        "availability": "AVAILABLE",
        "source": "RIGGSDATAHUB_AGGREGATE",
        "observedAtUTC": observed,
        "usage": {**counts, "activeDefinitionSeconds": 120},
        "queues": [seen[key] for key in _QUEUE_LANES],
        "reconciliation": {
            "enabled": maintenance["enabled"],
            "intervalSeconds": 900,
            "batchLimit": 50,
            "minimumIdleMinutes": 65,
            "lastRunAtUTC": None,
            "lastRunSource": "NOT_COLLECTED",
        },
    }

def get_administration_overview(*, owner_eid: int, owner_oid: str) -> dict:
    """Read current, independently observed status, never historical statistics."""
    cfg = get_settings()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    raw_revision = os.getenv("K_REVISION", "")
    revision = raw_revision if _REVISION.fullmatch(raw_revision) else None
    result = {
        "readOnly": True,
        "observedAtUTC": now,
        "services": {
            "bidLog": {
                "state": "AVAILABLE",
                "source": "BID_LOG_HTTP",
                "appVersion": cfg.app_version,
                "cloudRunRevision": revision,
            },
            "dataApi": {"state": "UNVERIFIED", "source": "BRIDGE_READY"},
            "sql": {"state": "UNVERIFIED", "source": "BRIDGE_READY"},
        },
        "cache": {
            "availability": "UNVERIFIED", "source": "BRIDGE_PROCESS_CACHE",
            "refresh": None, "policy": None, "datasets": None,
        },
        "monitoring": {"availability": "UNVERIFIED", "source": "RIGGSDATAHUB_AGGREGATE"},
        "notCollected": [
            "Cache hit/miss history", "Historical rebuild timings",
            "Historical request latency", "Worker process liveness",
        ],
    }

    # Each independent read reports its own availability. A failed readiness
    # request does not prove SQL is down and is never presented that way.
    try:
        ready = check_data_api_ready()
        if ready.get("status") != "ok" or ready.get("sql") != "connected":
            raise DataAPIInvalidResponse("Unexpected readiness status")
        result["services"]["dataApi"]["state"] = "AVAILABLE"
        result["services"]["sql"]["state"] = "CONNECTED"
    except Exception as exc:
        result["services"]["dataApi"].update({
            "state": "UNAVAILABLE", "reasonCode": _unavailability_code(exc),
        })
        # Unknown is deliberate: this request did not establish SQL health.
        result["services"]["sql"]["state"] = "UNVERIFIED"

    try:
        result["cache"] = _sanitize_cache(get_shared_dashboard_cache_status())
    except Exception as exc:
        result["cache"].update({
            "availability": "UNAVAILABLE", "reasonCode": _unavailability_code(exc),
        })

    try:
        raw = get_bid_log_administration_monitoring(
            actor_eid=owner_eid, entra_object_id=owner_oid,
        )
        result["monitoring"] = _sanitize_monitoring(raw)
    except Exception as exc:
        result["monitoring"].update({
            "availability": "UNAVAILABLE", "reasonCode": _unavailability_code(exc),
        })

    return result
