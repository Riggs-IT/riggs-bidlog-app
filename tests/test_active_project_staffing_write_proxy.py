from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ActiveProjectStaffingWriteProxyTests(unittest.TestCase):
    def test_data_api_client_exposes_staffing_and_schedule_writes(self):
        source = (ROOT / "backend/app/data_api.py").read_text()

        expected = (
            "assign_active_project_staffing",
            "unassign_active_project_staffing",
            "create_active_project_resource_schedule",
            "update_active_project_resource_schedule",
            "cancel_active_project_resource_schedule",
            '"/v1/staffing/assignments"',
            '"/v1/staffing/unassignments"',
            'f"/v1/jobs/{job_list_id}/resource-schedule"',
            'f"/resource-schedule/{schedule_id}"',
            'actor_eid=actor_eid',
        )

        for value in expected:
            self.assertIn(value, source)

    def test_backend_exposes_admin_guarded_write_proxies(self):
        source = (ROOT / "backend/app/main.py").read_text()

        expected_routes = (
            '"/api/active-projects/{job_list_id}/staffing/assign"',
            '"/api/active-projects/{job_list_id}/staffing/unassign"',
            '"/api/active-projects/{job_list_id}/resource-schedule"',
            '"/api/active-projects/{job_list_id}/resource-schedule/{schedule_id}"',
        )

        for route in expected_routes:
            self.assertIn(route, source)

        self.assertGreaterEqual(
            source.count("_require_project_editor(current_user)"),
            6,
        )
        self.assertGreaterEqual(
            source.count("actor_eid=current_user.eid"),
            5,
        )

    def test_browser_cannot_supply_staffing_job_or_actor_identity(self):
        source = (ROOT / "backend/app/main.py").read_text()

        self.assertIn(
            'set(payload) != {"employeeEid", "role"}',
            source,
        )
        self.assertNotIn(
            'payload.get("actorEid")',
            source,
        )
        self.assertNotIn(
            'payload.get("jobListId")',
            source,
        )

    def test_schedule_proxy_whitelists_business_fields(self):
        source = (ROOT / "backend/app/main.py").read_text()

        self.assertIn('"resourceRole",', source)
        self.assertIn('"startDateOverride",', source)
        self.assertIn('"endDateOverride",', source)
        self.assertIn('"status",', source)
        self.assertIn('"notes",', source)
        self.assertIn("not set(payload).issubset(allowed)", source)


if __name__ == "__main__":
    unittest.main()
