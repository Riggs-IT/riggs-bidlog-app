import unittest
from types import SimpleNamespace
from unittest.mock import patch,Mock
from uuid import UUID,uuid4
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app.unnumbered_project_editor import router
from backend.app.auth import get_current_user
from backend.app import data_api

SID=UUID('b83c8aa6-558b-545e-8bf8-7779236745f8')
def command(**kw):return dict(operationId=str(uuid4()),expectedRevision=0,action='ADD',resourceRole='FOREMAN',employeeEid=7,startDate='2027-02-03',endDate='2027-10-03')|kw
class BFFTests(unittest.TestCase):
    def setUp(self):
        self.user=SimpleNamespace(eid=2021,app_role='ADMIN');app=FastAPI();app.include_router(router);app.dependency_overrides[get_current_user]=lambda:self.user
        self.client=TestClient(app,raise_server_exceptions=False);self.addCleanup(self.client.close);self.path=f'/api/project-setups/jis/{SID}/field-team/plans';self.headers={'X-Riggs-Setup-Write':'1','Content-Type':'application/json'}
    def test_save_uses_session_actor_and_explicit_command(self):
        body=command()
        with patch.object(data_api,'request_setup_staffing',return_value={'revision':1}) as relay:
            self.assertEqual(self.client.patch(self.path,json=body,headers=self.headers).status_code,200);relay.assert_called_once_with(actor_eid=2021,setup_id=SID,body=body)
    def test_readonly_and_origin_checks(self):
        with patch.object(data_api,'request_setup_staffing',return_value={'canEdit':False}) as relay:
            self.user=SimpleNamespace(eid=176,app_role='MANAGEMENT_ADMIN');r=self.client.get(self.path);self.assertEqual(r.status_code,200);self.assertEqual(r.headers['cache-control'],'private, no-store');relay.assert_called_once_with(actor_eid=176,setup_id=SID);relay.reset_mock()
            self.assertEqual(self.client.patch(self.path,json=command(),headers=self.headers).status_code,403);self.user=SimpleNamespace(eid=2021,app_role='ADMIN');self.assertEqual(self.client.patch(self.path,json=command()).status_code,403);self.assertEqual(self.client.patch(self.path,json=command(),headers=self.headers|{'Sec-Fetch-Site':'cross-site'}).status_code,403);relay.assert_not_called()
    def test_validation_and_conflicts(self):
        with patch.object(data_api,'request_setup_staffing',side_effect=data_api.DataAPIRequestRejected(409,'field_team_revision_conflict')) as relay:
            for override in [dict(actorEid=176),dict(jobListId=24),dict(startDate=None),dict(endDate='2027-01-01'),dict(expectedRevision=-1),dict(employeeEid=True)]:self.assertEqual(self.client.patch(self.path,json=command(**override),headers=self.headers).status_code,422)
            relay.assert_not_called();r=self.client.patch(self.path,json=command(),headers=self.headers);self.assertEqual(r.status_code,409);self.assertEqual(r.json()['detail'],'field_team_revision_conflict')
    def test_transport_identity_receipt_and_no_retry(self):
        body=command();client=Mock();client.request.return_value=httpx.Response(200,json=dict(setupId=str(SID),operationId=body['operationId'],revision=1,scheduleId=113,replayed=False))
        with patch.object(data_api,'_get_http_client',return_value=client),patch.object(data_api,'_request_headers',return_value={'test':'header'}) as headers:
            result=data_api.request_setup_staffing(actor_eid=2021,setup_id=SID,body=body);self.assertEqual(result['revision'],1);client.request.assert_called_once_with('PATCH',f'/v1/project-setups/jis/{SID}/field-team/plans',json=body,headers={'test':'header'});headers.assert_called_once_with(include_service_auth=True,actor_eid=2021)
            client.request.reset_mock();client.request.side_effect=httpx.ReadTimeout('private detail');
            with self.assertRaises(data_api.DataAPIUnavailable):data_api.request_setup_staffing(actor_eid=2021,setup_id=SID,body=body)
            client.request.assert_called_once()
    def test_reject_wrong_readback(self):
        client=Mock();client.request.return_value=httpx.Response(200,json=dict(setupId=str(SID),revision=1,plans=[],canEdit=True))
        with patch.object(data_api,'_get_http_client',return_value=client),patch.object(data_api,'_request_headers',return_value={}):
            with self.assertRaises(data_api.DataAPIInvalidResponse):data_api.request_setup_staffing(actor_eid=176,setup_id=SID)
            body=command();client.request.return_value=httpx.Response(200,json=dict(setupId=str(SID),revision=1,operationId=str(uuid4()),scheduleId=113,replayed=False))
            with self.assertRaises(data_api.DataAPIInvalidResponse):data_api.request_setup_staffing(actor_eid=2021,setup_id=SID,body=body)
