"""AP4E BFF session role and actor isolation; synthetic payload only."""
from dataclasses import replace
from datetime import datetime, timezone
import unittest
from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient
import httpx

from backend.app import main, data_api
from backend.app.auth import CurrentUser, get_current_user

SID='00000000-0000-4000-8000-000000000001'
CID='00000000-0000-4000-8000-000000000002'
STAMP='2026-10-28T17:00:00Z'
PATH='/api/project-setups/ops/awaiting-information'
USER=CurrentUser(eid=2021,it_user_id=12,display_name='Synthetic',app_role='ADMIN',
                 employee_trade=None,can_edit_billing=False,billing_access_source=None,
                 microsoft_username=None,
                 entra_object_id='00000000-0000-4000-8000-000000000010',
                 tenant_id='00000000-0000-4000-8000-000000000020')

def sample():
    return {'items':[{'setupId':SID,'childId':CID,'originalBidLogId':101,
            'revision':1,'jobName':'Unit job','createdAtUTC':STAMP,
            'updatedAtUTC':STAMP,'setupState':'PENDING_SETUP',
            'numberingState':'AWAITING_JOB_NUMBER','externalState':'NOT_CONNECTED'}],
            'nextCursor':None,'persistence':'SQL_DRAFT_ONLY'}

class BFFTests(unittest.TestCase):
    def setUp(self):
        main.app.dependency_overrides[get_current_user]=lambda:USER
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client=TestClient(main.app);self.addCleanup(self.client.close)
    def test_admin_and_ops_server_eid_used_not_browser_header(self):
        for role in ('ADMIN','OPERATIONS'):
            main.app.dependency_overrides[get_current_user]=lambda role=role:replace(USER,app_role=role)
            with self.subTest(role=role), patch.object(main,'get_ops_project_setup_summary',return_value=sample()) as reader:
                r=self.client.get(PATH,headers={'X-Riggs-User-EID':'999','X-Riggs-Passive-Read':'1'})
                self.assertEqual(r.status_code,200)
                self.assertEqual(reader.call_args.kwargs['actor_eid'],2021)
                self.assertIn('no-store',r.headers['cache-control'])
    def test_no_management_admin_or_viewer(self):
        for role in ('MANAGEMENT_ADMIN','VIEWER','PM',''):
            main.app.dependency_overrides[get_current_user]=lambda role=role:replace(USER,app_role=role)
            with self.subTest(role=role),patch.object(main,'get_ops_project_setup_summary') as reader:
                self.assertEqual(self.client.get(PATH).status_code,403)
                reader.assert_not_called()
    def test_disabled_not_empty(self):
        for exc, label in ((data_api.DataAPIProjectSetupOpsDiscoveryDisabled(),'project_setup_ops_discovery_disabled'),
                          (data_api.DataAPIProjectSetupDisabled(),'project_setup_reads_disabled'),
                          (data_api.DataAPIProjectSetupServiceUnavailable(),'project_setup_service_auth_unavailable')):
            with self.subTest(label=label),patch.object(main,'get_ops_project_setup_summary',side_effect=exc):
                r=self.client.get(PATH)
                self.assertEqual((r.status_code,r.json()['detail']),(503,label))
    def test_sql_denial_and_downstream_errors(self):
        for exc,code in ((data_api.DataAPIRequestRejected(403,'project_setup_forbidden'),403),
                         (data_api.DataAPIUnavailable(),503),
                         (data_api.DataAPIInvalidResponse(),502)):
            with self.subTest(code=code),patch.object(main,'get_ops_project_setup_summary',side_effect=exc):
                self.assertEqual(self.client.get(PATH).status_code,code)
    def test_incomplete_cursor_rejected(self):
        with patch.object(main,'get_ops_project_setup_summary') as reader:
            r=self.client.get(PATH,params={'after_setup_id':SID})
            self.assertEqual(r.status_code,422)
            reader.assert_not_called()
    def test_rejects_mutation(self):
        for method in ('post','put','patch','delete'):
            with self.subTest(method=method):
                self.assertIn(getattr(self.client,method)(PATH).status_code,(404,405))

class ClientTests(unittest.TestCase):
    def test_service_auth_only_bid_client(self):
        with patch.object(data_api,'_get_http_client') as c,patch.object(
            data_api,'_request_headers',return_value={'X-Request-ID':'synthetic'}
        ) as h:
            c.return_value.get.return_value=httpx.Response(200,json=sample())
            result=data_api.get_ops_project_setup_summary(actor_eid=2021)
        self.assertEqual(result['items'][0]['setupId'],SID)
        self.assertEqual(c.return_value.get.call_args.args[0],'/v1/project-setups/ops/awaiting-information')
        self.assertEqual(h.call_args.kwargs['actor_eid'],2021)
        self.assertTrue(h.call_args.kwargs['include_service_auth'])
    def test_rejects_raw_payload_unexpected_fields(self):
        for item in ({**sample()['items'][0],'valuesJson':'PRIVATE'},
                     {**sample()['items'][0],'externalState':'CONNECTED'},
                     {**sample()['items'][0],'jobNumber':'999'}):
            with patch.object(data_api,'_get_http_client') as c,patch.object(
                data_api,'_request_headers',return_value={}
            ):
                c.return_value.get.return_value=httpx.Response(200,json={**sample(),'items':[item]})
                with self.assertRaises(data_api.DataAPIInvalidResponse):
                    data_api.get_ops_project_setup_summary(actor_eid=2021)
    def test_disabled_and_forbidden_not_as_empty(self):
        for code,detail,ex in ((503,'project_setup_ops_discovery_disabled',data_api.DataAPIProjectSetupOpsDiscoveryDisabled),
                               (503,'project_setup_reads_disabled',data_api.DataAPIProjectSetupDisabled),
                               (403,'project_setup_forbidden',data_api.DataAPIRequestRejected)):
            with patch.object(data_api,'_get_http_client') as c,patch.object(
                data_api,'_request_headers',return_value={}
            ):
                c.return_value.get.return_value=httpx.Response(code,json={'detail':detail})
                with self.assertRaises(ex):data_api.get_ops_project_setup_summary(actor_eid=2021)

if __name__=='__main__':unittest.main()
