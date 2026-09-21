from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ActiveProjectStaffingWiringTests(unittest.TestCase):
    def test_backend_data_api_calls_resource_schedule(self):
        source = (ROOT / "backend/app/data_api.py").read_text()
        self.assertIn(
            'f"/v1/jobs/{job_list_id}/resource-schedule"',
            source,
        )

    def test_backend_proxy_exposes_resource_schedule(self):
        source = (ROOT / "backend/app/main.py").read_text()
        self.assertIn(
            '"/api/active-projects/{job_list_id}/resource-schedule"',
            source,
        )
        self.assertIn("get_active_project_resource_schedule", source)

    def test_frontend_loads_resource_schedule(self):
        source = (ROOT / "frontend/src/ActiveProjectEditDrawer.jsx").read_text()
        self.assertIn(
            '`/api/active-projects/${jobListId}/resource-schedule`',
            source,
        )
        self.assertIn("<ActiveProjectStaffingOrganizer", source)

    def test_organizer_component_preserves_multi_foreman_and_projection(self):
        source = (ROOT / "frontend/src/ActiveProjectStaffingOrganizer.jsx").read_text()
        self.assertIn("row.resourceRole === 'FOREMAN'", source)
        self.assertIn("row.isCognitoProjected", source)
        self.assertIn("row.isCognitoProjectedPerson", source)
        self.assertIn("Following project schedule", source)
        self.assertIn("Custom Organizer dates", source)


if __name__ == "__main__":
    unittest.main()
