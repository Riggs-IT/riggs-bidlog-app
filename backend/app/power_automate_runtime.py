"""Opt-in, selected-flow-only Power Automate runtime compatibility adapter.

Microsoft does not support api.flow.microsoft.com as a public contract. This
adapter is deliberately disabled by default and MUST NOT be treated as the
source of 24/7 monitoring, all-tenant historical completeness or SQL commit.
It never returns connector inputs, outputs, error messages or credentials.
"""
from __future__ import annotations

from urllib.parse import quote
from typing import Any
import re

import httpx

from .power_automate_monitoring import (
    PowerPlatformReadError, _environment_id, _uuid, _instant,
)

ROOT = "https://api.flow.microsoft.com"
VERSION = "2016-11-01"
_SAFE_RUN_NAME = re.compile(r"[A-Za-z0-9_-]{1,180}\Z")
_STATUSES = {
    "succeeded": "SUCCEEDED", "failed": "FAILED", "running": "RUNNING",
    "cancelled": "CANCELLED", "canceled": "CANCELLED", "timedout": "TIMEDOUT",
    "timed out": "TIMEDOUT", "waiting": "WAITING", "skipped": "SKIPPED",
}


def _run_id(value: Any) -> str | None:
    if not isinstance(value, str) or len(value) > 512:
        return None
    candidate = value.rsplit("/runs/", 1)[-1] if "/runs/" in value else value
    return candidate if _SAFE_RUN_NAME.fullmatch(candidate) else None


def _normalize_runtime_run(row: Any, environment_id: str, resource_id: str) -> dict | None:
    if not isinstance(row, dict):
        return None
    full = row.get("id")
    if isinstance(full, str) and "/" in full:
        # A returned complete resource path, when supplied, must match the
        # EXACT selected flow and environment. No name-based attribution.
        expected = (
            "/providers/Microsoft.ProcessSimple/environments/"
            f"{environment_id}/flows/{resource_id}/runs/"
        ).lower()
        if not full.lower().startswith(expected):
            return None
    props = row.get("properties")
    if not isinstance(props, dict):
        return None
    candidate_id = _run_id(row.get("name")) or _run_id(row.get("id"))
    started = _instant(props.get("startTime") or props.get("startedAt"))
    if not candidate_id or not started:
        return None
    raw_state = props.get("status") or row.get("status")
    status = _STATUSES.get(raw_state.strip().lower(), "UNKNOWN") if isinstance(raw_state, str) else "UNKNOWN"
    return {
        "runId": candidate_id,
        "status": status,
        "startedAtUTC": started,
        "endedAtUTC": _instant(props.get("endTime") or props.get("endedAt")),
    }


class FlowRuntimeReadClient:
    """Fixed-host, fail-closed GET for one flow and up to 20 returned runs."""

    def __init__(self, *, delegated_access_token: str, client: httpx.Client | None = None):
        if not isinstance(delegated_access_token, str) or not 10 <= len(delegated_access_token) <= 50000:
            raise PowerPlatformReadError("DELEGATED_TOKEN_REQUIRED")
        self._token = delegated_access_token
        self._own_client = client is None
        self._client = client or httpx.Client(
            timeout=httpx.Timeout(7.0, connect=3.0), trust_env=False,
            follow_redirects=False,
        )

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self._token = ""
        if self._own_client:
            self._client.close()

    def selected_runs(self, environment_id: str, flow_id: str) -> dict:
        env = _environment_id(environment_id)
        flow = _uuid(flow_id)
        if not flow:
            raise PowerPlatformReadError("INVALID_WORKFLOW_ID")
        # No caller-selected URLs or nextLink following; one GET only.
        url = (f"{ROOT}/providers/Microsoft.ProcessSimple/environments/"
               f"{quote(env, safe='')}/flows/{flow}/runs")
        try:
            response = self._client.get(
                url, params={"api-version": VERSION, "$top": "20"},
                headers={"Authorization": f"Bearer {self._token}", "Accept": "application/json"},
                follow_redirects=False,
            )
        except httpx.RequestError:
            raise PowerPlatformReadError("NETWORK_UNAVAILABLE") from None
        if response.status_code == 401:
            raise PowerPlatformReadError("RUNTIME_TOKEN_REJECTED")
        if response.status_code == 403:
            raise PowerPlatformReadError("ACCESS_DENIED")
        if response.status_code == 404:
            raise PowerPlatformReadError("RUNTIME_FLOW_NOT_FOUND")
        if response.status_code == 429:
            raise PowerPlatformReadError("THROTTLED")
        if response.status_code in (500, 502, 503, 504):
            raise PowerPlatformReadError("UPSTREAM_UNAVAILABLE")
        if response.status_code != 200 or len(response.content) > 500_000:
            raise PowerPlatformReadError("INVALID_RESPONSE")
        try:
            body = response.json()
        except (ValueError, UnicodeError):
            raise PowerPlatformReadError("INVALID_RESPONSE") from None
        if not isinstance(body, dict) or not isinstance(body.get("value"), list):
            raise PowerPlatformReadError("INVALID_RESPONSE")
        rows = body["value"]
        if len(rows) > 20:
            raise PowerPlatformReadError("RESPONSE_TOO_LARGE")
        result = []
        skipped = 0
        for row in rows:
            normalized = _normalize_runtime_run(row, env, flow)
            if normalized is None:
                skipped += 1
            else:
                result.append(normalized)
        result.sort(key=lambda r: r["startedAtUTC"], reverse=True)
        # If all returned rows fail normalization, don't present an empty
        # success result; no inferred history or green marker.
        if skipped and not result:
            raise PowerPlatformReadError("RUN_DATA_UNVERIFIABLE")
        success = [r["endedAtUTC"] or r["startedAtUTC"] for r in result if r["status"] == "SUCCEEDED"]
        has_more = bool(body.get("nextLink") or body.get("@odata.nextLink")) or len(rows) >= 20
        return {
            "availability": "PARTIAL" if has_more or skipped else "AVAILABLE" if result else "NO_RUNS_REPORTED",
            "runs": result,
            "hasMore": has_more if result else (None if skipped else has_more),
            "invalidRows": skipped,
            "lastSuccessInReturnedSampleUTC": max(success) if success else None,
            "coverage": "BOUNDED_SELECTED_FLOW_SAMPLE_ONLY",
            "reasonCode": "RUNTIME_EXACT_RESOURCE_ENDPOINT" if result else "NO_RUNS_REPORTED",
            "provider": "UNSUPPORTED_RUNTIME_COMPATIBILITY",
        }
