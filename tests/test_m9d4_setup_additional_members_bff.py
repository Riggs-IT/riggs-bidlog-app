import unittest
from types import SimpleNamespace
from unittest.mock import patch, Mock
from uuid import UUID
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from backend.app import unnumbered_project_editor as routes
from backend.app import project_additional_members as roster
from backend.app.auth import get_current_user
SID=UUID('b83c8aa6-558b-545e-8bf8-7779236745f8')
OP='99999999-aaaa-4bbb-8ccc-123456789012'
BODY=dict(operationId=OP,expectedRevision=0,memberITUserIds=[11,22])

class Tests(unittest.TestCase):
    def setUp(self):
        app=FastAPI();app.include_router(routes.router);self.app=app
        app.dependency_overrides[get_current_user]=lambda:SimpleNamespace(eid=2021,app_role='ADMIN')
        self.client=TestClient(app);self.addCleanup(self.client.close)
        self.path=f'/api/project-setups/jis/{SID}/additional-members'
    def test_route_uses_session_actor_for_reads_and_writes(self):
        with patch.object(routes,'_roster_bridge',return_value={}) as bridge:
            r=self.client.get(self.path,headers={'X-Riggs-User-EID':'176'});self.assertEqual(r.status_code,200)
            self.assertEqual(bridge.call_args.args,('GET',None,2021));self.assertEqual(bridge.call_args.kwargs,dict(setup_id=SID))
            r=self.client.put(self.path,json=BODY,headers={'X-Riggs-Setup-Write':'1'});self.assertEqual(r.status_code,200);self.assertEqual(bridge.call_args.args,('PUT',None,2021,BODY))
    def test_management_read_only_and_viewer_denied(self):
        self.app.dependency_overrides[get_current_user]=lambda:SimpleNamespace(eid=176,app_role='MANAGEMENT_ADMIN')
        with patch.object(routes,'_roster_bridge',return_value={}) as bridge:
            self.assertEqual(self.client.get(self.path).status_code,200);self.assertEqual(bridge.call_args.args,('GET',None,176))
            bridge.reset_mock();self.assertEqual(self.client.put(self.path,json=BODY,headers={'X-Riggs-Setup-Write':'1'}).status_code,403);bridge.assert_not_called()
        self.app.dependency_overrides[get_current_user]=lambda:SimpleNamespace(eid=99,app_role='VIEWER')
        self.assertEqual(self.client.get(self.path).status_code,403)
    def test_origin_and_payload_rejected(self):
        with patch.object(routes,'_roster_bridge') as bridge:
            self.assertEqual(self.client.put(self.path,json=BODY).status_code,403)
            self.assertEqual(self.client.put(self.path,json=BODY,headers={'X-Riggs-Setup-Write':'1','Sec-Fetch-Site':'cross-site'}).status_code,403)
            for override in [dict(actorEid=2021),dict(memberITUserIds=[11,11]),dict(expectedRevision=9007199254740991)]:
                self.assertEqual(self.client.put(self.path,json=BODY|override,headers={'X-Riggs-Setup-Write':'1'}).status_code,422)
            bridge.assert_not_called()
    def test_bridge_exact_route_and_invalid_receipts(self):
        client=Mock();payload=dict(setupId=str(SID),jobListId=None,rosterRevision=0,persistence='SQL_ROSTER_ONLY',externalWrites=0,canEdit=False,canDistribute=False,members=[],directory=[],timeline=[],deliveryState='READY')
        with patch.object(roster.data_api,'_get_http_client',return_value=client),patch.object(roster.data_api,'_request_headers',return_value={'X-Test':'safe'}):
            client.request.return_value=httpx.Response(200,json=payload)
            self.assertEqual(roster._bridge('GET',None,176,setup_id=SID),payload)
            self.assertEqual(client.request.call_args.args,('GET',f'/v1/project-setups/jis/{SID}/additional-members'))
            for override in [dict(canEdit=True),dict(canDistribute=True),dict(jobListId=55),dict(setupId='bad'),dict(externalWrites=1)]:
                client.request.return_value=httpx.Response(200,json=payload|override)
                with self.assertRaises(HTTPException) as err:roster._bridge('GET',None,176,setup_id=SID)
                self.assertEqual(err.exception.status_code,502)
            client.request.return_value=httpx.Response(503,json={'detail':'project_setup_writes_disabled'})
            with self.assertRaises(HTTPException) as err:roster._bridge('PUT',None,2021,BODY,setup_id=SID)
            self.assertEqual(err.exception.detail,'project_setup_writes_disabled')
