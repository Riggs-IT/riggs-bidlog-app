"""Selected-flow canaries: strictly bounded, identity matched, redacted and read-only."""
import json
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from backend.app.power_automate_monitoring import PowerPlatformReadClient, PowerPlatformReadError
from tests.test_power_platform_routes import RouteTests, FakeVault

TOKEN = "synthetic-inspection-token-not-real"
ENV = "Default-11111111-1111-4111-8111-111111111111"
RESOURCE = "22222222-2222-4222-8222-222222222222"
WORKFLOW = "33333333-3333-4333-8333-333333333333"


def client_for(callback):
    return PowerPlatformReadClient(delegated_access_token=TOKEN,
        client=httpx.Client(transport=httpx.MockTransport(callback)))


class InspectionTests(unittest.TestCase):
    def test_resolves_real_workflow_guid_and_reads_only_one_selection(self):
        calls=[]
        def respond(req):
            calls.append(req)
            self.assertEqual(req.method, "GET")
            self.assertEqual(req.url.host, "api.powerplatform.com")
            self.assertIn("Bearer",req.headers["Authorization"])
            if req.url.path.endswith("/cloudFlows"):
                self.assertEqual(req.url.params.get("resourceId"),RESOURCE)
                return httpx.Response(200,json={"value":[{"resourceId":RESOURCE,
                    "workflowId":WORKFLOW,"stateCode":"Published",
                    "definition":{"key":"DO-NOT-EXPOSE"},"modifiedOn":"2026-10-26T11:00:00Z"}]})
            self.assertEqual(req.url.params.get("workflowId"),WORKFLOW)
            return httpx.Response(200,json={"value":[{"runId":"run-safe","status":"Failed",
                "startTime":"2026-10-26T10:00:00Z","inputs":{"token":"DO-NOT-EXPOSE"}}]})
        result=client_for(respond).inspect_flow(ENV,RESOURCE)
        self.assertEqual(len(calls),2)
        self.assertEqual(result["details"]["platformState"],"PUBLISHED")
        self.assertEqual(result["runIdentitySource"],"DIRECT_CLOUD_FLOW_READ")
        self.assertEqual(result["runHistory"]["runs"][0]["status"],"FAILED")
        self.assertNotIn("DO-NOT-EXPOSE",str(result))
        self.assertNotIn(TOKEN,str(result))

    def test_404_no_dataverse_is_not_healthy_zero_and_no_second_call(self):
        calls=[]
        def respond(req):
            calls.append(req)
            return httpx.Response(404,json={"error":{"message":"private secret"}})
        result=client_for(respond).inspect_flow(ENV,RESOURCE)
        self.assertEqual(len(calls),1)
        self.assertEqual(result["details"]["availability"],"NO_DATAVERSE_OR_NOT_FOUND")
        self.assertEqual(result["runHistory"]["availability"],"NOT_CHECKED")
        self.assertNotIn("private secret",str(result))

    def test_403_provider_denial_is_not_owner_gate_denial(self):
        result=client_for(lambda req:httpx.Response(403)).inspect_flow(ENV,RESOURCE)
        self.assertEqual(result["details"]["availability"],"ACCESS_DENIED")
        self.assertEqual(result["runHistory"]["availability"],"NOT_CHECKED")

    def test_unmatched_metadata_not_copied_or_accepted_by_name(self):
        seen=[]
        def respond(req):
            seen.append(req)
            if req.url.path.endswith('/cloudFlows'):
                return httpx.Response(200,json={"value":[{"resourceId":WORKFLOW,
                        "workflowId":WORKFLOW,"displayName":"Same name",
                        "stateCode":"Activated"}]})
            return httpx.Response(204)
        result=client_for(respond).inspect_flow(ENV,RESOURCE)
        self.assertEqual(len(seen),2)
        self.assertEqual(result["details"]["availability"],"UNVERIFIED_EMPTY")
        self.assertEqual(result["details"]["platformState"],"UNKNOWN")
        self.assertEqual(result["runIdentitySource"],"TENANT_RESOURCE_ID_UNVERIFIED")
        self.assertEqual(seen[1].url.params.get("workflowId"),RESOURCE)

    def test_bad_ids_fail_before_http_and_no_user_sql_or_unverified_url(self):
        seen=[]
        reader=client_for(lambda req:seen.append(req) or httpx.Response(200,json={"value":[]}))
        for env,flow in (("../other",RESOURCE),(ENV,"not-a-guid"),(ENV,"https://evil/")):
            with self.assertRaises(PowerPlatformReadError):reader.inspect_flow(env,flow)
        self.assertEqual(len(seen),0)

    def test_unsupported_metadata_result_falls_back_only_to_bounded_selected_run(self):
        calls=[]
        def respond(req):
            calls.append(req)
            return httpx.Response(204)
        result=client_for(respond).inspect_flow(ENV,RESOURCE)
        self.assertEqual(len(calls),2)
        self.assertEqual(result["runHistory"]["availability"],"AVAILABLE")
        self.assertEqual(result["runHistory"]["runs"],[])
        self.assertEqual(result["runIdentitySource"],"TENANT_RESOURCE_ID_UNVERIFIED")

    def test_existing_owner_gate_protects_inspection_route(self):
        fixture=RouteTests()
        client,app,_=fixture.build()
        app.dependency_overrides.clear()
        response=client.get(f'/api/admin/power-platform/environments/{ENV}/flows/{RESOURCE}/inspect')
        self.assertNotEqual(response.status_code,200)


if __name__ == '__main__':unittest.main()
