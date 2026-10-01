"""PM-first BFF reader uses the existing transport/cache; no real network."""
from copy import deepcopy
import unittest
from unittest.mock import patch
import httpx
from backend.app import data_api as api
from backend.app.dashboard_cache import DashboardReadCache

PATH='/v1/bid-log/current-projects/primary-projection'

class PrimaryProjectionReaderTests(unittest.TestCase):
    def setUp(self):
        self.cache=patch.object(api,'_dashboard_read_cache',DashboardReadCache());self.cache.start();self.addCleanup(self.cache.stop)
        self.ttl=patch.object(api,'_dashboard_cache_ttl_seconds',return_value=30);self.ttl.start();self.addCleanup(self.ttl.stop)
        self.no_network=patch.object(api,'_get_http_client',side_effect=AssertionError('Network forbidden'));self.no_network.start();self.addCleanup(self.no_network.stop)
        self.payload={'contractVersion':1,'readCompletedAtUTC':'2026-09-30T22:30:00Z','projects':[],'items':[]}
    def response(self,payload):return httpx.Response(200,json=payload,request=httpx.Request('GET','https://synthetic.invalid'+PATH))
    def test_uses_existing_service_transport(self):
        with patch.object(api,'_get_service_response',return_value=self.response(self.payload)) as read:
            self.assertEqual(api.get_current_projects_primary_projection(),self.payload)
            self.assertEqual(read.call_args.args,(PATH,));self.assertEqual(read.call_args.kwargs['operation'],'Current Project primary projection bulk')
    def test_warm_read_reused(self):
        with patch.object(api,'_get_service_response',return_value=self.response(self.payload)) as read:
            api.get_current_projects_primary_projection();api.get_current_projects_primary_projection();self.assertEqual(read.call_count,1)
    def test_fresh_bypasses_existing_cache(self):
        second={**self.payload,'readCompletedAtUTC':'2026-09-30T22:31:00Z'}
        with patch.object(api,'_get_service_response',side_effect=[self.response(self.payload),self.response(second)]) as read:
            api.get_current_projects_primary_projection();self.assertEqual(api.get_current_projects_primary_projection(fresh=True),second);self.assertEqual(read.call_count,2)
    def test_project_write_invalidation_includes_primary(self):
        with patch.object(api,'_get_service_response',return_value=self.response(self.payload)) as read:
            api.get_current_projects_primary_projection();api._invalidate_project_dashboard_cache();api.get_current_projects_primary_projection();self.assertEqual(read.call_count,2)
    def test_cache_key_is_separate_from_existing_baseline(self):
        with patch.object(api,'_fetch_current_projected_billings',return_value=[{'jobListId':1}]),patch.object(api,'_get_service_response',return_value=self.response(self.payload)):
            self.assertEqual(api.get_current_projected_billings(),[{'jobListId':1}]);self.assertEqual(api.get_current_projects_primary_projection(),self.payload);self.assertEqual(api.get_current_projected_billings(),[{'jobListId':1}])
    def test_zero_and_null_do_not_change(self):
        payload={**self.payload,'items':[{'primaryProjectedAmount':0,'pmForecastAmount':0},{'primaryProjectedAmount':None,'pmForecastAmount':None,'systemBaselineAmount':100}]}
        with patch.object(api,'_get_service_response',return_value=self.response(payload)):
            self.assertEqual(api.get_current_projects_primary_projection(),payload)
    def test_unknown_contract_rejected(self):
        with patch.object(api,'_get_service_response',return_value=self.response({**self.payload,'contractVersion':2})):
            with self.assertRaises(api.DataAPIInvalidResponse):api.get_current_projects_primary_projection()
    def test_missing_projects_rejected(self):
        with patch.object(api,'_get_service_response',return_value=self.response({'contractVersion':1,'items':[]})):
            with self.assertRaises(api.DataAPIInvalidResponse):api.get_current_projects_primary_projection()
    def test_missing_month_array_rejected(self):
        with patch.object(api,'_get_service_response',return_value=self.response({'contractVersion':1,'projects':[]})):
            with self.assertRaises(api.DataAPIInvalidResponse):api.get_current_projects_primary_projection()
    def test_failure_is_not_empty_success_and_can_retry_read(self):
        with patch.object(api,'_get_service_response',side_effect=[api.DataAPISQLUnavailable('synthetic'),self.response(self.payload)]):
            with self.assertRaises(api.DataAPISQLUnavailable):api.get_current_projects_primary_projection()
            self.assertEqual(api.get_current_projects_primary_projection(),self.payload)
    def test_invalid_json_not_accepted(self):
        response=httpx.Response(200,text='not JSON',request=httpx.Request('GET','https://synthetic.invalid'))
        with patch.object(api,'_get_service_response',return_value=response):
            with self.assertRaises(api.DataAPIInvalidResponse):api.get_current_projects_primary_projection()

if __name__=='__main__':unittest.main()
