"""Read-only merged Power Platform inventory tests; synthetic data only."""
import unittest
import httpx
from backend.app.power_automate_monitoring import PowerPlatformReadClient
E='Default-11111111-1111-4111-8111-111111111111'
E2='22222222-2222-4222-8222-222222222222'
F='33333333-3333-4333-8333-333333333333'
T='synthetic-token-do-not-store'
def client(fn):
    return PowerPlatformReadClient(delegated_access_token=T,
      client=httpx.Client(transport=httpx.MockTransport(fn)))

class TestInventory(unittest.TestCase):
    def test_no_forced_microsoft_account_selection(self):
        from pathlib import Path
        source = Path('backend/app/power_platform_routes.py').read_text()
        self.assertNotIn('prompt="select_account"', source)
        self.assertIn('authorize_redirect(', source)

    def test_empty_does_not_establish_zero_real_flows(self):
        def handler(r):
            if r.url.path.endswith('/environmentmanagement/environments'):
                return httpx.Response(200,json={'value':[{'id':E,'displayName':'Default'}]})
            return httpx.Response(204)
        r=client(handler).list_accessible_inventory()
        self.assertEqual(r['availability'],'UNVERIFIED_EMPTY')
        self.assertEqual(r['flowCountReturned'],0)
        self.assertFalse(r['coverageComplete'])
    def test_merges_two_envs_and_sorts_by_modified(self):
        def handler(r):
            if r.url.path.endswith('/environmentmanagement/environments'):
                return httpx.Response(200,json={'value':[{'id':E,'displayName':'First'},{'id':E2,'displayName':'Second'}]})
            return httpx.Response(200,json={'value':[{'workflowId':F if E in r.url.path else '44444444-4444-4444-8444-444444444444',
              'modifiedOn':'2026-10-25T12:00:00Z' if E in r.url.path else '2026-10-26T12:00:00Z'}]})
        r=client(handler)._list_environment_inventory()
        self.assertEqual(r['availability'],'AVAILABLE')
        self.assertEqual(len(r['flows']),2)
        self.assertEqual(r['flows'][0]['environmentName'],'Second')
        self.assertEqual(r['sortBasis'],'MODIFIED_TIME_NOT_RUN_TIME')
    def test_denied_environment_is_partial(self):
        def handler(r):
            if r.url.path.endswith('/environmentmanagement/environments'):
                return httpx.Response(200,json={'value':[{'id':E,'displayName':'First'},{'id':E2,'displayName':'Second'}]})
            return httpx.Response(403) if E2 in r.url.path else httpx.Response(200,json={'value':[{'workflowId':F}]})
        r=client(handler).list_accessible_inventory()
        self.assertEqual(r['availability'],'PARTIAL')
        self.assertEqual(r['environments'][1]['availability'],'ACCESS_DENIED')
    def test_six_environment_limit_is_explicit(self):
        calls=[]
        def handler(r):
            if r.url.path.endswith('/environmentmanagement/environments'):
                return httpx.Response(200,json={'value':[{'id':f'Default-{i}','displayName':str(i)} for i in range(8)]})
            calls.append(1)
            return httpx.Response(204)
        r=client(handler)._list_environment_inventory()
        self.assertEqual(len(calls),6)
        self.assertTrue(r['hasMore'])
        self.assertEqual(r['environmentCountDiscovered'],8)
    def test_raw_payload_credentials_are_not_exposed(self):
        def handler(r):
            if r.url.path.endswith('/environmentmanagement/environments'):
                return httpx.Response(200,json={'value':[{'id':E,'displayName':'Default'}]})
            return httpx.Response(200,json={'value':[{'workflowId':F,'displayName':'flow','definition':{'secret':'MUST-NOT-SHOW'}}]})
        r=client(handler).list_accessible_inventory()
        self.assertNotIn('MUST-NOT-SHOW',str(r))
        self.assertNotIn(T,str(r))
if __name__=='__main__': unittest.main()
