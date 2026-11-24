import unittest
from types import SimpleNamespace
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app.unnumbered_project_editor import router
from backend.app.auth import get_current_user
from backend.app import data_api

class Tests(unittest.TestCase):
    def setUp(self):
        app=FastAPI();app.include_router(router);self.user=SimpleNamespace(eid=176,app_role='MANAGEMENT_ADMIN');app.dependency_overrides[get_current_user]=lambda:self.user
        self.client=TestClient(app,raise_server_exceptions=False);self.addCleanup(self.client.close);self.path='/api/project-setups/jis/field-team/availability'
    def test_management_and_admin_session_identity(self):
        with patch.object(data_api,'request_field_team_availability',return_value={'readOnly':True}) as relay:
            r=self.client.get(self.path+'?role=FOREMAN&employeeEid=7&actorEid=2021',headers={'X-Riggs-User-EID':'2021'});self.assertEqual(r.status_code,200)
            relay.assert_called_once_with(actor_eid=176,role='FOREMAN',employee_eid=7)
            self.assertEqual(r.headers['cache-control'],'private, no-store');relay.reset_mock()
            self.user=SimpleNamespace(eid=2021,app_role='ADMIN');self.assertEqual(self.client.get(self.path+'?role=SUPER').status_code,200);relay.assert_called_once_with(actor_eid=2021,role='SUPER',employee_eid=None)
    def test_viewer_denied_and_no_write(self):
        with patch.object(data_api,'request_field_team_availability') as relay:
            self.user=SimpleNamespace(eid=17,app_role='VIEWER');self.assertEqual(self.client.get(self.path+'?role=SUPER').status_code,403)
            self.user=SimpleNamespace(eid=176,app_role='MANAGEMENT_ADMIN');self.assertEqual(self.client.post(self.path+'?role=SUPER').status_code,405);self.assertEqual(self.client.patch(self.path+'?role=SUPER').status_code,405);relay.assert_not_called()
    def test_invalid_inputs_and_denial(self):
        with patch.object(data_api,'request_field_team_availability',side_effect=data_api.DataAPIRequestRejected(404,'field_team_employee_not_found')) as relay:
            self.assertEqual(self.client.get(self.path+'?role=SUPER&employeeEid=-1').status_code,422);relay.assert_not_called()
            self.assertEqual(self.client.get(self.path+'?role=SUPER&employeeEid=7').status_code,404)
