"""Stage F0: bounded read-only Power Platform API client for Riggs Administration.

UNWIRED ON PURPOSE. The calling Bid Log backend MUST first enforce the existing
owner-only Administration gate (later: the explicit two-administrator allowlist)
and must obtain a Power Platform API delegated access token for that same signed
in Entra identity. Never pass browser-chosen OIDs or user-provided endpoints.

No route, OAuth callback, token store, flow mutation or background worker is
installed by this module. Callers must never persist bearer tokens in Starlette
SessionMiddleware cookies, localStorage, SQL error logs or browser responses.

The 2024-10-01 Power Platform API may omit environments without Dataverse;
coverage is always explicit and cannot be called tenant-wide without proof.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit
from uuid import UUID
import re

import httpx


API_ROOT = "https://api.powerplatform.com"
API_VERSION = "2024-10-01"
ENV_PATH = "/environmentmanagement/environments"
SAFE_ENV_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9-]{0,95}\Z")
_ALLOWED_STATES = {"DRAFT", "PUBLISHED", "ACTIVATED", "SUSPENDED", "OFF", "ON"}
_ALLOWED_RUN_STATUS = {"SUCCEEDED", "FAILED", "RUNNING", "CANCELLED", "TIMEDOUT", "SKIPPED", "WAITING"}


class PowerPlatformReadError(Exception):
    """Only safe codes; never emit exception strings or HTTP response bodies."""
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _text(value: Any, limit: int = 120) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    if not cleaned or len(cleaned) > limit:
        return None
    # Keep arbitrary connector input out of the diagnostic display.
    if any(ord(c) < 32 for c in cleaned):
        return None
    return cleaned


def _uuid(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        u = UUID(value)
    except (TypeError, ValueError, AttributeError):
        return None
    return str(u) if u.int else None


def _instant(value: Any) -> str | None:
    if not isinstance(value, str) or len(value) > 48:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.utcoffset() is None:
            return None
        return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    except (ValueError, OverflowError):
        return None


def _environment_id(raw: Any) -> str:
    if not isinstance(raw, str) or not SAFE_ENV_ID.fullmatch(raw):
        raise PowerPlatformReadError("INVALID_ENVIRONMENT_ID")
    return raw


def _state(value: Any, valid: set[str]) -> str:
    if isinstance(value, str):
        state = value.strip().upper()
        if state in valid:
            return state
    # Do not infer On/Off from undocumented numeric API statuses.
    return "UNKNOWN"


def _normalize_environment(row: Any) -> dict | None:
    if not isinstance(row, dict):
        return None
    raw_id = row.get("id")
    if not isinstance(raw_id, str) or not SAFE_ENV_ID.fullmatch(raw_id):
        return None
    return {
        "environmentId": raw_id,
        "displayName": _text(row.get("displayName"), 160) or "Unnamed environment",
        "environmentType": _text(row.get("type"), 36),
        "hasDataverse": bool(row.get("dataverseId")) if "dataverseId" in row else None,
    }


def _normalize_flow(row: Any, environment_id: str) -> dict | None:
    if not isinstance(row, dict):
        return None
    # The cloud-flow reference doesn't currently publish a full 200 schema.
    # Do not fabricate a GUID or a status when one cannot be verified.
    workflow_id = _uuid(row.get("workflowId")) or _uuid(row.get("workflowid"))
    if not workflow_id:
        workflow_id = _uuid(row.get("id")) or _uuid(row.get("name"))
    if not workflow_id:
        return None
    return {
        "environmentId": environment_id,
        "workflowId": workflow_id,
        "name": _text(row.get("displayName"), 180)
            or _text(row.get("name"), 180)
            or "Unnamed flow",
        "platformState": _state(row.get("stateCode", row.get("statecode")), _ALLOWED_STATES),
        "modifiedAtUTC": _instant(row.get("modifiedOn") or row.get("modifiedon")),
        "lastRunAtUTC": None,  # Never infer a run from modifiedOn.
        "lastRunState": "NOT_COLLECTED",
    }


def _normalize_run(row: Any) -> dict | None:
    if not isinstance(row, dict):
        return None
    run_id = _text(row.get("runId") or row.get("id") or row.get("name"), 180)
    if not run_id:
        return None
    return {
        "runId": run_id,
        "status": _state(row.get("status") or row.get("state"), _ALLOWED_RUN_STATUS),
        "startedAtUTC": _instant(row.get("startTime") or row.get("startedOn") or row.get("startDateTime")),
        "endedAtUTC": _instant(row.get("endTime") or row.get("endedOn") or row.get("endDateTime")),
    }


def _http_code(status: int) -> str:
    if status == 401:
        return "RECONNECT_REQUIRED"
    if status == 403:
        return "ACCESS_DENIED"
    if status == 404:
        return "NO_DATAVERSE_OR_NOT_FOUND"
    if status == 429:
        return "THROTTLED"
    if status in (500, 502, 503, 504):
        return "UPSTREAM_UNAVAILABLE"
    return "UNEXPECTED_STATUS"


class PowerPlatformReadClient:
    """One request-scoped read client. Never store credentials globally."""

    def __init__(self, *, delegated_access_token: str, client: httpx.Client | None = None):
        if not isinstance(delegated_access_token, str) or not 10 <= len(delegated_access_token) <= 50000:
            raise PowerPlatformReadError("DELEGATED_TOKEN_REQUIRED")
        self._token = delegated_access_token
        self._owned_client = client is None
        self._client = client or httpx.Client(
            timeout=httpx.Timeout(5.0, connect=3.0),
            trust_env=False,
            follow_redirects=False,
        )

    def close(self) -> None:
        self._token = ""
        if self._owned_client:
            self._client.close()

    def __enter__(self) -> "PowerPlatformReadClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    @staticmethod
    def _verify_url(url: str, *, path: str, expected_workflow_id: str | None = None) -> None:
        # Verifies ALL API-supplied pagination URLs before attaching bearer auth.
        try:
            parsed = urlsplit(url)
            query = parse_qs(parsed.query, keep_blank_values=True)
            if not (
                parsed.scheme == "https"
                and parsed.netloc == "api.powerplatform.com"
                and parsed.path == path
                and not parsed.fragment
                and query.get("api-version") == [API_VERSION]
            ):
                raise ValueError
            if expected_workflow_id and query.get("workflowId") != [expected_workflow_id]:
                raise ValueError
        except (ValueError, TypeError, AttributeError) as exc:
            raise PowerPlatformReadError("INVALID_CONTINUATION_URL") from None

    def _get(self, url: str) -> dict | None:
        if not self._token:
            raise PowerPlatformReadError("DELEGATED_TOKEN_REQUIRED")
        try:
            response = self._client.get(
                url,
                headers={
                    "Authorization": f"Bearer {self._token}",
                    "Accept": "application/json",
                },
                follow_redirects=False,
            )
        except httpx.RequestError:
            raise PowerPlatformReadError("NETWORK_UNAVAILABLE") from None
        if response.status_code == 204:
            return None
        if response.status_code != 200:
            raise PowerPlatformReadError(_http_code(response.status_code))
        if len(response.content) > 2_000_000:
            raise PowerPlatformReadError("RESPONSE_TOO_LARGE")
        try:
            result = response.json()
        except (ValueError, UnicodeError):
            raise PowerPlatformReadError("INVALID_RESPONSE") from None
        if not isinstance(result, dict):
            raise PowerPlatformReadError("INVALID_RESPONSE")
        return result

    def _pages(
        self, *, start: str, path: str, max_pages: int,
        max_items: int, workflow_id: str | None = None,
    ) -> dict:
        url: str | None = start
        visited: set[str] = set()
        rows: list[dict] = []
        reason: str | None = None
        more = False
        for _ in range(max_pages):
            if not url:
                break
            self._verify_url(url, path=path, expected_workflow_id=workflow_id)
            if url in visited:
                reason = "REPEATED_CONTINUATION"
                more = True
                break
            visited.add(url)
            try:
                payload = self._get(url)
            except PowerPlatformReadError as exc:
                if not rows:
                    raise
                reason = exc.code
                more = True
                break
            if payload is None:
                url = None
                break
            batch = payload.get("value")
            if not isinstance(batch, list) or any(not isinstance(x, dict) for x in batch):
                if not rows:
                    raise PowerPlatformReadError("INVALID_RESPONSE")
                reason = "INVALID_RESPONSE"
                more = True
                break
            remaining = max_items - len(rows)
            rows.extend(batch[:remaining])
            next_url = payload.get("@odata.nextLink") or payload.get("@odata.nextlink")
            if next_url is not None and (not isinstance(next_url, str) or len(next_url) > 4096):
                reason = "INVALID_RESPONSE"
                more = True
                break
            if len(batch) > remaining or (len(rows) >= max_items and next_url):
                reason = "BOUNDED_LIMIT"
                more = True
                break
            url = next_url
        else:
            if url:
                more = True
                reason = "PAGE_LIMIT"
        return {"rows": rows, "hasMore": more, "partialReason": reason}

    def list_environments(self) -> dict:
        """Discover caller-visible environments; NOT tenant-wide enumeration."""
        start = f"{API_ROOT}{ENV_PATH}?{urlencode({'api-version': API_VERSION, '$top': '100'})}"
        try:
            data = self._pages(start=start, path=ENV_PATH, max_pages=3, max_items=150)
        except PowerPlatformReadError as exc:
            return {"availability": exc.code, "environments": [], "hasMore": None}
        envs = [_normalize_environment(x) for x in data["rows"]]
        dropped = sum(e is None for e in envs)
        return {
            "availability": "PARTIAL" if (data["hasMore"] or dropped) else "AVAILABLE",
            "environments": [e for e in envs if e is not None],
            "hasMore": bool(data["hasMore"]),
            "invalidRows": dropped,
            "coverage": "CONNECTED_USER_ACCESSIBLE_ONLY",
        }

    def list_flows(self, environment_id: str) -> dict:
        """Read one selected environment. Never automatically query all run histories."""
        env = _environment_id(environment_id)
        path = f"/powerautomate/environments/{env}/cloudFlows"
        start = f"{API_ROOT}{path}?api-version={API_VERSION}"
        try:
            data = self._pages(start=start, path=path, max_pages=4, max_items=250)
        except PowerPlatformReadError as exc:
            return {"environmentId": env, "availability": exc.code, "flows": [], "hasMore": None}
        flows = [_normalize_flow(x, env) for x in data["rows"]]
        dropped = sum(f is None for f in flows)
        return {
            "environmentId": env,
            "availability": "PARTIAL" if (data["hasMore"] or dropped) else "AVAILABLE",
            "flows": [f for f in flows if f is not None],
            "invalidRows": dropped,
            "hasMore": bool(data["hasMore"]),
            "coverage": "SELECTED_ENVIRONMENT_ONLY",
        }

    def list_runs(self, environment_id: str, workflow_id: str) -> dict:
        """Read selected flow only; 20 recent returned records at most."""
        env = _environment_id(environment_id)
        flow = _uuid(workflow_id)
        if not flow:
            raise PowerPlatformReadError("INVALID_WORKFLOW_ID")
        path = f"/powerautomate/environments/{env}/flowRuns"
        start = f"{API_ROOT}{path}?{urlencode({'workflowId': flow, 'api-version': API_VERSION})}"
        try:
            data = self._pages(
                start=start, path=path, max_pages=2, max_items=20, workflow_id=flow,
            )
        except PowerPlatformReadError as exc:
            return {"environmentId": env, "workflowId": flow,
                    "availability": exc.code, "runs": [], "hasMore": None}
        runs = [_normalize_run(x) for x in data["rows"]]
        dropped = sum(r is None for r in runs)
        normalized = [r for r in runs if r is not None]
        successes = [r["endedAtUTC"] for r in normalized
                     if r["status"] == "SUCCEEDED" and r["endedAtUTC"]]
        return {
            "environmentId": env, "workflowId": flow,
            "availability": "PARTIAL" if (data["hasMore"] or dropped) else "AVAILABLE",
            "runs": normalized,
            "lastSuccessInReturnedSampleUTC": max(successes) if successes else None,
            "hasMore": bool(data["hasMore"]), "invalidRows": dropped,
            "coverage": "BOUNDED_SELECTED_FLOW_SAMPLE_ONLY",
        }
