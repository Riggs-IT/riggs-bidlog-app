import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID,uuid4
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app.unnumbered_project_editor import router
from backend.app.auth import get_current_user
from backend.app import data_api

SID=UUID('b83c8aa6-558b-545e-8bf8-7779236745f8')
class TestMetricsBFF(unittest.TestCase):
    def setUp(self):
        self.user=SimpleNamespace(eid=2021,app_role='ADMIN');app=FastAPI();app.include_router(router)
        app.dependency_overrides[get_current_user]=lambda:self.user
        self.client=TestClient(app,raise_server_exceptions=False);self.path=f'/api/project-setups/jis/{SID}/metrics'
        self.body=dict(operationId=str(uuid4()),expectedRevision=2,setSquareFootage=True,setCubicYards=False,squareFootage='0')
        self.hdr={'X-Riggs-Setup-Write':'1','Content-Type':'application/json'}
    def tearDown(self):self.client.close()
    def test_session_actor_and_exact_patch(self):
        with patch.object(data_api,'request_unnumbered_project_metrics',return_value={'result':'UPDATED'}) as relay:
            r=self.client.patch(self.path,json=self.body,headers=self.hdr);self.assertEqual(r.status_code,200);relay.assert_called_once_with(actor_eid=2021,setup_id=SID,body=self.body)
    def test_management_readonly(self):
        self.user=SimpleNamespace(eid=176,app_role='MANAGEMENT_ADMIN')
        with patch.object(data_api,'request_unnumbered_project_metrics',return_value={'canEdit':False}) as relay:
            self.assertEqual(self.client.get(self.path).status_code,200);relay.assert_called_once_with(actor_eid=176,setup_id=SID);relay.reset_mock()
            self.assertEqual(self.client.patch(self.path,json=self.body,headers=self.hdr).status_code,403);relay.assert_not_called()
    def test_bad_fields_and_origin(self):
        with patch.object(data_api,'request_unnumbered_project_metrics') as relay:
            self.assertEqual(self.client.patch(self.path,json=self.body).status_code,403)
            self.assertEqual(self.client.patch(self.path,json=self.body,headers=self.hdr|{'Sec-Fetch-Site':'cross-site'}).status_code,403)
            for extra in ({'jobListId':24},{'actorEid':176},{'squareFootage':None},{'squareFootage':'-5'}):
                self.assertEqual(self.client.patch(self.path,json=self.body|extra,headers=self.hdr).status_code,422)
            relay.assert_not_called()
    def test_conflict_code(self):
        with patch.object(data_api,'request_unnumbered_project_metrics',side_effect=data_api.DataAPIRequestRejected(409,'project_metrics_revision_conflict')):
            self.assertEqual(self.client.patch(self.path,json=self.body,headers=self.hdr).status_code,409)
