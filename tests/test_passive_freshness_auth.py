"""Real auth dependency + signed-session middleware, no OAuth or upstream I/O."""
from __future__ import annotations
from copy import deepcopy
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware
from backend.app import auth

COOKIE='riggs_bid_log_session'
PATH='/api/projected-billings/current-projects'
HEADER={'X-Riggs-Passive-Read':'1'}

class PassiveFreshnessAuthTests(unittest.TestCase):
    def setUp(self):
        self.seed={'entra_identity':{'oid':'synthetic'},'session_revision':'test','last_activity_at':1000}
        self.settings=patch.object(auth,'settings',SimpleNamespace(auth_mode='entra',entra_configured=True,
            session_revision='test',session_idle_timeout_seconds=3600))
        self.settings.start();self.addCleanup(self.settings.stop)
        self.clock=patch.object(auth,'time',return_value=1100);self.clock.start();self.addCleanup(self.clock.stop)
        self.resolver=patch.object(auth,'resolve_entra_user',return_value=SimpleNamespace(eid=2021));self.resolve=self.resolver.start();self.addCleanup(self.resolver.stop)
        self.app=FastAPI();self.app.add_middleware(SessionMiddleware,secret_key='synthetic-tests-only',session_cookie=COOKIE)
        @self.app.middleware('http')
        async def cookies(request,call_next):
            response=await call_next(request)
            auth.suppress_unchanged_passive_cookie(request,response,COOKIE)
            return response
        @self.app.get('/seed')
        def seed(request:Request):request.session.update(deepcopy(self.seed));return {}
        def endpoint(request:Request,user=Depends(auth.get_current_user)):
            response=JSONResponse({'eid':user.eid,'last_activity_at':request.session.get('last_activity_at')})
            if request.query_params.get('extra'):response.set_cookie('other','kept')
            if request.query_params.get('mutate'):request.session['changed']='test'
            return response
        for p in [PATH,'/api/projected-billings/current-projects/primary-projection','/api/projected-billings/current-projects/monthly','/api/projected-billings/active-bids/dashboard',
                  '/api/pm-forecast/attention','/api/current-projects/24/pm-forecast','/api/current-projects/24/pm-forecast/history',
                  '/api/current-projects/24/pm-forecast/history/1','/api/current-projects/24/pm-forecast/policy',
                  '/api/other','/api/current-projects/0/pm-forecast','/api/current-projects/24/pm-forecast/admin-correction']:
            self.app.add_api_route(p,endpoint,methods=['GET','POST','PUT'])
        self.client=TestClient(self.app);self.addCleanup(self.client.close)
        self.client.get('/seed')
    def test_passive_preserves_activity(self):
        r=self.client.get(PATH,headers=HEADER);self.assertEqual(r.status_code,200);self.assertEqual(r.json()['last_activity_at'],1000);self.resolve.assert_called_once()
    def test_primary_projection_read_is_passive_with_fresh_flag(self):
        r=self.client.get('/api/projected-billings/current-projects/primary-projection?fresh=true',headers=HEADER)
        self.assertEqual(r.status_code,200);self.assertEqual(r.json()['last_activity_at'],1000)
        self.assertNotIn('set-cookie',r.headers)
    def test_normal_read_marks_activity(self):
        r=self.client.get(PATH);self.assertEqual(r.json()['last_activity_at'],1100);self.assertIn(COOKIE,r.headers['set-cookie'])
    def test_passive_success_does_not_reissue_cookie(self):
        r=self.client.get(PATH,headers=HEADER);self.assertNotIn('set-cookie',r.headers)
    def test_unrelated_cookies_preserved(self):
        r=self.client.get(PATH+'?extra=1',headers=HEADER);self.assertIn('other=',r.headers['set-cookie']);self.assertNotIn(COOKIE+'=',r.headers['set-cookie'])
    def test_modified_session_cookie_is_not_suppressed(self):
        r=self.client.get(PATH+'?mutate=1',headers=HEADER);self.assertIn(COOKIE+'=',r.headers['set-cookie'])
    def test_post_cannot_be_passive(self):
        r=self.client.post(PATH,headers=HEADER);self.assertEqual(r.json()['last_activity_at'],1100)
    def test_put_cannot_be_passive(self):
        r=self.client.put('/api/current-projects/24/pm-forecast/policy',headers=HEADER);self.assertEqual(r.json()['last_activity_at'],1100)
    def test_other_endpoint_not_passive(self):
        r=self.client.get('/api/other',headers=HEADER);self.assertEqual(r.json()['last_activity_at'],1100)
    def test_malformed_header_not_passive(self):
        r=self.client.get(PATH,headers={'X-Riggs-Passive-Read':'true'});self.assertEqual(r.json()['last_activity_at'],1100)
    def test_no_session_is_still_401(self):
        self.client.cookies.clear();r=self.client.get(PATH,headers=HEADER);self.assertEqual(r.status_code,401);self.resolve.assert_not_called()
    def test_bad_signature_is_still_401(self):
        self.client.cookies.clear();self.client.cookies.set(COOKIE,'not-signed');r=self.client.get(PATH,headers=HEADER);self.assertEqual(r.status_code,401)
    def test_expired_idle_still_clears_session_cookie(self):
        self.clock.stop();self.clock=patch.object(auth,'time',return_value=4601);self.clock.start()
        r=self.client.get(PATH,headers=HEADER);self.assertEqual(r.status_code,401);self.assertEqual(r.json()['detail'],'session_inactive_timeout');self.assertIn('expires=',r.headers['set-cookie'].lower())
    def test_changed_revision_still_clears_cookie(self):
        self.seed['session_revision']='old';self.client.get('/seed');r=self.client.get(PATH,headers=HEADER)
        self.assertEqual(r.status_code,401);self.assertEqual(r.json()['detail'],'application_updated');self.assertIn('expires=',r.headers['set-cookie'].lower())
    def test_invalid_activity_is_denied(self):
        self.seed['last_activity_at']='bad';self.client.get('/seed');r=self.client.get(PATH,headers=HEADER);self.assertEqual(r.status_code,401)
    def test_missing_activity_does_not_start_new_idle_window(self):
        self.client.cookies.clear();self.seed.pop('last_activity_at');self.client.get('/seed');r=self.client.get(PATH,headers=HEADER);self.assertEqual(r.status_code,401)
    def test_access_denial_still_propagates(self):
        self.resolve.side_effect=HTTPException(403,'not_authorized');r=self.client.get(PATH,headers=HEADER);self.assertEqual(r.status_code,403)
    def test_passive_caller_cannot_supply_actor(self):
        r=self.client.get(PATH,headers={**HEADER,'X-Riggs-User-EID':'999'});self.assertEqual(r.json()['eid'],2021)
    def test_allowlisted_forecast_reads_are_passive(self):
        for path in ['/api/pm-forecast/attention','/api/current-projects/24/pm-forecast','/api/current-projects/24/pm-forecast/history','/api/current-projects/24/pm-forecast/history/1','/api/current-projects/24/pm-forecast/policy']:
            with self.subTest(path=path):
                r=self.client.get(path,headers=HEADER);self.assertEqual(r.json()['last_activity_at'],1000);self.assertNotIn('set-cookie',r.headers)
    def test_write_action_and_invalid_id_not_allowlisted(self):
        for path in ['/api/current-projects/0/pm-forecast','/api/current-projects/24/pm-forecast/admin-correction']:
            with self.subTest(path=path):
                r=self.client.get(path,headers=HEADER);self.assertEqual(r.json()['last_activity_at'],1100)
