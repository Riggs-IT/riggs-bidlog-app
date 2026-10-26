"""Stage F1.2: documented, hardcoded, read-only Power Platform inventory query.

No Microsoft credentials. Requests are intercepted by synthetic MockTransport.
"""
import unittest
import httpx
from backend.app.power_automate_monitoring import PowerPlatformReadClient

TOKEN = "synthetic-token-not-a-secret"
ENV = "Default-11111111-1111-4111-8111-111111111111"
FLOW = "33333333-3333-4333-8333-333333333333"
FLOW2 = "44444444-4444-4444-8444-444444444444"


def row(flow=FLOW, env=ENV, name="Accounting nightly import", extra=None):
    return {"type": "microsoft.powerautomate/cloudflows", "name": flow,
            "properties": {"environmentId": env, "displayName": name,
                           "lastModifiedAt": "2026-10-25T10:00:00Z", **(extra or {})}}


def make(handler):
    return PowerPlatformReadClient(
        delegated_access_token=TOKEN,
        client=httpx.Client(transport=httpx.MockTransport(handler)))


class TestTenantInventory(unittest.TestCase):
    def test_query_follows_documented_fixed_read_contract(self):
        def handler(req):
            self.assertEqual(req.method, "POST")
            self.assertEqual(req.url.host, "api.powerplatform.com")
            self.assertEqual(req.url.path, "/resourcequery/resources/query")
            body = __import__("json").loads(req.content)
            self.assertEqual(body["TableName"], "PowerPlatformResources")
            self.assertEqual(body["Clauses"][0]["Values"], ["'microsoft.powerautomate/cloudflows'"])
            self.assertEqual(body["Options"], {"Top": 100})
            self.assertEqual(req.headers["authorization"], f"Bearer {TOKEN}")
            return httpx.Response(200, json={"data": [row()], "count": 1, "totalRecords": 1})
        data = make(handler).query_tenant_inventory()
        self.assertEqual(data["availability"], "AVAILABLE")
        self.assertEqual(data["flows"][0]["name"], "Accounting nightly import")
        self.assertEqual(data["flows"][0]["lastRunState"], "NOT_COLLECTED")
        self.assertFalse(data["flows"][0]["runLookupVerified"])
        self.assertNotIn(TOKEN, repr(data))

    def test_403_is_explicit_and_not_zero(self):
        data = make(lambda r: httpx.Response(403)).query_tenant_inventory()
        self.assertEqual(data["availability"], "ACCESS_DENIED")
        self.assertIsNone(data["hasMore"])

    def test_pagination_only_accepts_bounded_skip_token(self):
        seen = []
        def handler(r):
            j = __import__("json").loads(r.content)
            seen.append(j["Options"].get("SkipToken"))
            if len(seen) == 1:
                return httpx.Response(200, json={"data": [row()], "totalRecords": 2, "skipToken": "next"})
            return httpx.Response(200, json={"data": [row(FLOW2)], "totalRecords": 2})
        result = make(handler).query_tenant_inventory()
        self.assertEqual(seen, [None, "next"])
        self.assertFalse(result["hasMore"])
        self.assertEqual(len(result["flows"]), 2)

    def test_large_skip_token_is_unsafe_but_not_printed(self):
        result = make(lambda r: httpx.Response(200, json={"data": [row()],
                                            "skipToken": "x"*5000})).query_tenant_inventory()
        self.assertEqual(result["availability"], "PARTIAL")
        self.assertEqual(result["providerError"], "INVALID_CONTINUATION_TOKEN")
        self.assertNotIn("x"*5000, repr(result))

    def test_malformed_rows_not_accepted_or_reinterpreted(self):
        result = make(lambda r: httpx.Response(200, json={"data": [
            row(), {"type": "microsoft.powerautomate/cloudflows", "name": "unexpected",
                    "properties": {"environmentId": ENV}},
            {"type": "microsoft.powerapps/canvasapps", "name": FLOW2,
             "properties": {"environmentId": ENV}},
        ]})).query_tenant_inventory()
        self.assertEqual(result["availability"], "PARTIAL")
        self.assertEqual(result["invalidRows"], 2)
        self.assertEqual(len(result["flows"]), 1)

    def test_existing_flow_exact_identity_merges_safely(self):
        def handler(r):
            if r.url.path == "/environmentmanagement/environments":
                return httpx.Response(200, json={"value":[{"id": ENV, "displayName": "Riggs Default"}]})
            if r.url.path.endswith("/cloudFlows"):
                return httpx.Response(200,json={"value":[{"workflowId": FLOW, "displayName": "Flow provider"}]})
            return httpx.Response(200,json={"data":[row(FLOW, name="ARG provider"), row(FLOW2)]})
        result = make(handler).list_accessible_inventory()
        self.assertEqual(result["flowCountReturned"], 2)
        self.assertEqual(result["deduplicatedExactIds"], 1)
        self.assertEqual(result["flows"][0]["environmentName"], "Riggs Default")
        self.assertEqual(result["coverageComplete"], False)
        self.assertEqual(result["sortBasis"], "MODIFIED_TIME_NOT_RUN_TIME")

    def test_denied_tenant_inventory_does_not_hide_legacy_flows(self):
        def handler(r):
            if r.url.path == "/environmentmanagement/environments":
                return httpx.Response(200,json={"value":[{"id": ENV,"displayName":"Default"}]})
            if r.url.path.endswith("/cloudFlows"):
                return httpx.Response(200,json={"value":[{"workflowId": FLOW}]})
            return httpx.Response(403)
        result = make(handler).list_accessible_inventory()
        self.assertEqual(len(result["flows"]), 1)
        self.assertEqual(result["providerResults"][0]["availability"], "ACCESS_DENIED")
        self.assertEqual(result["availability"], "PARTIAL")

    def test_both_providers_empty_is_unverified_empty(self):
        def handler(r):
            if r.url.path == "/environmentmanagement/environments":
                return httpx.Response(200,json={"value":[{"id": ENV,"displayName":"Default"}]})
            if r.url.path.endswith("/cloudFlows"):
                return httpx.Response(204)
            return httpx.Response(200,json={"data":[],"totalRecords":0})
        result = make(handler).list_accessible_inventory()
        self.assertEqual(result["availability"], "UNVERIFIED_EMPTY")
        self.assertEqual(result["flowCountReturned"],0)
        self.assertFalse(result["coverageComplete"])

    def test_raw_resource_fields_do_not_leak(self):
        def handler(r):
            if r.url.path == "/environmentmanagement/environments":
                return httpx.Response(200,json={"value":[]})
            return httpx.Response(200,json={"data":[row(extra={
                "inputs":{"authorization":"SHOULD-NOT-LEAK"}, "secret":"SHOULD-NOT-LEAK"})]})
        result = make(handler).list_accessible_inventory()
        self.assertNotIn("SHOULD-NOT-LEAK",repr(result))
        self.assertNotIn(TOKEN,repr(result))

if __name__ == "__main__":
    unittest.main()

class TestTenantInventoryScope(unittest.TestCase):
    def test_readonly_resource_query_permission_in_oauth(self):
        from pathlib import Path
        source = Path("backend/app/main.py").read_text()
        self.assertIn("https://api.powerplatform.com/ResourceQuery.Resources.Read", source)
        self.assertNotIn("ResourceQuery.Resources.Write", source)
