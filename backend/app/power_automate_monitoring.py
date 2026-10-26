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
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit
from uuid import UUID
import re

import httpx


API_ROOT = "https://api.powerplatform.com"
API_VERSION = "2024-10-01"
ENV_PATH = "/environmentmanagement/environments"
RESOURCE_QUERY_URL = f"{API_ROOT}/resourcequery/resources/query?api-version={API_VERSION}"
RESOURCE_QUERY_PATH = "/resourcequery/resources/query"
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
    workflow_id = _uuid(row.get("workflowId")) or _uuid(row.get("workflowid")) or _uuid(row.get("resourceId"))
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


def _normalize_resource_flow(row: Any) -> dict | None:
    """Normalize only documented PowerPlatformResources cloud-flow columns.

    `name` is the resource identity; `workflowEntityId` is a separate
    Dataverse field and MUST NOT silently replace the resource identity.
    """
    if not isinstance(row, dict) or not isinstance(row.get("type"), str) or row["type"].lower() != "microsoft.powerautomate/cloudflows":
        return None
    props = row.get("properties")
    if not isinstance(props, dict):
        return None
    resource_id = _uuid(row.get("name"))
    env = props.get("environmentId")
    if not resource_id or not isinstance(env, str) or not SAFE_ENV_ID.fullmatch(env):
        return None
    return {
        "environmentId": env,
        "workflowId": resource_id,
        "name": _text(props.get("displayName"), 180) or "Unnamed flow",
        "platformState": "UNKNOWN",  # Not published in ARG inventory contract.
        "modifiedAtUTC": _instant(props.get("lastModifiedAt")),
        "lastRunAtUTC": None,
        "lastRunState": "NOT_COLLECTED",
        "inventorySource": "TENANT_RESOURCE_QUERY",
        # ARG identity may differ from Dataverse workflowEntityId.
        "runLookupVerified": False,
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

    def list_flows(self, environment_id: str, *, max_pages: int = 4, max_items: int = 250) -> dict:
        """Read one environment. Never automatically query run histories."""
        env = _environment_id(environment_id)
        path = f"/powerautomate/environments/{env}/cloudFlows"
        start = f"{API_ROOT}{path}?api-version={API_VERSION}"
        try:
            data = self._pages(start=start, path=path, max_pages=max_pages, max_items=max_items)
        except PowerPlatformReadError as exc:
            return {"environmentId": env, "availability": exc.code, "flows": [], "hasMore": None}
        flows = [_normalize_flow(x, env) for x in data["rows"]]
        dropped = sum(f is None for f in flows)
        return {
            "environmentId": env,
            "availability": "PARTIAL" if (data["hasMore"] or dropped) else "AVAILABLE",
            "flows": [f for f in flows if f is not None],
            "invalidRows": dropped,
            "upstreamRowsSeen": len(data["rows"]),
            "hasMore": bool(data["hasMore"]),
            "coverage": "SELECTED_ENVIRONMENT_ONLY",
        }

    def _list_environment_inventory(self) -> dict:
        """Bounded, user-scoped inventory across accessible environments.

        A zero from this Dataverse-oriented API is NOT proof that the user has
        no Power Automate flows. Return per-environment coverage evidence and
        never silently call an unverified response a complete tenant inventory.
        No run reads, writes, or extra credentials are used here.
        """
        discovered = self.list_environments()
        if discovered.get("availability") not in ("AVAILABLE", "PARTIAL"):
            return {
                "availability": discovered.get("availability", "INVALID_RESPONSE"),
                "coverage": "BOUNDED_ACCESSIBLE_ENVIRONMENTS_ONLY",
                "flows": [], "environments": [], "hasMore": None,
                "coverageComplete": False,
            }
        environments = discovered.get("environments", [])
        if not isinstance(environments, list):
            raise PowerPlatformReadError("INVALID_RESPONSE")
        # Hard limits bound Microsoft traffic and the Cloud Run request time.
        selected = environments[:6]
        sources = []
        all_rows = []
        incomplete = (discovered["availability"] == "PARTIAL" or len(environments) > 6)

        def fetch(env):
            return self.list_flows(env["environmentId"], max_pages=2, max_items=100)

        # httpx.Client allows simultaneous reads. No tokens appear in output.
        with ThreadPoolExecutor(max_workers=3) as executor:
            results = list(executor.map(fetch, selected))

        for env, result in zip(selected, results):
            status = result.get("availability", "INVALID_RESPONSE")
            entries = result.get("flows", [])
            count = len(entries) if status in ("AVAILABLE", "PARTIAL") else None
            sources.append({
                "environmentId": env["environmentId"],
                "environmentName": env["displayName"],
                "hasDataverse": env["hasDataverse"],
                "availability": status,
                "flowsReturned": count,
                "upstreamRowsSeen": result.get("upstreamRowsSeen"),
                "invalidRows": result.get("invalidRows"),
                "hasMore": result.get("hasMore"),
            })
            if status != "AVAILABLE" or result.get("hasMore"):
                incomplete = True
            if status in ("AVAILABLE", "PARTIAL"):
                for flow in entries:
                    all_rows.append({**flow, "environmentName": env["displayName"]})
        # User asked for the most recent first. We can only order by *modified*
        # until actual run timestamps are collected for each flow.
        all_rows.sort(key=lambda x: x.get("modifiedAtUTC") or "", reverse=True)
        if len(all_rows) > 300:
            all_rows = all_rows[:300]
            incomplete = True
        if not all_rows:
            # An empty provider response is NOT verified absence from Power Automate.
            availability = "UNVERIFIED_EMPTY" if environments else "NO_ENVIRONMENTS_RETURNED"
        else:
            availability = "PARTIAL" if incomplete else "AVAILABLE"
        return {
            "availability": availability,
            "coverage": "BOUNDED_ACCESSIBLE_ENVIRONMENTS_ONLY",
            "flows": all_rows,
            "environments": sources,
            "hasMore": incomplete,
            "coverageComplete": False,  # Unsupported/non-Dataverse flows may exist.
            "sortBasis": "MODIFIED_TIME_NOT_RUN_TIME",
            "environmentCountDiscovered": len(environments),
            "environmentCountChecked": len(selected),
            "flowCountReturned": len(all_rows),
        }

    def query_tenant_inventory(self) -> dict:
        """Query supported Power Platform ARG inventory under delegated user auth.

        This is an HTTP POST *read query* with fixed clauses. There are no
        caller-supplied KQL fragments, mutations, raw connector data or secrets.
        The signed-in user must independently have a supported tenant role.
        """
        base = {
            "availability": "UNVERIFIED", "flows": [], "hasMore": None,
            "invalidRows": 0, "upstreamRowsSeen": 0,
            "coverage": "DELEGATED_TENANT_ADMIN_VISIBLE_ONLY",
        }
        seen_tokens: set[str] = set()
        skip_token = None
        rows: list[dict] = []
        invalid = 0
        more = False
        total = None
        for i in range(3):
            options: dict[str, Any] = {"Top": 100}
            if skip_token:
                options["SkipToken"] = skip_token
            body = {
                "TableName": "PowerPlatformResources",
                "Clauses": [{"$type": "where", "FieldName": "type", "Operator": "==",
                             "Values": ["'microsoft.powerautomate/cloudflows'"]},
                            {"$type": "orderby", "FieldNamesAscDesc": {
                                "tostring(properties.lastModifiedAt)": "desc"}}],
                "Options": options,
            }
            try:
                response = self._client.post(
                    RESOURCE_QUERY_URL,
                    json=body,
                    headers={"Authorization": f"Bearer {self._token}",
                             "Accept": "application/json"},
                    follow_redirects=False,
                )
            except httpx.RequestError:
                return {**base, "availability": "NETWORK_UNAVAILABLE" if not rows else "PARTIAL",
                        "flows": rows, "invalidRows": invalid,
                        "upstreamRowsSeen": len(rows) + invalid, "hasMore": True}
            if response.status_code != 200:
                return {**base, "availability": _http_code(response.status_code) if not rows else "PARTIAL",
                        "flows": rows, "invalidRows": invalid,
                        "upstreamRowsSeen": len(rows) + invalid,
                        "hasMore": True if rows else None, "providerError": _http_code(response.status_code)}
            if len(response.content) > 2_000_000:
                return {**base, "availability": "RESPONSE_TOO_LARGE" if not rows else "PARTIAL",
                        "flows": rows, "invalidRows": invalid, "hasMore": bool(rows)}
            try:
                payload = response.json()
            except (ValueError, UnicodeError):
                return {**base, "availability": "INVALID_RESPONSE" if not rows else "PARTIAL",
                        "flows": rows, "invalidRows": invalid, "hasMore": bool(rows)}
            if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
                return {**base, "availability": "INVALID_RESPONSE" if not rows else "PARTIAL",
                        "flows": rows, "invalidRows": invalid, "hasMore": bool(rows)}
            if len(payload["data"]) > 100 or any(not isinstance(item, dict) for item in payload["data"]):
                return {**base, "availability": "INVALID_RESPONSE" if not rows else "PARTIAL",
                        "flows": rows, "invalidRows": invalid, "hasMore": bool(rows)}
            for raw in payload["data"]:
                item = _normalize_resource_flow(raw)
                if item is None:
                    invalid += 1
                else:
                    rows.append(item)
            tr = payload.get("totalRecords")
            if isinstance(tr, int) and tr >= 0:
                total = tr
            candidate = payload.get("skipToken")
            if candidate and (not isinstance(candidate, str) or len(candidate) > 4096
                              or candidate in seen_tokens):
                return {**base, "availability": "PARTIAL", "flows": rows,
                        "invalidRows": invalid, "upstreamRowsSeen": len(rows) + invalid,
                        "hasMore": True, "providerError": "INVALID_CONTINUATION_TOKEN"}
            if not candidate:
                more = bool(total is not None and total > len(rows) + invalid)
                break
            seen_tokens.add(candidate)
            skip_token = candidate
            more = True
        return {
            **base,
            "availability": "PARTIAL" if more or invalid else "AVAILABLE",
            "flows": rows, "hasMore": more, "invalidRows": invalid,
            "upstreamRowsSeen": len(rows) + invalid,
            "totalRecords": total,
        }

    def list_accessible_inventory(self) -> dict:
        """Merge documented tenant inventory with legacy per-environment reads.

        A 403 to the tenant inventory does NOT fall back to a verified zero.
        De-duplicate only on matching environment and resource GUID, never names.
        """
        with ThreadPoolExecutor(max_workers=2) as executor:
            legacy_f = executor.submit(self._list_environment_inventory)
            tenant_f = executor.submit(self.query_tenant_inventory)
            legacy = legacy_f.result()
            tenant = tenant_f.result()

        env_map = {e.get("environmentId"): e.get("environmentName")
                   for e in legacy.get("environments", []) if isinstance(e, dict)}
        merged = {}
        for record in legacy.get("flows", []):
            key = (record.get("environmentId"), record.get("workflowId"))
            if all(key) and key not in merged:
                merged[key] = {**record, "inventorySource": "ENVIRONMENT_FLOW_API",
                               "runLookupVerified": True}
        duplicates = 0
        for record in tenant.get("flows", []):
            key = (record.get("environmentId"), record.get("workflowId"))
            if not all(key):
                continue
            if key in merged:
                duplicates += 1
                if not merged[key].get("modifiedAtUTC") and record.get("modifiedAtUTC"):
                    merged[key]["modifiedAtUTC"] = record["modifiedAtUTC"]
                merged[key]["inventorySource"] = "BOTH_VERIFIED_IDENTITIES"
            else:
                merged[key] = {**record, "environmentName":
                               env_map.get(record["environmentId"]) or "Environment name unavailable"}
        combined = sorted(merged.values(), key=lambda x: x.get("modifiedAtUTC") or "", reverse=True)
        truncated = len(combined) > 300
        combined = combined[:300]
        provider_partial = tenant["availability"] not in ("AVAILABLE",) or legacy.get("availability") not in ("AVAILABLE",)
        incomplete = truncated or bool(tenant.get("hasMore")) or bool(legacy.get("hasMore")) or provider_partial
        if combined:
            availability = "PARTIAL" if incomplete else "AVAILABLE"
        elif tenant.get("availability") in ("AVAILABLE", "PARTIAL") or legacy.get("availability") in ("AVAILABLE", "PARTIAL", "UNVERIFIED_EMPTY", "NO_ENVIRONMENTS_RETURNED"):
            availability = "UNVERIFIED_EMPTY"
        else:
            availability = "UNAVAILABLE"
        return {
            **legacy,
            "availability": availability,
            "flows": combined, "hasMore": incomplete,
            "flowCountReturned": len(combined),
            "coverage": "BOUNDED_ACCESSIBLE_ENVIRONMENTS_ONLY",  # UI contract; see providers.
            "coverageComplete": False,
            "sortBasis": "MODIFIED_TIME_NOT_RUN_TIME",
            "deduplicatedExactIds": duplicates,
            "providerResults": [
                {"provider": "POWER_PLATFORM_TENANT_INVENTORY", "availability": tenant["availability"],
                 "rows": len(tenant["flows"]), "upstreamRowsSeen": tenant.get("upstreamRowsSeen"),
                 "hasMore": tenant.get("hasMore")},
                {"provider": "DATAVERSE_ENVIRONMENT_API", "availability": legacy.get("availability", "UNVERIFIED"),
                 "rows": legacy.get("flowCountReturned", 0),
                 "hasMore": legacy.get("hasMore")},
            ],
        }

    def inspect_flow(self, environment_id: str, resource_id: str) -> dict:
        """Read ONLY one selected inventory identity and its bounded runs.

        The tenant inventory `name` is a resource ID, potentially different
        from the `workflowId` used by the flowRuns API. A filtered Microsoft
        cloudFlows read may resolve this discrepancy. No browser-provided SQL,
        KQL, provider URL or flow definition is ever accepted or exposed.
        """
        env = _environment_id(environment_id)
        resource = _uuid(resource_id)
        if not resource:
            raise PowerPlatformReadError("INVALID_WORKFLOW_ID")

        path = f"/powerautomate/environments/{env}/cloudFlows"
        lookup = f"{API_ROOT}{path}?{urlencode({'resourceId': resource, 'api-version': API_VERSION})}"
        detail = {"availability": "UNVERIFIED_EMPTY", "platformState": "UNKNOWN",
                  "modifiedAtUTC": None, "stateSource": "NOT_VERIFIED"}
        run_identity = resource
        identity_source = "TENANT_RESOURCE_ID_UNVERIFIED"
        try:
            payload = self._get(lookup)
        except PowerPlatformReadError as exc:
            detail["availability"] = exc.code
            # Microsoft specifically documents 404 for environments without
            # Dataverse. Avoid redundant run reads and inaccurate zeroes.
            if exc.code in ("NO_DATAVERSE_OR_NOT_FOUND", "ACCESS_DENIED", "THROTTLED",
                            "RECONNECT_REQUIRED", "NETWORK_UNAVAILABLE", "UPSTREAM_UNAVAILABLE"):
                return {"environmentId": env, "resourceId": resource,
                        "details": detail, "runIdentitySource": "NOT_CHECKED",
                        "runHistory": {"availability": "NOT_CHECKED", "runs": [],
                                       "hasMore": None}}
        else:
            if payload is not None:
                rows = payload.get("value")
                if not isinstance(rows, list) or len(rows) > 100 or any(
                    not isinstance(item, dict) for item in rows
                ):
                    detail["availability"] = "INVALID_RESPONSE"
                else:
                    # A scoped provider query must still return a matching ID.
                    # A flow with the same display name is never an identity match.
                    for row in rows:
                        direct_resource = _uuid(row.get("resourceId") or row.get("resourceid"))
                        # An explicit, different resource ID wins over coincidental
                        # workflow/name matches; never inspect the wrong flow.
                        if direct_resource and direct_resource != resource:
                            continue
                        ids = (direct_resource, _uuid(row.get("id")),
                               _uuid(row.get("name")), _uuid(row.get("workflowId"))
                               or _uuid(row.get("workflowid")))
                        if resource not in ids:
                            continue
                        flow = _normalize_flow(row, env)
                        if flow is None:
                            continue
                        detail = {"availability": "AVAILABLE",
                                  "platformState": flow["platformState"],
                                  "modifiedAtUTC": flow["modifiedAtUTC"],
                                  "stateSource": "DIRECT_CLOUD_FLOW_READ"}
                        workflow = _uuid(row.get("workflowId")) or _uuid(row.get("workflowid"))
                        if workflow:
                            run_identity = workflow
                            identity_source = "DIRECT_CLOUD_FLOW_READ"
                        break

        history = self.list_runs(env, run_identity)
        # A direct flow read is needed to certify an alternate workflow ID.
        # If Microsoft accepts the inventory GUID directly, keep the identity
        # qualification explicit so the UI never invents a verified join.
        return {"environmentId": env, "resourceId": resource,
                "details": detail, "runIdentitySource": identity_source,
                "runHistory": history}

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
