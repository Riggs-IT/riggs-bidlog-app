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

    def test_project_team_owns_field_staffing_without_duplicate_super(self):
        drawer = (ROOT / "frontend/src/ActiveProjectEditDrawer.jsx").read_text()
        organizer = (ROOT / "frontend/src/ActiveProjectStaffingOrganizer.jsx").read_text()

        self.assertNotIn(
            'hint="Superintendent staffing stays managed through the Operations staffing workflow."',
            drawer,
        )
        self.assertIn("project-team-office-grid", drawer)
        self.assertIn("people={people}", drawer)
        self.assertIn("previewMode", drawer)
        self.assertIn("FIELD STAFFING", organizer)
        self.assertNotIn("CurrentSuperintendentEditor", organizer)
        self.assertNotIn("CurrentForemenEditor", organizer)
        self.assertIn("CurrentAssignmentRow", organizer)
        self.assertIn("Current Start", organizer)
        self.assertIn("Indefinite", organizer)
        self.assertIn("+ Start Plan", organizer)
        self.assertIn("+ Add Plan", organizer)

    def test_project_team_dropdowns_are_role_scoped(self):
        drawer = (ROOT / "frontend/src/ActiveProjectEditDrawer.jsx").read_text()
        organizer = (ROOT / "frontend/src/ActiveProjectStaffingOrganizer.jsx").read_text()

        self.assertIn('role="PM"', drawer)
        self.assertIn('role="APM"', drawer)
        self.assertIn('role="PE"', drawer)
        self.assertIn("person?.projectRole", drawer)
        self.assertIn("person?.staffingRole", organizer)
        self.assertIn('role={role}', organizer)
        self.assertIn('disabled={option.disabled}', organizer)

    def test_organizer_component_preserves_multi_foreman_and_projection(self):
        source = (ROOT / "frontend/src/ActiveProjectStaffingOrganizer.jsx").read_text()
        self.assertIn("row.resourceRole === 'FOREMAN'", source)
        self.assertIn("row.isCognitoProjected", source)
        self.assertIn("row.isCognitoProjectedPerson", source)
        self.assertIn("row.resourceRole === 'FOREMAN'", source)
        self.assertIn("row.isCognitoProjected", source)
        self.assertIn("row.isCognitoProjectedPerson", source)
        self.assertIn("row.assignedAt", source)
        self.assertIn("Operations assignment history", source)
        self.assertIn("Start a plan to select a person and staffing start date.", source)


if __name__ == "__main__":
    unittest.main()
