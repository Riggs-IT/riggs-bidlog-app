"""Offline API contract tests: no Microsoft sign-in, secrets, SQL or workers."""
from __future__ import annotations

import unittest
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import httpx

from backend.app.power_automate_monitoring import (
    PowerPlatformReadClient, PowerPlatformReadError, _normalize_flow,
)

TOKEN = "synthetic-delegated-test-token-not-real"
ENV = "Default-11111111-1111-4111-8111-111111111111"
FLOW = "22222222-2222-4222-8222-222222222222"
FLOW2 = "33333333-3333-4333-8333-333333333333"


def make_reader(handler):
    client = httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)
    return PowerPlatformReadClient(delegated_access_token=TOKEN, client=client)


def response(request, data=None, status=200):
    return httpx.Response(status, json=data if data is not None else {"value": []})


class PowerPlatformReadClientTests(unittest.TestCase):
    def test_only_get_auth_header_attached_and_not_returned(self):
        requests = []
        def mock(r):
            requests.append(r)
            return response(r)
        result = make_reader(mock).list_environments()
        self.assertEqual(result["availability"], "AVAILABLE")
        self.assertEqual(result["environments"], [])
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0].method, "GET")
        self.assertEqual(requests[0].headers["authorization"], "Bearer " + TOKEN)
        self.assertNotIn(TOKEN, str(result))

    def test_missing_delegated_token_denied(self):
        with self.assertRaises(PowerPlatformReadError) as e:
            PowerPlatformReadClient(delegated_access_token="")
        self.assertEqual(e.exception.code, "DELEGATED_TOKEN_REQUIRED")

    def test_environment_list_preserves_id_and_unknown_dataverse(self):
        def mock(r):
            return response(r, {"value": [
                {"id": ENV, "displayName": "Production", "type": "Production"},
                {"id": "Test-123", "displayName": "Test", "dataverseId": "x"},
            ]})
        result = make_reader(mock).list_environments()
        self.assertEqual(result["availability"], "AVAILABLE")
        self.assertIsNone(result["environments"][0]["hasDataverse"])
        self.assertTrue(result["environments"][1]["hasDataverse"])
        self.assertEqual(result["coverage"], "CONNECTED_USER_ACCESSIBLE_ONLY")

    def test_zero_runs_distinct_from_denied(self):
        def mock(r):
            return httpx.Response(204)
        result = make_reader(mock).list_runs(ENV, FLOW)
        self.assertEqual(result["availability"], "AVAILABLE")
        self.assertEqual(result["runs"], [])
        self.assertIs(result["hasMore"], False)

    def test_per_environment_404_is_unsupported_not_zero(self):
        def mock(r):
            return httpx.Response(404, json={"error": {"message": "private upstream detail"}})
        result = make_reader(mock).list_flows(ENV)
        self.assertEqual(result["availability"], "NO_DATAVERSE_OR_NOT_FOUND")
        self.assertIsNone(result["hasMore"])
        self.assertNotIn("private upstream", str(result))

    def test_403_never_means_zero_flows(self):
        result = make_reader(lambda r: httpx.Response(403)).list_flows(ENV)
        self.assertEqual(result["availability"], "ACCESS_DENIED")
        self.assertEqual(result["flows"], [])
        self.assertIsNone(result["hasMore"])

    def test_401_requires_new_connection(self):
        result = make_reader(lambda r: httpx.Response(401)).list_environments()
        self.assertEqual(result["availability"], "RECONNECT_REQUIRED")

    def test_429_throttled_not_retried(self):
        calls = []
        def mock(r):
            calls.append(r)
            return httpx.Response(429, headers={"Retry-After": "60"})
        result = make_reader(mock).list_runs(ENV, FLOW)
        self.assertEqual(result["availability"], "THROTTLED")
        self.assertEqual(len(calls), 1)

    def test_network_failure_redacted(self):
        def mock(r):
            raise httpx.ConnectError("Token:very-sensitive-data", request=r)
        result = make_reader(mock).list_environments()
        self.assertEqual(result["availability"], "NETWORK_UNAVAILABLE")
        self.assertNotIn("sensitive", str(result))

    def test_non_dataverse_invalid_identifier_is_rejected_without_http(self):
        calls = []
        def mock(r):
            calls.append(r)
            return response(r)
        reader = make_reader(mock)
        for bad in ("../other", "test?x=1", "", "example.com/a"):
            with self.assertRaises(PowerPlatformReadError):
                reader.list_flows(bad)
        self.assertFalse(calls)

    def test_flow_runs_reject_invalid_guid_without_http(self):
        calls = []
        reader = make_reader(lambda r: calls.append(r) or response(r))
        with self.assertRaises(PowerPlatformReadError) as exc:
            reader.list_runs(ENV, "something-not-a-guid")
        self.assertEqual(exc.exception.code, "INVALID_WORKFLOW_ID")
        self.assertEqual(calls, [])

    def test_flow_list_normalizes_without_raw_payload(self):
        def mock(r):
            return response(r, {"value": [{
                "workflowId": FLOW, "displayName": "Morning Refresh",
                "stateCode": "Published", "modifiedOn": "2026-10-26T07:00:00Z",
                "definition": "SECRET FLOW ACTION PAYLOAD",
                "connectionReferences": {"password": "SECRET"},
            }]})
        result = make_reader(mock).list_flows(ENV)
        self.assertEqual(result["availability"], "AVAILABLE")
        self.assertEqual(result["flows"][0]["platformState"], "PUBLISHED")
        self.assertEqual(result["flows"][0]["lastRunState"], "NOT_COLLECTED")
        self.assertNotIn("SECRET", str(result))

    def test_unrecognized_flow_state_stays_unknown(self):
        flow = _normalize_flow({"workflowId": FLOW, "stateCode": 17}, ENV)
        self.assertEqual(flow["platformState"], "UNKNOWN")
        self.assertIsNone(flow["lastRunAtUTC"])

    def test_run_result_last_success_only_in_returned_sample(self):
        def mock(r):
            return response(r, {"value": [
                {"runId": "run-a", "status": "Failed", "startTime": "2026-10-26T06:00:00Z"},
                {"runId": "run-b", "status": "Succeeded", "endTime": "2026-10-26T06:30:00Z"},
            ]})
        result = make_reader(mock).list_runs(ENV, FLOW)
        self.assertEqual(result["availability"], "AVAILABLE")
        self.assertEqual(result["lastSuccessInReturnedSampleUTC"], "2026-10-26T06:30:00Z")
        self.assertEqual(result["coverage"], "BOUNDED_SELECTED_FLOW_SAMPLE_ONLY")

    def test_pagination_same_host_and_path_is_accepted(self):
        calls = []
        def mock(r):
            calls.append(r)
            if len(calls) == 1:
                return response(r, {"value": [{"workflowId": FLOW}],
                    "@odata.nextLink": "https://api.powerplatform.com/powerautomate/environments/" + ENV + "/cloudFlows?api-version=2024-10-01&$skip=1"})
            return response(r, {"value": [{"workflowId": FLOW2}]})
        result = make_reader(mock).list_flows(ENV)
        self.assertEqual(result["availability"], "AVAILABLE")
        self.assertEqual(len(result["flows"]), 2)
        self.assertEqual(len(calls), 2)

    def test_pagination_cross_host_is_refused_and_never_called(self):
        calls = []
        def mock(r):
            calls.append(r)
            return response(r, {"value": [{"workflowId": FLOW}],
                "@odata.nextLink": "https://example.invalid/steal?api-version=2024-10-01"})
        reader = make_reader(mock)
        result = reader.list_flows(ENV)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["availability"], "INVALID_CONTINUATION_URL")
        self.assertIsNone(result["hasMore"])

    def test_pagination_other_environment_is_refused(self):
        calls=[]
        def mock(r):
            calls.append(r)
            return response(r, {"value": [{"workflowId": FLOW}],
                "@odata.nextLink": "https://api.powerplatform.com/powerautomate/environments/" + "Different-123" + "/cloudFlows?api-version=2024-10-01"})
        result = make_reader(mock).list_flows(ENV)
        self.assertEqual(result["availability"], "INVALID_CONTINUATION_URL")
        self.assertEqual(len(calls), 1)

    def test_pagination_flow_id_swap_is_rejected(self):
        calls = []
        def mock(r):
            calls.append(r)
            return response(r, {"value": [{"runId": "run-a"}],
                "@odata.nextLink": "https://api.powerplatform.com/powerautomate/environments/" + ENV + "/flowRuns?api-version=2024-10-01&workflowId=" + FLOW2})
        result = make_reader(mock).list_runs(ENV,FLOW)
        self.assertEqual(result["availability"], "INVALID_CONTINUATION_URL")
        self.assertEqual(len(calls), 1)

    def test_page_limit_never_misrepresents_complete_inventory(self):
        calls=[]
        def mock(r):
            calls.append(r)
            n=len(calls)
            return response(r, {"value": [{"workflowId": FLOW}],
                "@odata.nextLink": "https://api.powerplatform.com/powerautomate/environments/" + ENV + f"/cloudFlows?api-version=2024-10-01&$skip={n}"})
        result=make_reader(mock).list_flows(ENV)
        self.assertEqual(result["availability"], "PARTIAL")
        self.assertTrue(result["hasMore"])
        self.assertEqual(len(calls), 4)

    def test_bad_page_shape_is_unavailable(self):
        result = make_reader(lambda r: response(r, {"something": "else"})).list_flows(ENV)
        self.assertEqual(result["availability"], "INVALID_RESPONSE")
        self.assertIsNone(result["hasMore"])

    def test_unparsable_rows_are_not_silently_reported_complete(self):
        result = make_reader(lambda r: response(r, {"value": [{"displayName": "no identity"}]})).list_flows(ENV)
        self.assertEqual(result["availability"], "PARTIAL")
        self.assertEqual(result["invalidRows"], 1)
        self.assertEqual(result["flows"], [])

    def test_response_cannot_contain_passwords_or_tokens(self):
        def mock(r):
            return response(r, {"value": [{"runId": "demo", "status": "Failed", "input": {"secret": "VERY_SECRET"}, "error": "PRIVATE-EXCEPTION"}]})
        result=make_reader(mock).list_runs(ENV,FLOW)
        self.assertNotIn("VERY_SECRET", str(result))
        self.assertNotIn("PRIVATE-EXCEPTION", str(result))
        self.assertNotIn(TOKEN, str(result))


if __name__ == "__main__":
    unittest.main()
