"""Management admin permissions: business admin, no Active Projects writes.

No live SQL, Microsoft, or bridge requests are made by this test.
"""
from dataclasses import replace
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.auth import CurrentUser, get_current_user


ADMIN = CurrentUser(
    eid=2021, it_user_id=1015, display_name="Synthetic Manager",
    app_role="ADMIN", employee_trade="PM", can_edit_billing=True,
    billing_access_source="BID_LOG_ADMIN", microsoft_username=None,
    entra_object_id="00000000-0000-0000-0000-000000000001",
    tenant_id="test",
)
MANAGEMENT = replace(ADMIN, app_role="MANAGEMENT_ADMIN", eid=415,
                     billing_access_source="BID_LOG_MANAGEMENT_ADMIN")


class ManagementAdminBoundaryTests(unittest.TestCase):
    def setUp(self):
        main.app.dependency_overrides[get_current_user] = lambda: MANAGEMENT
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def test_financials_and_all_workspaces_preserved(self):
        caps = main._workspace_capabilities(MANAGEMENT)
        self.assertTrue(all(caps.values()))
        self.assertTrue(main._can_view_margin(MANAGEMENT))
        self.assertTrue(main._can_edit_bid_log(MANAGEMENT))
        self.assertTrue(main._can_edit_current_project_projection(MANAGEMENT))
        payload = {"marginCollected": 99, "other": 42}
        self.assertEqual(main._role_scoped_financial_payload(payload, MANAGEMENT), payload)
        self.assertNotIn("marginCollected", main._role_scoped_financial_payload(payload, replace(MANAGEMENT, app_role="VIEWER")))

    def test_project_writes_fail_closed_before_upstream(self):
        paths = [
            ("put", "/api/active-projects/24", {"jobName": "Blocked"}, "update_active_project"),
            ("patch", "/api/active-projects/24/cognito-general", {"expectedVersion": 1, "changes": {}}, "general_request"),
            ("post", "/api/active-projects/24/staffing/assign", {"employeeEid": 415, "role": "PM"}, "assign_active_project_staffing"),
            ("post", "/api/active-projects/24/staffing/unassign", {"employeeEid": 415, "role": "PM"}, "unassign_active_project_staffing"),
            ("post", "/api/active-projects/24/resource-schedule", {"employeeEid": 415}, "create_active_project_resource_schedule"),
            ("put", "/api/active-projects/24/resource-schedule/4", {"status": "ACTIVE"}, "update_active_project_resource_schedule"),
            ("delete", "/api/active-projects/24/resource-schedule/4", None, "cancel_active_project_resource_schedule"),
        ]
        for method, path, body, name in paths:
            with self.subTest(path=path, method=method), patch.object(main, name) as upstream:
                opts = {} if body is None else {"json": body}
                response = getattr(self.client, method)(path, **opts)
                self.assertEqual(response.status_code, 403, response.text)
                upstream.assert_not_called()

    def test_active_project_read_allowed(self):
        with patch.object(main, "get_active_project_detail", return_value={"jobListId": 24}):
            response = self.client.get("/api/active-projects/24")
        self.assertEqual(response.status_code, 200, response.text)

    def test_bid_edit_permitted_and_actor_not_browser_supplied(self):
        with patch.object(main, "update_active_bid", return_value={"sharepointItemId": 5}) as update:
            result = self.client.patch("/api/bid-log/active/5", json={"bidName": "Allowed"}, headers={"X-Riggs-Actor-EID": "9999"})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(update.call_args.kwargs["actor_eid"], 415)

    def test_management_can_submit_normal_pm_projection(self):
        with patch.object(main, "save_current_project_pm_forecast", return_value={"items": []}) as submit:
            result = self.client.post("/api/current-projects/24/pm-forecast", json={"expectedVersion": 1, "months": []})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(submit.call_args.kwargs["actor_eid"], 415)

    def test_management_can_change_global_and_project_forecast_policy(self):
        for method, url, payload, name in [
            ("put", "/api/pm-forecast/policy", {"requireBaselineTotalMatch": False}, "update_pm_forecast_policy"),
            ("put", "/api/current-projects/24/pm-forecast/policy", {"requireBaselineTotalMatch": False}, "update_current_project_pm_forecast_policy"),
        ]:
            with self.subTest(url=url), patch.object(main, name, return_value={"requireBaselineTotalMatch": False}) as upstream:
                result = getattr(self.client, method)(url, json=payload)
                self.assertEqual(result.status_code, 200, result.text)
                upstream.assert_called_once()
                self.assertEqual(upstream.call_args.kwargs["actor_eid"], 415)

    def test_management_can_make_audited_admin_correction(self):
        with patch.object(main, "save_current_project_pm_forecast_admin_correction", return_value={"forecastVersionType": "ADMIN_CORRECTION"}) as save:
            response = self.client.post(
                "/api/current-projects/24/pm-forecast/admin-correction",
                json={"expectedLatestForecastVersionId": 10, "correctionReason": "Fix timing", "items": []},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(save.call_args.kwargs["actor_eid"], 415)
        self.assertEqual(save.call_args.args[1]["correctionReason"], "Fix timing")

    def test_admin_correction_requires_reason(self):
        with patch.object(main, "save_current_project_pm_forecast_admin_correction") as upstream:
            response = self.client.post(
                "/api/current-projects/24/pm-forecast/admin-correction",
                json={"expectedLatestForecastVersionId": 10, "correctionReason": "  ", "items": []},
            )
        self.assertEqual(response.status_code, 400, response.text)
        upstream.assert_not_called()

    def test_admin_retains_project_write(self):
        main.app.dependency_overrides[get_current_user] = lambda: ADMIN
        with patch.object(main, "update_active_project", return_value={"jobListId": 24}) as writer:
            result = self.client.put("/api/active-projects/24", json={"jobName": "Permitted"})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(writer.call_args.kwargs["actor_eid"], 2021)


if __name__ == "__main__":
    unittest.main()
