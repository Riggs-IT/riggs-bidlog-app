import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID, uuid4
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app.unnumbered_project_editor import router
from backend.app.auth import get_current_user
from backend.app import data_api

SID=UUID('b83c8aa6-558b-545e-8bf8-7779236745f8')

class Tests(unittest.TestCase):
    def setUp(self):
        self.user=SimpleNamespace(eid=2021,app_role='ADMIN');app=FastAPI();app.include_router(router)
        app.dependency_overrides[get_current_user]=lambda:self.user
        self.client=TestClient(app,raise_server_exceptions=False);self.path=f'/api/project-setups/jis/{SID}'
        self.body={'operationId':str(uuid4()),'expectedRevision':2,'expectedEntryId':1200,'expectedVersion':1,'changes':{'scope':'New'}}
        self.write_headers={'X-Riggs-Setup-Write':'1','Content-Type':'application/json'}
    def tearDown(self):self.client.close()
    def test_actor_comes_from_session(self):
        with patch.object(data_api,'request_unnumbered_project_editor',return_value={'result':'VERIFIED'}) as relay:
            r=self.client.patch(self.path,json=self.body,headers=self.write_headers);self.assertEqual(r.status_code,200)
            relay.assert_called_once_with(actor_eid=2021,setup_id=SID,body=self.body)
    def test_cross_site_and_missing_header_block(self):
        with patch.object(data_api,'request_unnumbered_project_editor') as relay:
            self.assertEqual(self.client.patch(self.path,json=self.body).status_code,403)
            self.assertEqual(self.client.patch(self.path,json=self.body,headers={**self.write_headers,'Sec-Fetch-Site':'cross-site'}).status_code,403)
            relay.assert_not_called()
    def test_management_can_read_not_save(self):
        self.user=SimpleNamespace(eid=176,app_role='MANAGEMENT_ADMIN')
        with patch.object(data_api,'request_unnumbered_project_editor',return_value={'externalState':'CREATED_UNNUMBERED'}) as relay:
            self.assertEqual(self.client.get(self.path).status_code,200)
            self.assertEqual(self.client.patch(self.path,json=self.body,headers=self.write_headers).status_code,403)
            relay.assert_called_once_with(actor_eid=176,setup_id=SID)
    def test_management_directory_and_contract_preview_remain_visible(self):
        self.user=SimpleNamespace(eid=176,app_role='MANAGEMENT_ADMIN')
        with patch.object(data_api,'request_unnumbered_project_editor',return_value={'externalState':'CREATED_UNNUMBERED'}) as relay:
            self.assertEqual(self.client.get('/api/project-setups/jis').status_code,200)
            relay.assert_called_once_with(actor_eid=176)
            relay.reset_mock()
            self.assertEqual(self.client.patch(self.path,json={**self.body,'changes':{'contractFlag':True}},headers=self.write_headers).status_code,403)
            relay.assert_not_called()
    def test_viewer_denied_and_actor_in_body_rejected(self):
        with patch.object(data_api,'request_unnumbered_project_editor') as relay:
            self.user=SimpleNamespace(eid=2021,app_role='VIEWER')
            self.assertEqual(self.client.get(self.path).status_code,403)
            self.user=SimpleNamespace(eid=2021,app_role='ADMIN')
            self.assertEqual(self.client.patch(self.path,json={**self.body,'actorEid':176},headers=self.write_headers).status_code,422)
            relay.assert_not_called()
    def test_safe_error_response(self):
        with patch.object(data_api,'request_unnumbered_project_editor',side_effect=data_api.DataAPIRequestRejected(409,'project_setup_conflict')):
            r=self.client.patch(self.path,json=self.body,headers=self.write_headers);self.assertEqual(r.status_code,409);self.assertEqual(r.json()['detail'],'project_setup_conflict')

    def test_manual_refresh_preserves_session_authorization(self):
        with patch.object(data_api,'request_unnumbered_project_editor',return_value={'externalState':'CREATED_UNNUMBERED'}) as relay:
            self.assertEqual(self.client.get(self.path+'?fresh=true').status_code,200)
            relay.assert_called_once_with(actor_eid=2021,setup_id=SID,fresh=True)
            relay.reset_mock()
            self.user=SimpleNamespace(eid=176,app_role='VIEWER')
            self.assertEqual(self.client.get(self.path+'?fresh=true').status_code,403)
            relay.assert_not_called()
