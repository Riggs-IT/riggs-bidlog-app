"""AP4D known-SetupID BFF read: ADMIN-only, forwarded actor, no list or writes."""
from dataclasses import replace
import unittest
from unittest.mock import patch
from uuid import UUID

import httpx
from fastapi.testclient import TestClient

from backend.app import auth, data_api, main
from backend.app.auth import CurrentUser, get_current_user

SETUP = UUID("00000000-0000-4000-8000-000000000001")
CHILD = UUID("00000000-0000-4000-8000-000000000002")
ADMIN = CurrentUser(
    eid=2021, it_user_id=12, display_name="Synthetic", app_role="ADMIN",
    employee_trade=None, can_edit_billing=False, billing_access_source=None,
    microsoft_username=None, entra_object_id="00000000-0000-4000-8000-000000000010",
    tenant_id="00000000-0000-4000-8000-000000000020",
)


def draft():
    return {"setup": {"setupId": str(SETUP), "childId": str(CHILD),
                      "originalBidLogId": 42, "revision": 1, "jobNumber": None,
                      "cognitoEntryId": None, "jobListId": None,
                      "values": {"jobName": "Synthetic"},
                      "originatingBid": {"originalBidLogId": 42}},
            "persistence": "SQL_DRAFT_ONLY", "externalState": "NOT_CONNECTED"}


class DraftRouteTests(unittest.TestCase):
    def setUp(self):
        main.app.dependency_overrides[get_current_user] = lambda: ADMIN
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def test_admin_read_by_id_and_actor_not_request_header(self):
        with patch.object(main, "get_project_setup_draft", return_value=draft()) as reader:
            response = self.client.get(f"/api/project-setups/drafts/{SETUP}",
                                       headers={"X-Riggs-User-EID": "9999", "X-Riggs-Passive-Read":"1"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["setup"]["setupId"], str(SETUP))
        self.assertEqual(reader.call_args.kwargs["actor_eid"], 2021)
        self.assertIn("no-store", response.headers["cache-control"])

    def test_role_boundaries(self):
        for role in ("MANAGEMENT_ADMIN", "OPERATIONS", "VIEWER"):
            main.app.dependency_overrides[get_current_user] = lambda role=role: replace(ADMIN, app_role=role)
            with self.subTest(role=role), patch.object(main, "get_project_setup_draft") as reader:
                result = self.client.get(f"/api/project-setups/drafts/{SETUP}")
                self.assertEqual(result.status_code, 403)
                reader.assert_not_called()

    def test_missing_or_zero_id_does_not_call_bridge(self):
        for identifier in ("bad", "00000000-0000-0000-0000-000000000000"):
            with self.subTest(identifier=identifier), patch.object(main, "get_project_setup_draft") as reader:
                result = self.client.get(f"/api/project-setups/drafts/{identifier}")
                self.assertEqual(result.status_code, 422)
                reader.assert_not_called()

    def test_disabled_denied_not_found_and_transport_failure(self):
        for exc, status, detail in [
            (data_api.DataAPIProjectSetupDisabled(), 503, "project_setup_reads_disabled"),
            (data_api.DataAPIProjectSetupServiceUnavailable(), 503, "project_setup_service_auth_unavailable"),
            (data_api.DataAPIRequestRejected(403, "project_setup_forbidden"), 403, "project_setup_forbidden"),
            (data_api.DataAPIRequestRejected(404, "project_setup_not_found"), 404, "project_setup_not_found"),
            (data_api.DataAPIUnavailable(), 503, "data_api_unavailable"),
            (data_api.DataAPIInvalidResponse(), 502, "invalid_data_api_response"),
        ]:
            with self.subTest(type=type(exc).__name__), patch.object(main, "get_project_setup_draft", side_effect=exc):
                result = self.client.get(f"/api/project-setups/drafts/{SETUP}")
                self.assertEqual((result.status_code, result.json()["detail"]), (status, detail))

    def test_no_new_write_paths(self):
        for method in ("post", "patch", "put", "delete"):
            with self.subTest(method=method):
                self.assertIn(getattr(self.client, method)(f"/api/project-setups/drafts/{SETUP}").status_code, (404, 405))


class DraftClientTests(unittest.TestCase):
    def test_client_actor_is_server_forwarded(self):
        with patch.object(data_api, "_get_http_client") as client, patch.object(
            data_api, "_request_headers", wraps=data_api._request_headers
        ) as headers, patch.object(data_api.settings, "data_api_client_token", "synthetic"):
            client.return_value.get.return_value = httpx.Response(200, json=draft())
            result = data_api.get_project_setup_draft(setup_id=SETUP, actor_eid=2021)
        self.assertEqual(result["persistence"], "SQL_DRAFT_ONLY")
        self.assertEqual(headers.call_args.kwargs["actor_eid"], 2021)
        self.assertTrue(headers.call_args.kwargs["include_service_auth"])
        self.assertEqual(client.return_value.get.call_args.args[0], f"/v1/project-setups/drafts/{SETUP}")

    def test_invalid_or_linked_response_denied(self):
        for mutation in ({"setup": {**draft()["setup"], "jobNumber": "26555"}},
                         {"setup": {**draft()["setup"], "setupId": str(CHILD)}},
                         {"externalState": "CONNECTED"},
                         {"setup": {**draft()["setup"], "values": []}}):
            response = {**draft(), **mutation}
            with patch.object(data_api, "_get_http_client") as client, patch.object(
                data_api, "_request_headers", return_value={"X-Request-ID": "synthetic"}
            ):
                client.return_value.get.return_value = httpx.Response(200, json=response)
                with self.assertRaises(data_api.DataAPIInvalidResponse):
                    data_api.get_project_setup_draft(setup_id=SETUP, actor_eid=2021)

    def test_disabled_not_empty_or_missing(self):
        with patch.object(data_api, "_get_http_client") as client, patch.object(
            data_api, "_request_headers", return_value={"X-Request-ID": "synthetic"}
        ):
            client.return_value.get.return_value = httpx.Response(503, json={"detail":"project_setup_reads_disabled"})
            with self.assertRaises(data_api.DataAPIProjectSetupDisabled):
                data_api.get_project_setup_draft(setup_id=SETUP, actor_eid=2021)


if __name__ == "__main__":
    unittest.main()
