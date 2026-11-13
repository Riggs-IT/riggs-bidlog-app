"""AP4F4F: trusted session + exact revision, with management preview GET-only."""
from __future__ import annotations
from dataclasses import replace
import unittest
from unittest.mock import patch
from uuid import UUID
import httpx
from fastapi.testclient import TestClient
from starlette.requests import Request
from backend.app import main, data_api
from backend.app.auth import CurrentUser, get_current_user, is_passive_freshness_read

SID='00000000-0000-4000-8000-000000000001'
PATH=f'/api/project-setups/drafts/{SID}/readiness'
USER=CurrentUser(eid=2021,it_user_id=12,display_name='Synthetic',app_role='ADMIN',employee_trade=None,
 can_edit_billing=False,billing_access_source=None,microsoft_username=None,
 entra_object_id='00000000-0000-4000-8000-000000000010',tenant_id='00000000-0000-4000-8000-000000000020')

def response():
    return {'setupId':SID,'revision':5,'mappingVersion':'AP4F4F_51','basis':'SAVED_SQL_REVISION',
      'readiness':'BLOCKED','fieldReviewIsAdvisory':True,'fieldCount':51,'rootCount':32,
      'missingReviewFields':['gcLookupId'],
      'fields':[{'path':f'field{n}','state':'PRESENT','collector':'OPS'} for n in range(50)]+[
        {'path':'gcLookupId','state':'MISSING','collector':'BID'}],
      'blockers':[{'code':'SIGNED_AWARD_AMOUNT_NOT_ATTESTED','scope':'BUSINESS'}],
      'readyForJis':False,'form19CreateAuthorized':False,'canSaveIncompleteDraft':True,'externalWrites':0}

class Tests(unittest.TestCase):
    def setUp(self):
        main.app.dependency_overrides[get_current_user]=lambda:USER
        self.client=TestClient(main.app)
    def tearDown(self):
        main.app.dependency_overrides.clear();self.client.close()
    def test_admin_and_manager_only_read_trusted_actor(self):
        for eid,role in ((2021,'ADMIN'),(176,'MANAGEMENT_ADMIN')):
            main.app.dependency_overrides[get_current_user]=lambda eid=eid,role=role:replace(USER,eid=eid,app_role=role)
            with self.subTest(role=role),patch.object(main,'get_project_setup_readiness',return_value=response()) as reader:
                r=self.client.get(PATH,params={'expected_revision':5},headers={'X-Riggs-User-EID':'9999'})
                self.assertEqual(r.status_code,200)
                self.assertIn('no-store',r.headers['cache-control'])
                reader.assert_called_once_with(setup_id=UUID(SID),actor_eid=eid,expected_revision=5)
                self.assertIs(r.json()['form19CreateAuthorized'],False)
    def test_operational_roles_denied_before_bridge(self):
        for role in ('VIEWER','OPERATIONS'):
            main.app.dependency_overrides[get_current_user]=lambda role=role:replace(USER,app_role=role)
            with patch.object(main,'get_project_setup_readiness') as reader:
                self.assertEqual(self.client.get(PATH,params={'expected_revision':5}).status_code,403)
                reader.assert_not_called()
    def test_missing_revision_422_and_no_bridge(self):
        with patch.object(main,'get_project_setup_readiness') as reader:
            self.assertEqual(self.client.get(PATH).status_code,422)
            self.assertEqual(self.client.get(PATH,params={'expected_revision':0}).status_code,422)
            reader.assert_not_called()
    def test_conflict_returns_409_and_never_fabricates_ready(self):
        with patch.object(main,'get_project_setup_readiness',side_effect=data_api.DataAPIRequestRejected(409,'project_setup_conflict')):
            r=self.client.get(PATH,params={'expected_revision':5})
        self.assertEqual(r.status_code,409)
        self.assertNotIn('PRIVATE',r.text)
    def test_read_remains_passive_and_no_write_methods(self):
        request=Request({'type':'http','method':'GET','path':PATH,'headers':[(b'x-riggs-passive-read',b'1')]})
        self.assertTrue(is_passive_freshness_read(request))
        request=Request({'type':'http','method':'POST','path':PATH,'headers':[(b'x-riggs-passive-read',b'1')]})
        self.assertFalse(is_passive_freshness_read(request))
        self.assertEqual(self.client.post(PATH,params={'expected_revision':5}).status_code,405)
    def test_http_client_requires_exact_blocked_response(self):
        with patch.object(data_api,'_get_http_client') as client,patch.object(data_api,'_request_headers',return_value={}):
            client.return_value.get.return_value=httpx.Response(200,json=response())
            accepted=data_api.get_project_setup_readiness(setup_id=UUID(SID),actor_eid=2021,expected_revision=5)
            self.assertEqual(accepted['readiness'],'BLOCKED')
            bad=response();bad['form19CreateAuthorized']=True
            client.return_value.get.return_value=httpx.Response(200,json=bad)
            with self.assertRaises(data_api.DataAPIInvalidResponse):
                data_api.get_project_setup_readiness(setup_id=UUID(SID),actor_eid=2021,expected_revision=5)

if __name__=='__main__':unittest.main()
