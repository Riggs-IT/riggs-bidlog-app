"""AP4F BFF ADMIN isolation, guarded writes and no automatic replay."""
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import UUID
import httpx
from fastapi.testclient import TestClient
from starlette.requests import Request
from backend.app import main, data_api, project_setup_authoring as routes
from backend.app.auth import CurrentUser, get_current_user, is_passive_freshness_read

SID='00000000-0000-4000-8000-000000000001';CID='00000000-0000-4000-8000-000000000002';OID='00000000-0000-4000-8000-000000000003'
PATH='/api/project-setups/authoring/awards/101'
EDIT_PATH=f'/api/project-setups/authoring/drafts/{SID}/edits'
USER=CurrentUser(eid=2021,it_user_id=12,display_name='Synthetic',app_role='ADMIN',employee_trade=None,
    can_edit_billing=False,billing_access_source=None,microsoft_username=None,
    entra_object_id='00000000-0000-4000-8000-000000000010',tenant_id='00000000-0000-4000-8000-000000000020')
HEADER={'X-Riggs-Setup-Write':'1','X-Riggs-User-EID':'999999','Origin':'https://example.test'}
START={'operationId':OID,'expectedSourceVersion':'a'*64}
EDIT={'operationId':OID,'expectedRevision':1,'changes':{'comments':'Ops'}}
def context():return {'originalBidLogId':101,'mode':'CREATE_INITIAL','sourceVersion':'a'*64,
   'choices':[],'persistence':'SQL_DRAFT_ONLY','externalState':'NOT_CONNECTED'}
def receipt():return {'setupId':SID,'operationId':OID,'revision':2,'action':'UPDATED','replayed':False,
   'persisted':True,'externalWrites':0,'persistence':'SQL_DRAFT_ONLY','sharedChangesState':'NOT_DISPATCHED'}
def started():return {'setup':{'setupId':SID,'childId':CID,'originalBidLogId':101,'revision':1,
   'values':{},'originatingBid':{'originalBidLogId':101},'jobNumber':None,'cognitoEntryId':None,'jobListId':None},
   'action':'CREATED','externalState':'NOT_CONNECTED','persistence':'SQL_DRAFT_ONLY','externalWrites':0}

class RouteTests(unittest.TestCase):
    def setUp(self):
        main.app.dependency_overrides[get_current_user]=lambda:USER
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client=TestClient(main.app);self.addCleanup(self.client.close)
        p=patch.object(routes,'get_settings',return_value=SimpleNamespace(entra_redirect_uri='https://example.test/api/auth/callback'))
        p.start();self.addCleanup(p.stop)
    def test_get_uses_session_eid_not_browser_header(self):
        with patch.object(data_api,'get_project_setup_award_context',return_value=context()) as reader:
            r=self.client.get(PATH,headers=HEADER)
        self.assertEqual(r.status_code,200);self.assertIn('no-store',r.headers['cache-control'])
        self.assertEqual(reader.call_args.kwargs,{'bid_id':101,'actor_eid':2021})
    def test_post_uses_server_actor_and_only_version_operation(self):
        with patch.object(data_api,'start_initial_project_setup',return_value=started()) as writer:
            r=self.client.post(PATH+'/start',headers=HEADER,json=START)
        self.assertEqual(r.status_code,200);self.assertEqual(writer.call_args.kwargs,
            {'bid_id':101,'actor_eid':2021,'body':START})
    def test_patch_uses_expected_revision_and_same_operation(self):
        with patch.object(data_api,'edit_project_setup_draft',return_value=receipt()) as writer:
            r=self.client.patch(EDIT_PATH,headers=HEADER,json=EDIT)
        self.assertEqual(r.status_code,200);self.assertEqual(writer.call_args.kwargs,
            {'setup_id':UUID(SID),'actor_eid':2021,'body':EDIT})
    def test_all_nonadmin_roles_denied(self):
        for role in ('OPERATIONS','MANAGEMENT_ADMIN','MANAGEMENT','VIEWER','PM',''):
            main.app.dependency_overrides[get_current_user]=lambda role=role:replace(USER,app_role=role)
            with self.subTest(role=role),patch.object(data_api,'start_initial_project_setup') as writer:
                self.assertEqual(self.client.post(PATH+'/start',headers=HEADER,json=START).status_code,403)
                writer.assert_not_called()
    def test_invalid_actor_denied(self):
        main.app.dependency_overrides[get_current_user]=lambda:replace(USER,eid=0)
        with patch.object(data_api,'get_project_setup_award_context') as reader:
            self.assertEqual(self.client.get(PATH).status_code,401);reader.assert_not_called()
    def test_missing_custom_write_header_denied(self):
        with patch.object(data_api,'start_initial_project_setup') as writer:
            self.assertEqual(self.client.post(PATH+'/start',json=START).status_code,403);writer.assert_not_called()
    def test_cross_origin_denied(self):
        r=self.client.post(PATH+'/start',headers={**HEADER,'Origin':'https://wrong.test'},json=START)
        self.assertEqual(r.status_code,403)
    def test_fetch_metadata_cross_site_denied(self):
        r=self.client.post(PATH+'/start',headers={**HEADER,'Sec-Fetch-Site':'cross-site'},json=START)
        self.assertEqual(r.status_code,403)
    def test_unknown_seed_and_actor_not_forwarded_or_echoed(self):
        for key in ('actorEid','award','values','childId','jobNumber'):
            with self.subTest(key=key),patch.object(data_api,'start_initial_project_setup') as writer:
                r=self.client.post(PATH+'/start',headers=HEADER,json={**START,key:'PRIVATE_SENTINEL'})
                self.assertEqual(r.status_code,422);self.assertNotIn('PRIVATE_SENTINEL',r.text);writer.assert_not_called()
    def test_protected_edit_fields_rejected(self):
        for field in ('jobNumber','gcLookupId','foremanEids','cognitoEntryId','controlProjectName','pmITUserId'):
            with self.subTest(field=field),patch.object(data_api,'edit_project_setup_draft') as writer:
                r=self.client.patch(EDIT_PATH,headers=HEADER,json={**EDIT,'changes':{field:None}})
                self.assertEqual(r.status_code,422);writer.assert_not_called()
    def test_failure_remains_error_not_empty(self):
        for exc,status in ((data_api.DataAPIRequestRejected(503,'project_setup_writes_disabled'),503),
                           (data_api.DataAPIRequestRejected(409,'project_setup_conflict'),409),
                           (data_api.DataAPIInvalidResponse(),502),(RuntimeError('PRIVATE'),503)):
            with self.subTest(status=status),patch.object(data_api,'edit_project_setup_draft',side_effect=exc):
                r=self.client.patch(EDIT_PATH,headers=HEADER,json=EDIT)
                self.assertEqual(r.status_code,status);self.assertNotIn('PRIVATE',r.text)
    def test_get_is_passive_but_writes_never_are(self):
        for method,path,expected in [('GET',PATH,True),('POST',PATH+'/start',False),('PATCH',EDIT_PATH,False)]:
            request=Request({'type':'http','method':method,'path':path,'headers':[(b'x-riggs-passive-read',b'1')]})
            self.assertEqual(is_passive_freshness_read(request),expected)
    def test_no_alternate_mutation_routes(self):
        for method in ('put','delete'):
            self.assertIn(getattr(self.client,method)(EDIT_PATH,headers=HEADER).status_code,(404,405))
    def test_body_size_rejected(self):
        r=self.client.patch(EDIT_PATH,headers=HEADER,json={**EDIT,'changes':{'comments':'x'*262145}})
        self.assertEqual(r.status_code,422);self.assertLess(len(r.content),1000)

class ClientTests(unittest.TestCase):
    def mocked(self,result):
        client=patch.object(data_api,'_get_http_client');headers=patch.object(data_api,'_request_headers',return_value={})
        self.client=client.start();self.headers=headers.start();self.addCleanup(client.stop);self.addCleanup(headers.stop)
        self.client.return_value.request.return_value=httpx.Response(200,json=result)
    def test_context_reuses_pooled_client_app_credentials(self):
        self.mocked(context());self.assertEqual(data_api.get_project_setup_award_context(bid_id=101,actor_eid=2021),context())
        self.assertEqual(self.client.return_value.request.call_args.args,('GET','/v1/project-setups/authoring/awards/101'))
        self.headers.assert_called_once_with(include_service_auth=True,actor_eid=2021)
    def test_start_response_same_bid_no_external_ids(self):
        self.mocked(started());data_api.start_initial_project_setup(bid_id=101,actor_eid=2021,body=START)
        self.assertEqual(self.client.return_value.request.call_count,1)
    def test_invalid_start_identity_refused(self):
        result=started();result['setup']['jobNumber']='FAKE';self.mocked(result)
        with self.assertRaises(data_api.DataAPIInvalidResponse):data_api.start_initial_project_setup(bid_id=101,actor_eid=2021,body=START)
    def test_edit_receipt_validated(self):
        self.mocked(receipt());r=data_api.edit_project_setup_draft(setup_id=UUID(SID),actor_eid=2021,body=EDIT)
        self.assertEqual(r['externalWrites'],0)
    def test_incorrect_edit_operation_refused(self):
        result=receipt();result['operationId']=CID;self.mocked(result)
        with self.assertRaises(data_api.DataAPIInvalidResponse):data_api.edit_project_setup_draft(setup_id=UUID(SID),actor_eid=2021,body=EDIT)
    def test_no_timeout_auto_replay(self):
        self.mocked(receipt());self.client.return_value.request.side_effect=httpx.ReadTimeout('PRIVATE')
        with self.assertRaises(data_api.DataAPIUnavailable):data_api.edit_project_setup_draft(setup_id=UUID(SID),actor_eid=2021,body=EDIT)
        self.assertEqual(self.client.return_value.request.call_count,1)
    def test_sql_denial_forwarded_as_fixed_error(self):
        self.mocked({});self.client.return_value.request.return_value=httpx.Response(403,json={'detail':'project_setup_forbidden'})
        with self.assertRaises(data_api.DataAPIRequestRejected) as c:data_api.get_project_setup_award_context(bid_id=101,actor_eid=2021)
        self.assertEqual(c.exception.status_code,403)
    def test_unknown_upstream_detail_not_echoed(self):
        self.mocked({});self.client.return_value.request.return_value=httpx.Response(422,json={'detail':'PRIVATE'})
        with self.assertRaises(data_api.DataAPIRequestRejected) as c:data_api.start_initial_project_setup(bid_id=101,actor_eid=2021,body=START)
        self.assertEqual(c.exception.detail,'project_setup_invalid_request')

if __name__=='__main__':unittest.main()
