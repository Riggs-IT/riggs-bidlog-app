"""Completed history proxy must reuse existing session, role and service guards.

No live Microsoft, SQL, Docker or network reads.
"""
from dataclasses import replace
from datetime import date
import unittest
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient

from backend.app import main, data_api
from backend.app.auth import CurrentUser, get_current_user

ADMIN = CurrentUser(
    eid=2021, it_user_id=1, display_name="Synthetic Admin",
    app_role="ADMIN", employee_trade="PM", can_edit_billing=True,
    billing_access_source="BID_LOG_ADMIN", microsoft_username=None,
    entra_object_id="00000000-0000-0000-0000-000000000001",
    tenant_id="test",
)
VIEWER = replace(ADMIN, app_role="VIEWER", can_edit_billing=False)
DENIED = replace(ADMIN, app_role="OPERATIONS", employee_trade="FIELD", can_edit_billing=False)
ROUTE = "/api/completed-projects/monthly?startMonth=2025-01-01&endMonth=2025-02-01"
FIXTURE = {
    "startMonth": "2025-01-01", "endMonth": "2025-02-01",
    "projectCount": 1, "monthRowCount": 1,
    "items": [{"jobListId": 44, "monthStart": "2025-01-01",
               "actualAmount": 0, "marginCollected": 8.5,
               "marginDataComplete": True, "missingMarginRows": 0}],
}


class CompletedHistoryProxyTests(unittest.TestCase):
    def setUp(self):
        main.app.dependency_overrides[get_current_user] = lambda: ADMIN
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def test_admin_exact_month_bounds_and_margin_available(self):
        with patch.object(main, "get_completed_projects_monthly_bulk", return_value=FIXTURE) as upstream:
            response = self.client.get(ROUTE)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), FIXTURE)
        upstream.assert_called_once_with(date(2025, 1, 1), date(2025, 2, 1))

    def test_viewer_retains_history_but_never_receives_margin(self):
        main.app.dependency_overrides[get_current_user] = lambda: VIEWER
        with patch.object(main, "get_completed_projects_monthly_bulk", return_value=FIXTURE):
            response = self.client.get(ROUTE)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["items"][0]["actualAmount"], 0)
        self.assertNotIn("marginCollected", response.json()["items"][0])
        self.assertNotIn("marginDataComplete", response.json()["items"][0])

    def test_non_completed_workspace_actor_blocked_before_bridge(self):
        main.app.dependency_overrides[get_current_user] = lambda: DENIED
        with patch.object(main, "get_completed_projects_monthly_bulk") as upstream:
            response = self.client.get(ROUTE)
        self.assertEqual(response.status_code, 403)
        upstream.assert_not_called()

    def test_range_36_allowed_37_and_partial_month_denied_before_bridge(self):
        with patch.object(main, "get_completed_projects_monthly_bulk", return_value={"items": []}) as upstream:
            ok = self.client.get("/api/completed-projects/monthly?startMonth=2024-01-01&endMonth=2026-12-01")
            self.assertEqual(ok.status_code, 200)
            self.assertEqual(upstream.call_count, 1)
            for start, end in [("2023-12-01","2026-12-01"),
                               ("2026-05-01","2026-04-01"),
                               ("2025-01-02","2025-02-01"),
                               ("2025-01-01","2025-02-15")]:
                with self.subTest(start=start, end=end):
                    result = self.client.get(f"/api/completed-projects/monthly?startMonth={start}&endMonth={end}")
                    self.assertEqual(result.status_code, 422)
                    self.assertEqual(upstream.call_count, 1)

    def test_http_route_get_only_no_write_paths(self):
        routes = [r for r in main.app.routes if getattr(r,'path',None) == "/api/completed-projects/monthly"]
        self.assertEqual(len(routes), 1)
        self.assertEqual(routes[0].methods, {"GET"})
        self.assertEqual(self.client.post(ROUTE, json={}).status_code, 405)


class CompletedHistoryBridgeClientTests(unittest.TestCase):
    def test_reuses_service_authenticated_client_and_query_params(self):
        with patch.object(data_api, "_get_service_response", return_value=httpx.Response(200, json=FIXTURE)) as get:
            response = data_api.get_completed_projects_monthly_bulk(date(2025,1,1), date(2025,2,1))
        self.assertEqual(response, FIXTURE)
        get.assert_called_once_with(
            "/v1/bid-log/completed-projects/monthly",
            operation="Completed Projects monthly history",
            params={"startMonth":"2025-01-01","endMonth":"2025-02-01"},
        )

    def test_rejects_duplicate_or_inconsistent_items(self):
        for payload in (
            {**FIXTURE, "monthRowCount": 2},
            {**FIXTURE, "projectCount": 2},
            {**FIXTURE, "items": [FIXTURE["items"][0], FIXTURE["items"][0]], "monthRowCount": 2},
        ):
            with self.subTest(payload=payload):
                with patch.object(data_api, "_get_service_response", return_value=httpx.Response(200, json=payload)):
                    with self.assertRaises(data_api.DataAPIInvalidResponse):
                        data_api.get_completed_projects_monthly_bulk(date(2025,1,1), date(2025,2,1))

if __name__ == '__main__':
    unittest.main()
