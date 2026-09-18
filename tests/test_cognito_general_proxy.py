from __future__ import annotations
import unittest
from dataclasses import replace
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
from backend.app import main
from backend.app.auth import CurrentUser, get_current_user
from backend.app import cognito_general
from backend.app.data_api import DataAPIRequestRejected

ADMIN = CurrentUser(eid=2021, it_user_id=1015, display_name='Test administrator', app_role='ADMIN',
    employee_trade=None, can_edit_billing=True, billing_access_source='TEST',
    microsoft_username='test@example.test', entra_object_id='00000000-0000-0000-0000-000000000001',
    tenant_id='00000000-0000-0000-0000-000000000002')


class GeneralProxyRouteTests(unittest.TestCase):
    def setUp(self):
        main.app.dependency_overrides[get_current_user]=lambda: ADMIN
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client=TestClient(main.app)
    def test_read_uses_existing_workspace_guard(self):
        with patch.object(main,'general_request',return_value={'entryVersion':7}):
            r=self.client.get('/api/active-projects/24/cognito-general')
        self.assertEqual(r.status_code,200);self.assertIn('no-store',r.headers['cache-control'])
    def test_patch_actor_comes_from_session(self):
        with patch.object(main,'general_request',return_value={'result':'VERIFIED'}) as proxy:
            r=self.client.patch('/api/active-projects/24/cognito-general',json={'expectedVersion':7,'changes':{'scope':'x'}},headers={'X-Riggs-User-EID':'9999'})
        self.assertEqual(r.status_code,200);self.assertEqual(proxy.call_args.kwargs['actor_eid'],2021)
    def test_extra_actor_in_body_rejected(self):
        with patch.object(main,'general_request') as proxy:
            r=self.client.patch('/api/active-projects/24/cognito-general',json={'expectedVersion':7,'changes':{'scope':'x'},'actorEid':9999})
        self.assertEqual(r.status_code,422);proxy.assert_not_called()
    def test_viewer_and_operations_cannot_write(self):
        for role in ['VIEWER','OPERATIONS']:
            main.app.dependency_overrides[get_current_user]=lambda: replace(ADMIN,app_role=role,can_edit_billing=False)
            with self.subTest(role=role),patch.object(main,'general_request') as proxy:
                r=self.client.patch('/api/active-projects/24/cognito-general',json={'expectedVersion':7,'changes':{'scope':'x'}})
                self.assertEqual(r.status_code,403);proxy.assert_not_called()
    def test_conflict_details_survive_proxy(self):
        with patch.object(main,'general_request',side_effect=DataAPIRequestRejected(409,{'code':'conflict','reloadRequired':True})):
            r=self.client.patch('/api/active-projects/24/cognito-general',json={'expectedVersion':7,'changes':{'scope':'x'}})
        self.assertEqual(r.status_code,409);self.assertTrue(r.json()['detail']['reloadRequired'])


class GeneralProxyClientTests(unittest.TestCase):
    def test_preserves_write_outcome_errors(self):
        for status in [409,422,502,503]:
            with self.subTest(status=status),patch.object(cognito_general.data_api,'_get_http_client') as client,patch.object(cognito_general.data_api,'_request_headers',return_value={}):
                client.return_value.request.return_value=httpx.Response(status,json={'detail':{'code':'test','reloadRequired':True}})
                with self.assertRaises(DataAPIRequestRejected) as caught:
                    cognito_general.general_request(24,payload={'expectedVersion':7,'changes':{'scope':'x'}},actor_eid=2021)
                self.assertEqual(caught.exception.status_code,status)
    def test_only_one_outbound_request_and_narrow_timeout(self):
        with patch.object(cognito_general.data_api,'_get_http_client') as client,patch.object(cognito_general.data_api,'_request_headers',return_value={}):
            client.return_value.request.return_value=httpx.Response(200,json={'result':'VERIFIED'})
            cognito_general.general_request(24,payload={'expectedVersion':7,'changes':{'scope':'x'}},actor_eid=2021)
            client.return_value.request.assert_called_once()
            self.assertEqual(client.return_value.request.call_args.kwargs['timeout'].read,90)

if __name__=='__main__':unittest.main()
