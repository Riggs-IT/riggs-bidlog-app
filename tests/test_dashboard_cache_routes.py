"""HTTP tests against the actual app; all upstream calls/auth are mocked."""
from __future__ import annotations

from copy import deepcopy
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.app import main, data_api
from backend.app.auth import CurrentUser
from backend.app.dashboard_cache import DashboardReadCache


ROUTES = (
    ('/api/projected-billings/current-projects/primary-projection','get_current_projects_primary_projection',{'contractVersion':1,'projects':[],'items':[]}),
    ('/api/projected-billings/current-projects','get_current_projected_billings',[]),
    ('/api/projected-billings/current-projects/monthly','get_current_projects_monthly_bulk',{'items':[]}),
    ('/api/projected-billings/active-bids/dashboard','get_active_bid_dashboard',{'projects':{'items':[]},'monthly':[]}),
    ('/api/active-projects','get_current_projected_billings',[]),
    ('/api/projects/completed-directory','get_completed_projects',[]),
    ('/api/completed-projects','get_completed_projects',[]),
    ('/api/bid-log/active','get_active_bids',{'items':[]}),
)


def user(role='ADMIN', trade='PM', billing=True):
    return CurrentUser(
        eid=2021,it_user_id=1015,display_name='Synthetic Test User',app_role=role,
        employee_trade=trade,can_edit_billing=billing,billing_access_source='TEST',
        microsoft_username=None,entra_object_id='00000000-0000-0000-0000-000000000001',tenant_id='test',
    )


class DashboardCacheRouteTests(unittest.TestCase):
    def setUp(self):
        self.previous=main.app.dependency_overrides.copy()
        main.app.dependency_overrides[main.get_current_user]=lambda:user()
        self.client=TestClient(main.app)
        # No test can accidentally make a live bridge request.
        self.network=patch.object(data_api,'_get_http_client',side_effect=AssertionError('Unexpected real upstream access'))
        self.network.start();self.addCleanup(self.network.stop)
        self.addCleanup(self.client.close)
        self.addCleanup(self.restore)

    def restore(self):
        main.app.dependency_overrides.clear()
        main.app.dependency_overrides.update(self.previous)

    def test_active_directory_excludes_completed_rows_without_mutating_shared_summary(self):
        raw=[{'jobListId':i,'projectCompleted':v} for i,v in enumerate([False,True,0,1,'false','true',None,'0','1'],1)]
        original=deepcopy(raw)
        with patch.object(main,'get_current_projected_billings',return_value=raw):
            active=self.client.get('/api/active-projects?fresh=true')
            self.assertEqual(active.status_code,200)
            self.assertEqual([r['jobListId'] for r in active.json()],[1,3,5,7,8])
            self.assertEqual(raw,original)
            summary=self.client.get('/api/projected-billings/current-projects').json()
            self.assertEqual(len(summary),9)

    def test_completion_is_not_inferred_from_schedule_dates(self):
        raw=[{'jobListId':24,'projectCompleted':False,'projectedCompletionDate':'2000-01-01'}]
        with patch.object(main,'get_current_projected_billings',return_value=raw):
            self.assertEqual(self.client.get('/api/active-projects').json(),raw)

    def test_default_reads_keep_normal_cache_mode(self):
        for route,reader,payload in ROUTES:
            with self.subTest(route=route),patch.object(main,reader,return_value=payload) as call:
                response=self.client.get(route)
                self.assertEqual(response.status_code,200)
                self.assertIs(call.call_args.kwargs['fresh'],False)

    def test_explicit_fresh_forwarded_on_existing_get_routes(self):
        for route,reader,payload in ROUTES:
            with self.subTest(route=route),patch.object(main,reader,return_value=payload) as call:
                response=self.client.get(route,params={'fresh':'true'})
                self.assertEqual(response.status_code,200)
                self.assertIs(call.call_args.kwargs['fresh'],True)
                self.assertIn('no-store',response.headers['cache-control'])

    def test_fresh_does_not_bypass_authentication(self):
        def denied(): raise HTTPException(401,'authentication_required')
        main.app.dependency_overrides[main.get_current_user]=denied
        for route,reader,payload in ROUTES:
            with self.subTest(route=route),patch.object(main,reader,return_value=payload) as call:
                self.assertEqual(self.client.get(route,params={'fresh':True}).status_code,401)
                call.assert_not_called()

    def test_fresh_does_not_bypass_role_guards(self):
        main.app.dependency_overrides[main.get_current_user]=lambda:user('NONE','NONE',False)
        for route,reader,payload in ROUTES:
            with self.subTest(route=route),patch.object(main,reader,return_value=payload) as call:
                self.assertEqual(self.client.get(route,params={'fresh':True}).status_code,403)
                call.assert_not_called()

    def test_invalid_fresh_rejected_before_upstream_read(self):
        for route,reader,payload in ROUTES:
            with self.subTest(route=route),patch.object(main,reader,return_value=payload) as call:
                self.assertEqual(self.client.get(route,params={'fresh':'not-a-bool'}).status_code,422)
                call.assert_not_called()

    def test_filtered_active_bid_parameters_preserved(self):
        with patch.object(main,'get_active_bids',return_value={'items':[]}) as call:
            response=self.client.get('/api/bid-log/active?status=Assigned&search=x&limit=50&offset=10&fresh=true')
            self.assertEqual(response.status_code,200)
            self.assertEqual(call.call_args.kwargs,dict(bid_status='Assigned',search='x',limit=50,offset=10,fresh=True))

    def test_admin_viewer_cached_payload_isolation(self):
        raw=[{'jobListId':548,'projectionAmount':690102.36,'marginCollected':12,'nested':{'MarginPercent':0.2,'safe':None}}]
        expected=deepcopy(raw)
        with patch.object(data_api,'_dashboard_read_cache',DashboardReadCache()),patch.object(data_api,'_fetch_current_projected_billings',return_value=raw) as fetch:
            a=self.client.get('/api/projected-billings/current-projects').json()
            main.app.dependency_overrides[main.get_current_user]=lambda:user('VIEWER','',False)
            b=self.client.get('/api/projected-billings/current-projects').json()
            main.app.dependency_overrides[main.get_current_user]=lambda:user()
            c=self.client.get('/api/projected-billings/current-projects').json()
            self.assertEqual(a,expected);self.assertEqual(c,expected)
            self.assertNotIn('marginCollected',b[0]);self.assertNotIn('MarginPercent',b[0]['nested'])
            self.assertEqual(raw,expected);self.assertEqual(fetch.call_count,1)

    def test_same_route_fresh_bypasses_warm_response(self):
        with patch.object(data_api,'_dashboard_read_cache',DashboardReadCache()),patch.object(data_api,'_fetch_current_projected_billings',side_effect=[[{'projectionAmount':1}],[{'projectionAmount':2}]]) as fetch:
            route='/api/projected-billings/current-projects'
            self.assertEqual(self.client.get(route).json()[0]['projectionAmount'],1)
            self.assertEqual(self.client.get(route).json()[0]['projectionAmount'],1)
            self.assertEqual(self.client.get(route+'?fresh=true').json()[0]['projectionAmount'],2)
            self.assertEqual(self.client.get(route).json()[0]['projectionAmount'],2)
            self.assertEqual(fetch.call_count,2)

    def test_upstream_error_not_disguised_as_empty_portfolio(self):
        with patch.object(main,'get_current_projected_billings',side_effect=data_api.DataAPISQLUnavailable('synthetic')):
            response=self.client.get('/api/projected-billings/current-projects?fresh=true')
            self.assertEqual(response.status_code,503)
            self.assertEqual(response.json(),{'detail':'sql_unavailable'})


if __name__=='__main__': unittest.main()
