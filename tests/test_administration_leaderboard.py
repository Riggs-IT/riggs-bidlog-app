"""Stage 2C: synthetic owner-only leaderboard BFF and upstream adapter tests."""
import unittest
import time
from copy import deepcopy
from unittest.mock import patch
from uuid import UUID

import httpx
from backend.app import administration, data_api
import test_administration_owner_auth as auth_test


def fixture(days=30, app_code="ALL"):
    return {
        "source": "RIGGSDATAHUB_USAGE_SESSIONS",
        "metric": "HEARTBEAT_CREDITED_ACTIVE_SECONDS",
        "windowRule": "SESSION_STARTED_IN_ARIZONA_WINDOW",
        "overlapRule": "SESSION_WINDOW_OVERLAP_WARNING_NOT_DEDUPED",
        "readOnly": True,
        "observedAtUTC": "2026-10-16T16:05:00Z",
        "windowStartUTC": "2026-09-17T07:00:00Z",
        "windowStartArizonaDate": "2026-09-17",
        "windowDays": days,
        "appCode": app_code,
        "employeeLimit": 200,
        "totalEmployees": 2,
        "totalSessions": 5,
        "totalRecordedActiveSeconds": 5_400,
        "totalPossibleOverlapSessions": 2,
        "carryInSessions": 0,
        "excludedInvalidSessions": 0,
        "employeesTruncated": False,
        "employees": [
            {"rank": 1, "eid": 2021, "displayName": "Example Alpha", "recordedActiveSeconds": 3600,
             "sessionCount": 3, "appsUsed": 2, "possibleOverlapSessions": 2,
             "microsoftUsername": "not-exposed@example.invalid"},
            {"rank": 2, "eid": 176, "displayName": "Example Beta", "recordedActiveSeconds": 1800,
             "sessionCount": 2, "appsUsed": 1, "possibleOverlapSessions": 0},
        ],
        "rawSessionIds": ["never-to-browser"],
    }


class LeaderboardBffTests(unittest.TestCase):
    def setUp(self):
        self.owner = auth_test.AdministrationOwnerAuthorizationTests(
            "test_owner_from_signed_entra_and_sql_mapping_allowed"
        )
        self.owner.setUp()
        self.addCleanup(self.owner.doCleanups)
        self.client = self.owner.client

    def test_owner_receives_only_bounded_aggregates(self):
        with patch.object(administration, "get_bid_log_administration_leaderboard", return_value=fixture()) as upstream:
            result = self.client.get("/api/admin/leaderboard?days=30&app=ALL")
        self.assertEqual(result.status_code, 200, result.text)
        body = result.json()
        self.assertEqual(body["availability"], "AVAILABLE")
        self.assertEqual(body["totalRecordedActiveSeconds"], 5400)
        self.assertEqual(body["totalPossibleOverlapSessions"], 2)
        self.assertEqual(len(body["employees"]), 2)
        self.assertEqual(body["employees"][0]["eid"], 2021)
        self.assertNotIn("not-exposed", result.text)
        self.assertNotIn("rawSessionIds", result.text)
        self.assertNotIn("microsoftUsername", result.text)
        self.assertNotIn(auth_test.OWNER_OID, result.text)
        self.assertIn("no-store", result.headers.get("cache-control", ""))
        upstream.assert_called_once_with(actor_eid=2021, entra_object_id=auth_test.OWNER_OID, days=30, app_code="ALL")

    def test_filters_7_30_90_and_one_app(self):
        for days, app in [(0, "ALL"), (7, "ACCOUNTING"), (30, "BID_LOG"), (90, "OPERATIONS")]:
            with self.subTest(days=days, app=app):
                with patch.object(administration, "get_bid_log_administration_leaderboard", return_value=fixture(days, app)):
                    result = self.client.get(f"/api/admin/leaderboard?days={days}&app={app}")
                self.assertEqual(result.status_code, 200, result.text)
                self.assertEqual(result.json()["windowDays"], days)
                self.assertEqual(result.json()["appCode"], app)

    def test_invalid_filters_fail_before_upstream(self):
        for query in ("days=-1&app=ALL", "days=14&app=ALL", "days=90&app=all",
                      "days=30&app=SQL", "days=no&app=BID_LOG"):
            with self.subTest(query=query), patch.object(administration, "get_bid_log_administration_leaderboard") as upstream:
                response = self.client.get("/api/admin/leaderboard?" + query)
                self.assertEqual(response.status_code, 422)
                upstream.assert_not_called()

    def test_nonowner_admin_and_forged_headers_denied(self):
        self.owner.access = self.owner.access.__class__(**{
            **self.owner.access.__dict__, "eid": 415,
            "entra_object_id": auth_test.OTHER_OID,
        })
        self.owner.seed_cookie(oid=auth_test.OTHER_OID)
        with patch.object(administration, "get_bid_log_administration_leaderboard") as upstream:
            response = self.client.get("/api/admin/leaderboard?days=30&app=ALL&actor_eid=2021", headers={
                "X-Riggs-User-EID": "2021", "X-Riggs-Actor-Entra-OID": auth_test.OWNER_OID,
            })
        self.assertEqual(response.status_code, 403)
        upstream.assert_not_called()

    def test_passive_leaderboard_get_does_not_extend_idle_session(self):
        self.owner.seed_cookie(last=int(time.time()) - 200)
        with patch.object(administration, "get_bid_log_administration_leaderboard", return_value=fixture()):
            passive = self.client.get("/api/admin/leaderboard?days=30&app=ALL", headers={
                "X-Riggs-Passive-Read": "1",
            })
        self.assertEqual(passive.status_code, 200)
        self.assertNotIn("set-cookie", passive.headers)
        with patch.object(administration, "get_bid_log_administration_leaderboard", return_value=fixture()):
            active = self.client.get("/api/admin/leaderboard?days=30&app=ALL")
        self.assertEqual(active.status_code, 200)
        self.assertIn("set-cookie", active.headers)

    def test_dev_auth_and_http_post_denied(self):
        self.owner.cfg.auth_mode = "dev"
        self.assertEqual(self.client.get("/api/admin/leaderboard").status_code, 403)
        self.assertEqual(self.client.post("/api/admin/leaderboard").status_code, 405)

    def test_invalid_backend_contract_is_unavailable_not_empty(self):
        for key, value in (
            ("metric", "SESSION_DURATION"), ("windowRule", "ANY_HEARTBEAT"),
            ("totalSessions", 0), ("totalPossibleOverlapSessions", 5),
            ("windowStartArizonaDate", "bad-day"),
        ):
            raw = fixture()
            raw[key] = value
            with self.subTest(key=key), patch.object(administration, "get_bid_log_administration_leaderboard", return_value=raw):
                response = self.client.get("/api/admin/leaderboard")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["availability"], "UNAVAILABLE")
                self.assertNotIn("employees", response.json())

    def test_zero_employee_sentinel_is_genuine_zero(self):
        raw = fixture()
        raw.update(totalEmployees=0, totalSessions=0, totalRecordedActiveSeconds=0,
                   totalPossibleOverlapSessions=0, employees=[])
        with patch.object(administration, "get_bid_log_administration_leaderboard", return_value=raw):
            response = self.client.get("/api/admin/leaderboard")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["availability"], "AVAILABLE")
        self.assertEqual(response.json()["employees"], [])

    def test_ties_share_rank_and_wrong_order_is_rejected(self):
        raw = fixture()
        raw["employees"][1].update(rank=1, recordedActiveSeconds=3600)
        # SQL ranks ties by EID, so move the lower EID to the first row.
        raw["employees"] = [raw["employees"][1], raw["employees"][0]]
        raw["totalRecordedActiveSeconds"] = 7200
        self.assertEqual(administration._sanitize_leaderboard(raw, days=30, app_code="ALL")["employees"][1]["rank"], 1)
        raw["employees"][1]["rank"] = 2
        with self.assertRaises(ValueError):
            administration._sanitize_leaderboard(raw, days=30, app_code="ALL")

    def test_upstream_identity_filter_and_dedicated_read_timeout(self):
        url = "https://example.invalid/v1/bid-log/admin/leaderboard"
        response = httpx.Response(200, json=fixture(), request=httpx.Request("GET", url))
        class FakeClient:
            def get(self, path, **kwargs):
                self.path = path
                self.kwargs = kwargs
                return response
        client = FakeClient()
        with patch.object(data_api, "_get_http_client", return_value=client), patch.object(
            data_api, "_request_headers", return_value={}
        ):
            result = data_api.get_bid_log_administration_leaderboard(
                actor_eid=2021, entra_object_id=auth_test.OWNER_OID, days=90, app_code="OPERATIONS")
        self.assertEqual(result["source"], "RIGGSDATAHUB_USAGE_SESSIONS")
        self.assertEqual(client.path, "/v1/bid-log/admin/leaderboard")
        self.assertEqual(client.kwargs["params"], {"days": 90, "app": "OPERATIONS"})
        self.assertEqual(client.kwargs["headers"]["X-Riggs-Actor-Entra-OID"], str(UUID(auth_test.OWNER_OID)))
        self.assertEqual(client.kwargs["timeout"].read, data_api.settings.data_api_dashboard_read_timeout_seconds)
        with self.assertRaises(data_api.DataAPIConfigurationError):
            data_api.get_bid_log_administration_leaderboard(actor_eid=415, entra_object_id=auth_test.OWNER_OID)
        with self.assertRaises(ValueError):
            data_api.get_bid_log_administration_leaderboard(actor_eid=2021, entra_object_id=auth_test.OWNER_OID, days=1)
        # The zero value is the deliberate All Time selection, never an empty period.
        self.assertEqual(administration._sanitize_leaderboard(fixture(0, "ALL"), days=0, app_code="ALL")["windowDays"], 0)


if __name__ == "__main__":
    unittest.main()
