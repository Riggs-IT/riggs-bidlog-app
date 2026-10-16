"""Owner-only, GET-only Administration overview.

The caller is authenticated and owner-gated in main.py *before* invoking this
module. Never broaden the bridge's machine client or expose unrestricted SQL,
user records, raw exception messages, tokens, or request headers here.
"""
from __future__ import annotations

from datetime import datetime, timezone, date
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
    get_bid_log_administration_presence,
    get_bid_log_administration_leaderboard,
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


# Owner-only, separate from health/queue monitoring: failure remains unknown.
_PRESENCE_APP_CODES = ("ACCOUNTING", "BID_LOG", "OPERATIONS")
_PRESENCE_STATUSES = {"RECENT_ACTIVITY", "RECENT_HEARTBEAT", "IDLE_UNCONFIRMED"}


def _sanitize_presence(payload: object) -> dict:
    if not isinstance(payload, dict) or payload.get("source") != "RIGGSDATAHUB_USAGE_SESSIONS":
        raise ValueError("Presence source invalid")
    observed = _timestamp(payload.get("observedAtUTC"))
    apps = payload.get("apps")
    sessions = payload.get("sessions")
    if (not observed or payload.get("activityWindowSeconds") != 120
            or payload.get("idleWindowMinutes") != 65
            or payload.get("maxSessionsPerApp") != 50
            or not isinstance(apps, list) or len(apps) != 3
            or not isinstance(sessions, list) or len(sessions) > 150):
        raise ValueError("Presence response shape invalid")
    seen = {}
    counts = {code: 0 for code in _PRESENCE_APP_CODES}
    for entry in apps:
        if not isinstance(entry, dict):
            raise ValueError("Presence app item invalid")
        code = entry.get("appCode")
        if code not in _PRESENCE_APP_CODES or code in seen or type(entry.get("truncated")) is not bool:
            raise ValueError("Presence app identity invalid")
        numbers = {key: _count(entry.get(key), 2_000_000_000) for key in (
            "openSessions", "recentSessions", "recentUsers",
            "recentlyActiveSessions", "recentHeartbeatSessions", "idleUnconfirmedSessions",
        )}
        if any(value is None for value in numbers.values()):
            raise ValueError("Presence app counts invalid")
        if (numbers["recentSessions"] > numbers["openSessions"]
            or numbers["recentUsers"] > numbers["recentSessions"]
            or numbers["recentSessions"] != numbers["recentlyActiveSessions"]
               + numbers["recentHeartbeatSessions"] + numbers["idleUnconfirmedSessions"]
            or entry["truncated"] != (numbers["recentSessions"] > 50)):
            raise ValueError("Presence app totals inconsistent")
        seen[code] = {
            "appCode": code,
            **numbers,
            "lastOpenHeartbeatAtUTC": _timestamp(entry.get("lastOpenHeartbeatAtUTC")),
            "truncated": entry["truncated"],
        }
    if set(seen) != set(_PRESENCE_APP_CODES):
        raise ValueError("Presence app directory incomplete")

    allowed = {"appCode", "eid", "displayName", "appRole", "currentPage",
               "startedAtUTC", "lastHeartbeatAtUTC", "lastActiveAtUTC", "status"}
    safe_sessions = []
    for item in sessions:
        if not isinstance(item, dict):
            raise ValueError("Invalid presence session")
        code = item.get("appCode")
        status = item.get("status")
        eid = item.get("eid")
        name = item.get("displayName")
        role = item.get("appRole")
        page = item.get("currentPage")
        started = _timestamp(item.get("startedAtUTC"))
        heartbeat = _timestamp(item.get("lastHeartbeatAtUTC"))
        active = _timestamp(item.get("lastActiveAtUTC"))
        if (code not in seen or status not in _PRESENCE_STATUSES
            or type(eid) is not int or eid <= 0
            or not isinstance(name, str) or not name.strip() or len(name) > 200
            or not isinstance(role, str) or not role.strip() or len(role) > 50
            or (page is not None and (not isinstance(page, str) or len(page) > 100))
            or not (started and heartbeat and active)
            or not (started <= active <= heartbeat <= observed)):
            raise ValueError("Presence session contract invalid")
        heartbeat_age = (datetime.fromisoformat(observed) - datetime.fromisoformat(heartbeat)).total_seconds()
        activity_age = (datetime.fromisoformat(observed) - datetime.fromisoformat(active)).total_seconds()
        if heartbeat_age > 65*60 + 1 or (
            status == "RECENT_ACTIVITY" and (heartbeat_age > 121 or activity_age > 121)
        ) or (
            status == "RECENT_HEARTBEAT" and (heartbeat_age > 121 or activity_age <= 119)
        ) or (
            status == "IDLE_UNCONFIRMED" and heartbeat_age < 119
        ):
            raise ValueError("Presence data expired or inconsistent")
        safe_sessions.append({
            "appCode": code, "eid": eid, "displayName": name.strip(),
            "appRole": role.strip(), "currentPage": page.strip() if isinstance(page,str) else None,
            "startedAtUTC": started, "lastHeartbeatAtUTC": heartbeat,
            "lastActiveAtUTC": active, "status": status,
        })
        counts[code] += 1
    if any(counts[code] != min(seen[code]["recentSessions"], 50)
           for code in _PRESENCE_APP_CODES):
        raise ValueError("Presence detail count mismatch")
    return {
        "availability": "AVAILABLE", "source": "RIGGSDATAHUB_USAGE_SESSIONS",
        "observedAtUTC": observed,
        "activityWindowSeconds": 120, "idleWindowMinutes": 65,
        "maxSessionsPerApp": 50,
        "apps": [seen[code] for code in _PRESENCE_APP_CODES],
        "sessions": safe_sessions,
    }


def get_administration_presence(*, owner_eid: int, owner_oid: str) -> dict:
    result = {"readOnly": True, "availability": "UNVERIFIED", "source": "RIGGSDATAHUB_USAGE_SESSIONS"}
    try:
        return {"readOnly": True, **_sanitize_presence(
            get_bid_log_administration_presence(actor_eid=owner_eid, entra_object_id=owner_oid)
        )}
    except Exception as exc:
        result.update({"availability": "UNAVAILABLE", "reasonCode": _unavailability_code(exc)})
    return result


# Historic use is heartbeat-credited time for sessions STARTED in the selected
# Arizona calendar period. It is not login duration and cannot be reliably
# deduplicated across tabs/apps from cumulative session totals.
_LEADERBOARD_APPLICATIONS = frozenset({"ALL", "BID_LOG", "ACCOUNTING", "OPERATIONS"})
_LEADERBOARD_DAYS = frozenset({0, 7, 30, 90})
_LEADERBOARD_LIMIT = 200


def _leaderboard_nonnegative(value: object) -> int:
    # JavaScript must be able to represent every returned second/count exactly.
    if type(value) is not int or not 0 <= value <= 9_000_000_000_000:
        raise ValueError("Leaderboard integer invalid")
    return value


def _sanitize_leaderboard(payload: object, *, days: int, app_code: str) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Leaderboard data invalid")
    if (payload.get("source") != "RIGGSDATAHUB_USAGE_SESSIONS"
            or payload.get("metric") != "HEARTBEAT_CREDITED_ACTIVE_SECONDS"
            or payload.get("windowRule") != "SESSION_STARTED_IN_ARIZONA_WINDOW"
            or payload.get("overlapRule") != "SESSION_WINDOW_OVERLAP_WARNING_NOT_DEDUPED"
            or payload.get("readOnly") is not True
            or payload.get("windowDays") != days or payload.get("appCode") != app_code
            or payload.get("employeeLimit") != _LEADERBOARD_LIMIT
            or type(payload.get("employeesTruncated")) is not bool):
        raise ValueError("Leaderboard contract or filters invalid")
    observed = _timestamp(payload.get("observedAtUTC"))
    start = _timestamp(payload.get("windowStartUTC"))
    local_date = payload.get("windowStartArizonaDate")
    if not isinstance(local_date, str) or len(local_date) != 10:
        raise ValueError("Leaderboard Arizona start date invalid")
    try:
        if date.fromisoformat(local_date).isoformat() != local_date:
            raise ValueError("Bad local date")
    except ValueError as exc:
        raise ValueError("Leaderboard date invalid") from exc
    if not observed or not start or start > observed:
        raise ValueError("Leaderboard read instant invalid")
    count_fields = (
        "totalEmployees", "totalSessions", "totalRecordedActiveSeconds",
        "totalPossibleOverlapSessions", "carryInSessions", "excludedInvalidSessions",
    )
    totals = {key: _leaderboard_nonnegative(payload.get(key)) for key in count_fields}
    if (totals["totalPossibleOverlapSessions"] > totals["totalSessions"]
            or payload["employeesTruncated"] != (totals["totalEmployees"] > _LEADERBOARD_LIMIT)):
        raise ValueError("Leaderboard aggregate count invalid")
    incoming = payload.get("employees")
    if (not isinstance(incoming, list) or len(incoming) > _LEADERBOARD_LIMIT
            or len(incoming) != min(totals["totalEmployees"], _LEADERBOARD_LIMIT)):
        raise ValueError("Leaderboard employee cap invalid")
    employees = []
    seen = set()
    previous_seconds = previous_eid = None
    previous_rank = 0
    for row in incoming:
        if not isinstance(row, dict):
            raise ValueError("Leaderboard employee invalid")
        rank = _leaderboard_nonnegative(row.get("rank"))
        eid = _leaderboard_nonnegative(row.get("eid"))
        seconds = _leaderboard_nonnegative(row.get("recordedActiveSeconds"))
        sessions = _leaderboard_nonnegative(row.get("sessionCount"))
        apps = _leaderboard_nonnegative(row.get("appsUsed"))
        overlaps = _leaderboard_nonnegative(row.get("possibleOverlapSessions"))
        name = row.get("displayName")
        if (eid <= 0 or eid in seen or sessions <= 0 or not 1 <= apps <= 3
                or overlaps > sessions or rank <= 0
                or (name is not None and (not isinstance(name, str)
                    or not name.strip() or len(name) > 200))):
            raise ValueError("Leaderboard employee values invalid")
        next_rank = previous_rank + (1 if previous_seconds is None or seconds < previous_seconds else 0)
        if (rank != next_rank
                or (previous_seconds is not None and (seconds > previous_seconds
                    or (seconds == previous_seconds and eid <= previous_eid)))):
            raise ValueError("Leaderboard ranking invalid")
        employees.append({
            "rank": rank, "eid": eid,
            "displayName": name.strip() if name is not None else None,
            "recordedActiveSeconds": seconds, "sessionCount": sessions,
            "appsUsed": apps, "possibleOverlapSessions": overlaps,
        })
        seen.add(eid)
        previous_seconds, previous_eid, previous_rank = seconds, eid, rank
    if totals["totalEmployees"] <= _LEADERBOARD_LIMIT:
        for key, employee_key in (
            ("totalSessions", "sessionCount"),
            ("totalRecordedActiveSeconds", "recordedActiveSeconds"),
            ("totalPossibleOverlapSessions", "possibleOverlapSessions"),
        ):
            if totals[key] != sum(row[employee_key] for row in employees):
                raise ValueError("Leaderboard totals disagree")
    return {
        "readOnly": True, "availability": "AVAILABLE",
        "source": "RIGGSDATAHUB_USAGE_SESSIONS",
        "metric": "HEARTBEAT_CREDITED_ACTIVE_SECONDS",
        "windowRule": "SESSION_STARTED_IN_ARIZONA_WINDOW",
        "overlapRule": "SESSION_WINDOW_OVERLAP_WARNING_NOT_DEDUPED",
        "observedAtUTC": observed, "windowStartUTC": start,
        "windowStartArizonaDate": local_date, "windowDays": days, "appCode": app_code,
        "employeeLimit": _LEADERBOARD_LIMIT,
        "employeesTruncated": payload["employeesTruncated"],
        **totals, "employees": employees,
    }


def get_administration_leaderboard(
    *, owner_eid: int, owner_oid: str, days: int, app_code: str,
) -> dict:
    # The route already proves the signed owner; still fail closed on invalid
    # selectors, and never publish fake empty result sets after an outage.
    if type(days) is not int or days not in _LEADERBOARD_DAYS or app_code not in _LEADERBOARD_APPLICATIONS:
        raise ValueError("Leaderboard selection invalid")
    unavailable = {
        "readOnly": True, "availability": "UNAVAILABLE",
        "source": "RIGGSDATAHUB_USAGE_SESSIONS",
        "windowDays": days, "appCode": app_code,
    }
    try:
        raw = get_bid_log_administration_leaderboard(
            actor_eid=owner_eid, entra_object_id=owner_oid,
            days=days, app_code=app_code,
        )
        return _sanitize_leaderboard(raw, days=days, app_code=app_code)
    except ValueError:
        return {**unavailable, "reasonCode": "INVALID_RESPONSE"}
    except Exception as exc:
        return {**unavailable, "reasonCode": _unavailability_code(exc)}
