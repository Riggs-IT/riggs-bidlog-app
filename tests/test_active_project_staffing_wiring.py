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

    def test_frontend_loads_and_writes_resource_schedule(self):
        drawer = (
            ROOT
            / "frontend/src/ActiveProjectEditDrawer.jsx"
        ).read_text()

        self.assertIn(
            '`/api/active-projects/${jobListId}/resource-schedule`',
            drawer,
        )
        self.assertIn("<ActiveProjectStaffingOrganizer", drawer)
        self.assertIn("const writeStaffing = useCallback", drawer)
        self.assertIn("onWrite={writeStaffing}", drawer)
        self.assertIn(
            "writeEnabled={Number(jobListId) === 24}",
            drawer,
        )
        self.assertNotIn("previewMode", drawer)

    def test_project_team_owns_field_staffing_without_duplicate_super(self):
        drawer = (
            ROOT
            / "frontend/src/ActiveProjectEditDrawer.jsx"
        ).read_text()
        organizer = (
            ROOT
            / "frontend/src/ActiveProjectStaffingOrganizer.jsx"
        ).read_text()

        self.assertNotIn(
            'hint="Superintendent staffing stays managed through the Operations staffing workflow."',
            drawer,
        )
        self.assertIn("project-team-office-grid", drawer)
        self.assertIn("people={people}", drawer)
        self.assertIn("FIELD STAFFING", organizer)
        self.assertNotIn("CurrentSuperintendentEditor", organizer)
        self.assertNotIn("CurrentForemenEditor", organizer)
        self.assertIn("CurrentAssignmentRow", organizer)
        self.assertIn("CurrentAssignmentStarter", organizer)
        self.assertIn("Current Start", organizer)
        self.assertIn("Indefinite", organizer)
        self.assertIn("+ Start Plan", organizer)
        self.assertIn("+ Add Plan", organizer)

    def test_project_team_dropdowns_are_role_scoped(self):
        drawer = (
            ROOT
            / "frontend/src/ActiveProjectEditDrawer.jsx"
        ).read_text()
        organizer = (
            ROOT
            / "frontend/src/ActiveProjectStaffingOrganizer.jsx"
        ).read_text()

        self.assertIn('role="PM"', drawer)
        self.assertIn('role="APM"', drawer)
        self.assertIn('role="PE"', drawer)
        self.assertIn("person?.projectRole", drawer)
        self.assertIn("person?.staffingRole", organizer)
        self.assertIn("role={role}", organizer)
        self.assertIn("disabled={option.disabled}", organizer)
        self.assertIn("employeeEidForValue", organizer)

    def test_organizer_component_preserves_multi_foreman_and_projection(self):
        source = (
            ROOT
            / "frontend/src/ActiveProjectStaffingOrganizer.jsx"
        ).read_text()

        self.assertIn("row.resourceRole === 'FOREMAN'", source)
        self.assertIn("row.isCognitoProjected", source)
        self.assertIn("row.isCognitoProjectedPerson", source)
        self.assertIn("row.assignedAt", source)
        self.assertIn("Operations assignment history", source)
        self.assertIn("Add Current Foreman", source)
        self.assertIn("End current", source)
        self.assertIn("Projected to Cognito", source)

    def test_frontend_wires_all_staffing_mutations(self):
        source = (
            ROOT
            / "frontend/src/ActiveProjectStaffingOrganizer.jsx"
        ).read_text()

        expected = (
            "path: '/staffing/assign'",
            "path: '/staffing/unassign'",
            "path: '/resource-schedule'",
            "path: `/resource-schedule/${row.scheduleId}`",
            "method: 'POST'",
            "method: 'PUT'",
            "method: 'DELETE'",
            "Save plan",
            "Update plan",
            "Remove plan",
        )

        for value in expected:
            self.assertIn(value, source)

    def test_new_plans_cannot_send_completed_status(self):
        source = (
            ROOT
            / "frontend/src/ActiveProjectStaffingOrganizer.jsx"
        ).read_text()

        self.assertIn(
            "{row.scheduleId && (",
            source,
        )
        self.assertIn(
            '<option value="COMPLETED">Completed</option>',
            source,
        )


    def test_staffing_editor_uses_app_dialog_and_stable_schedule_props(self):
        source = (
            ROOT
            / "frontend/src/ActiveProjectStaffingOrganizer.jsx"
        ).read_text()

        self.assertIn("BidLogConfirmDialog", source)
        self.assertNotIn("window.confirm(", source)
        self.assertIn("const superSchedules = useMemo(", source)
        self.assertIn("const foremanSchedules = useMemo(", source)
        self.assertIn("[schedules]", source)
        self.assertIn("requestConfirm={requestConfirm}", source)



if __name__ == "__main__":
    unittest.main()
