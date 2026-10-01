from __future__ import annotations

import ast
from copy import deepcopy
import os
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

from backend.app import data_api
from backend.app.dashboard_cache import DashboardReadCache


class CacheIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.cache=DashboardReadCache()
        self.patches=[
            patch.object(data_api,'_dashboard_read_cache',self.cache),
            patch.dict(os.environ,{'BID_LOG_DASHBOARD_CACHE_TTL_SECONDS':'30'}),
            patch.object(data_api,'_request_headers',return_value={}),
            patch.object(data_api,'_get_http_client'),
        ]
        self.started=[p.start() for p in self.patches]
        for p in self.patches: self.addCleanup(p.stop)
        self.http=self.started[-1].return_value
        self.response=MagicMock(status_code=200)
        self.response.json.return_value={'items':[], 'requireBaselineTotalMatch':True}
        for method in ('post','put','patch','get','request'):
            getattr(self.http,method).return_value=self.response

    def warm(self):
        for key in ('current_project_summary','current_project_monthly_bulk','completed_projects'):
            data_api._dashboard_cached(key,lambda:'old')
        data_api._dashboard_cached('active_bid_list:keep',lambda:'unrelated')

    def assert_invalidated(self):
        for key in ('current_project_summary','current_project_monthly_bulk','completed_projects'):
            self.assertEqual(data_api._dashboard_cached(key,lambda:'new'),'new',key)
        self.assertEqual(data_api._dashboard_cached('active_bid_list:keep',lambda:'wrong'),'unrelated')

    def test_read_wrappers_share_then_bypass(self):
        for name in ('active_bids','completed_projects','current_projected_billings','current_projects_monthly_bulk','active_bid_dashboard'):
            with self.subTest(name=name), patch.object(data_api,'_fetch_'+name) as fetch:
                self.cache.invalidate_prefix('')
                fetch.side_effect=[{'items':[0,None]}, {'items':[1,None]}]
                public=getattr(data_api,'get_'+name)
                self.assertEqual(public(),{'items':[0,None]})
                self.assertEqual(public(),{'items':[0,None]})
                self.assertEqual(public(fresh=True),{'items':[1,None]})
                self.assertEqual(fetch.call_count,2)

    def test_list_keys_separate_filter_and_page_and_normalize_spaces(self):
        with patch.object(data_api,'_fetch_active_bids',return_value={'items':[]}) as fetch:
            for params in ({'search':' x '},{'search':'x'}, {'search':'y'}, {'search':'x','offset':10}, {'search':'x','bid_status':'Assigned'}):
                data_api.get_active_bids(**params)
            self.assertEqual(fetch.call_count,4)
            self.assertEqual(fetch.call_args_list[0].kwargs['search'],'x')
            self.assertNotIn('fresh',fetch.call_args_list[0].kwargs)

    def test_zero_setting_disables_retention(self):
        with patch.dict(os.environ,{'BID_LOG_DASHBOARD_CACHE_TTL_SECONDS':'0'}), patch.object(data_api,'_fetch_completed_projects',return_value=[]) as fetch:
            data_api.get_completed_projects();data_api.get_completed_projects()
            self.assertEqual(fetch.call_count,2)
            self.assertEqual(self.cache.info()['entries'],0)

    def test_ttl_compatibility_and_nonfinite_values(self):
        for text,expected in [('30',30),('3000',300),('-1',0),('0',0),('abc',30),('nan',30),('inf',30),('-inf',30),('',30),(' 12.5 ',12.5)]:
            with self.subTest(value=text),patch.dict(os.environ,{'BID_LOG_DASHBOARD_CACHE_TTL_SECONDS':text}):
                self.assertEqual(data_api._dashboard_cache_ttl_seconds(),expected)

    def test_pm_save_invalidates_after_success_preserving_payload(self):
        self.warm()
        payload={'expectedLatestForecastVersionId':179,'items':[{'monthStart':'2027-08-01','forecastAmount':0}],'notes':None}
        before=deepcopy(payload)
        result=data_api.save_current_project_pm_forecast(548,payload,actor_eid=2021,request_id='test')
        self.assertEqual(payload,before)
        self.assertEqual(self.http.post.call_args.kwargs['json'],before)
        self.assertEqual(self.http.post.call_count,1)
        self.assertEqual(result,self.response.json.return_value)
        self.assert_invalidated()

    def test_failed_pm_save_neither_invalidates_nor_retries(self):
        self.warm();self.response.status_code=409;self.response.json.return_value={'detail':'conflict'}
        with self.assertRaises(data_api.DataAPIRequestRejected):
            data_api.save_current_project_pm_forecast(548,{'items':[]},actor_eid=2021,request_id='test')
        self.assertEqual(self.http.post.call_count,1)
        self.assertEqual(data_api._dashboard_cached('current_project_summary',lambda:'wrong'),'old')

    def test_admin_correction_invalidates(self):
        self.warm()
        data_api.save_current_project_pm_forecast_admin_correction(548,{'items':[],'correctionReason':'test'},actor_eid=2021,request_id='test')
        self.assert_invalidated()

    def test_policy_writes_invalidate(self):
        for call in (
            lambda: data_api.update_pm_forecast_policy({'requireBaselineTotalMatch':True},actor_eid=2021,request_id='test'),
            lambda: data_api.update_current_project_pm_forecast_policy(548,{'requireBaselineTotalMatch':True},actor_eid=2021,request_id='test'),
        ):
            self.warm();call();self.assert_invalidated()

    def test_staffing_success_invalidates_without_changing_writer(self):
        for method,route in ((data_api.assign_active_project_staffing,'assignments'),(data_api.unassign_active_project_staffing,'unassignments')):
            self.warm()
            method(548,{'employeeEid':15,'role':'SUPER'},actor_eid=2021,request_id='test')
            self.assertEqual(self.http.request.call_args.args[:2],('POST','/v1/staffing/'+route))
            self.assert_invalidated()

    def test_originating_bid_link_invalidates_project_and_bid_dashboard(self):
        self.warm();data_api._dashboard_cached('active_bid_dashboard',lambda:'old')
        data_api.link_current_project_originating_bid(548,1215,actor_eid=2021,request_id='test')
        self.assertEqual(self.http.request.call_args.kwargs['json_payload'] if 'json_payload' in self.http.request.call_args.kwargs else self.http.request.call_args.kwargs['json'],{'originalBidLogId':1215})
        self.assert_invalidated()
        self.assertEqual(data_api._dashboard_cached('active_bid_dashboard',lambda:'new'),'new')

    def test_normal_project_save_retains_existing_invalidation(self):
        self.warm()
        data_api.update_active_project(548,{},actor_eid=2021,request_id='test')
        self.assert_invalidated()

    def test_current_pm_policy_history_version_attention_remain_uncached(self):
        source=Path('backend/app/data_api.py').read_text(); tree=ast.parse(source)
        for name in ('get_current_project_pm_forecast','get_current_project_pm_forecast_history','get_current_project_pm_forecast_version','get_current_project_pm_forecast_policy','get_pm_forecast_attention'):
            node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
            segment=ast.get_source_segment(source,node)
            self.assertNotIn('_dashboard_cached',segment,name)

    def test_five_public_read_functions_are_defined_once(self):
        tree=ast.parse(Path('backend/app/data_api.py').read_text())
        for name in ('get_active_bids','get_completed_projects','get_current_projected_billings','get_current_projects_monthly_bulk','get_active_bid_dashboard'):
            self.assertEqual(sum(isinstance(n,ast.FunctionDef) and n.name==name for n in tree.body),1,name)

    def test_fresh_never_added_to_bridge_query(self):
        payload=[]
        self.response.json.return_value=payload
        with patch.object(data_api,'_get_service_response',return_value=self.response) as upstream:
            data_api.get_current_projected_billings(fresh=True)
            self.assertEqual(upstream.call_args.args[0],'/v1/bid-log/current-projects?includeCompletedBilling=true')
            self.assertNotIn('fresh',upstream.call_args.kwargs)


if __name__=='__main__': unittest.main()
