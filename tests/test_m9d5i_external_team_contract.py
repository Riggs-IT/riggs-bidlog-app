import unittest
from uuid import uuid4
from pydantic import ValidationError
from backend.app.project_external_team_contract import ExternalTeamSaveRequest

class ExternalTeamContractTests(unittest.TestCase):
    def payload(self,contacts,**extra):return ExternalTeamSaveRequest(operationId=uuid4(),expectedRevision=0,contacts=contacts,**extra)
    def test_valid(self):self.assertEqual(self.payload([{'name':' Test ','email':'T@Example.COM'}]).contacts[0].email,'t@example.com')
    def test_clear(self):self.assertEqual(self.payload([]).contacts,[])
    def test_duplicate(self):
        with self.assertRaises(ValidationError):self.payload([{'name':'A','email':'A@B.com'},{'name':'B','email':'a@b.com'}])
    def test_invalid(self):
        for email in ['bad','a@b.com\nBCC:x@y.com','a@b..com']:
            with self.assertRaises(ValidationError):self.payload([{'name':'A','email':email}])
    def test_actor_rejected(self):
        with self.assertRaises(ValidationError):self.payload([],actorEid=2021)

class ProxyTests(unittest.TestCase):
    def test_numbered_write_uses_actor_and_single_request(self):
        import httpx
        from unittest.mock import Mock,patch
        from backend.app import data_api
        oid=str(uuid4());body={'operationId':oid,'expectedRevision':0,'contacts':[]}
        client=Mock();client.request.return_value=httpx.Response(200,json={'setupId':None,'jobListId':523,'operationId':oid})
        with patch.object(data_api,'_get_http_client',return_value=client),patch.object(data_api,'_request_headers',return_value={'synthetic':'header'}) as headers:
            data_api.request_project_external_team(actor_eid=176,job_id=523,body=body)
        headers.assert_called_once_with(include_service_auth=True,actor_eid=176)
        client.request.assert_called_once_with('PUT','/v1/project-setups/jis/numbered/523/external-team',json=body,headers={'synthetic':'header'})
    def test_wrong_receipt_rejected(self):
        import httpx
        from unittest.mock import Mock,patch
        from backend.app import data_api
        client=Mock();client.request.return_value=httpx.Response(200,json={'setupId':None,'jobListId':24})
        with patch.object(data_api,'_get_http_client',return_value=client),patch.object(data_api,'_request_headers',return_value={}):
            with self.assertRaises(data_api.DataAPIInvalidResponse):data_api.request_project_external_team(actor_eid=2021,job_id=523)
    def test_protected_scope_not_forwarded(self):
        from unittest.mock import patch
        from backend.app import data_api
        with patch.object(data_api,'_get_http_client') as client:
            with self.assertRaises(data_api.DataAPIRequestRejected):data_api.request_project_external_team(actor_eid=2021,job_id=24)
        client.assert_not_called()
