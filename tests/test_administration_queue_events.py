"""Private Administration queue detail: test signed owner gate and safe data contract."""
from copy import deepcopy
import time
import unittest
from unittest.mock import patch
from uuid import UUID

import httpx
from backend.app import administration, data_api
import test_administration_owner_auth as auth_test


def fixture(lane='project_forecast', status='FAILED', limit=20):
    result = {
        'readOnly':True, 'source':'RIGGSDATAHUB_OUTBOX',
        'observedAtUTC':'2026-10-23T15:45:00+00:00',
        'laneKey':lane, 'status':status, 'limit':limit, 'hasMore':False,
        'events':[{ 'eventId':515, 'identityType':'JOB_LIST_ID',
            'jobListId':527, 'ticketKey':None, 'jobNumber':'26583',
            'retryCount':8, 'createdAtUTC':'2026-10-23T15:30:00+00:00',
            'eligibleAfterUTC':None if status=='FAILED' else '2026-10-23T15:50:00+00:00',
            'errorCategory':'TIMEOUT'}],
    }
    if lane == 'accounting_tickets':
        result['events'][0].update(identityType='TICKET_KEY', jobListId=None,
                                    ticketKey='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    return result


class AdministrationQueueBffTests(unittest.TestCase):
    def setUp(self):
        self.owner = auth_test.AdministrationOwnerAuthorizationTests(
            'test_owner_from_signed_entra_and_sql_mapping_allowed')
        self.owner.setUp()
        self.addCleanup(self.owner.doCleanups)
        self.client = self.owner.client

    def test_owner_gets_exact_bounded_fields_without_raw_errors(self):
        raw = fixture()
        with patch.object(administration,'get_bid_log_administration_queue_events',return_value=raw) as upstream:
            response = self.client.get('/api/admin/queue-events?lane=project_forecast&status=FAILED&limit=20',
                                       headers={'X-Riggs-Passive-Read':'1'})
        self.assertEqual(response.status_code,200,response.text)
        body=response.json()
        self.assertEqual(body['availability'],'AVAILABLE')
        self.assertEqual(body['events'][0]['jobListId'],527)
        self.assertIsNone(body['events'][0]['eligibleAfterUTC'])
        self.assertNotIn('set-cookie',response.headers)
        self.assertIn('no-store',response.headers['cache-control'])
        self.assertNotIn(auth_test.OWNER_OID,response.text)
        upstream.assert_called_once_with(actor_eid=2021, entra_object_id=auth_test.OWNER_OID,
                                         lane='project_forecast',status='FAILED',limit=20)

    def test_true_empty_and_unavailable_are_not_confused(self):
        empty = fixture()
        empty['events'] = []
        with patch.object(administration,'get_bid_log_administration_queue_events',return_value=empty):
            r=self.client.get('/api/admin/queue-events?lane=project_forecast')
        self.assertEqual(r.json()['availability'],'AVAILABLE')
        self.assertEqual(r.json()['events'],[])
        with patch.object(administration,'get_bid_log_administration_queue_events',
                          side_effect=data_api.DataAPIUnavailable('not live')):
            r=self.client.get('/api/admin/queue-events?lane=project_forecast')
        self.assertEqual(r.json()['availability'],'UNAVAILABLE')
        self.assertNotIn('events',r.json())

    def test_bad_upstream_contract_rejected_and_no_data_returned(self):
        for mutate in (
            lambda p: p['events'][0].update({'Payload':'SECRET'}),
            lambda p: p['events'][0].update({'errorCategory':'SQL PASSWORD: BAD'}),
            lambda p: p['events'][0].update({'eligibleAfterUTC':'2026-10-24T15:00:00Z'}),
            lambda p: p['events'][0].update({'jobListId':None}),
            lambda p: p.update({'laneKey':'job_cognito'}),
            lambda p: p.update({'hasMore':True}),
        ):
            raw=fixture(); mutate(raw)
            with patch.object(administration,'get_bid_log_administration_queue_events',return_value=raw):
                r=self.client.get('/api/admin/queue-events?lane=project_forecast')
            self.assertEqual(r.json()['availability'],'UNAVAILABLE',r.text)
            self.assertNotIn('events',r.json())
            self.assertNotIn('SECRET',r.text)

    def test_invalid_selectors_post_and_nonowner_stay_denied(self):
        for qs in ['lane=nope','lane=project_forecast&status=PROCESSED',
                   'lane=project_forecast&limit=21','lane=project_forecast&limit=0']:
            with patch.object(administration,'get_bid_log_administration_queue_events') as upstream:
                self.assertEqual(self.client.get('/api/admin/queue-events?'+qs).status_code,422)
                upstream.assert_not_called()
        self.assertEqual(self.client.post('/api/admin/queue-events?lane=project_forecast').status_code,405)
        self.owner.access=self.owner.access.__class__(**{
            **self.owner.access.__dict__, 'eid':415, 'entra_object_id':auth_test.OTHER_OID,
        })
        self.owner.seed_cookie(oid=auth_test.OTHER_OID)
        with patch.object(administration,'get_bid_log_administration_queue_events') as upstream:
            denied=self.client.get('/api/admin/queue-events?lane=project_forecast&actor_eid=2021',
                                   headers={'X-Riggs-User-EID':'2021', 'X-Riggs-Actor-Entra-OID':auth_test.OWNER_OID})
        self.assertEqual(denied.status_code,403)
        upstream.assert_not_called()

    def test_passive_detail_read_does_not_renew_one_hour_idle(self):
        self.owner.seed_cookie(last=int(time.time()) - 200)
        with patch.object(administration,'get_bid_log_administration_queue_events',return_value=fixture()):
            r=self.client.get('/api/admin/queue-events?lane=project_forecast',
                              headers={'X-Riggs-Passive-Read':'1'})
        self.assertEqual(r.status_code,200)
        self.assertNotIn('set-cookie',r.headers)
        with patch.object(administration,'get_bid_log_administration_queue_events',return_value=fixture()):
            r=self.client.get('/api/admin/queue-events?lane=project_forecast')
        self.assertEqual(r.status_code,200)
        self.assertIn('set-cookie',r.headers)
        self.owner.seed_cookie(last=int(time.time())-3605)
        with patch.object(administration,'get_bid_log_administration_queue_events') as upstream:
            expired=self.client.get('/api/admin/queue-events?lane=project_forecast',
                                    headers={'X-Riggs-Passive-Read':'1'})
        self.assertEqual(expired.status_code,401)
        upstream.assert_not_called()

    def test_dev_mode_still_denied(self):
        self.owner.cfg.auth_mode='dev'
        with patch.object(administration,'get_bid_log_administration_queue_events') as upstream:
            response=self.client.get('/api/admin/queue-events?lane=project_forecast')
        self.assertEqual(response.status_code,403)
        upstream.assert_not_called()

    def test_adapter_passes_machine_auth_and_user_filter_does_not_choose_actor(self):
        sample=fixture(lane='accounting_tickets',status='PENDING')
        url='https://example.invalid/v1/bid-log/admin/queue-events'
        response=httpx.Response(200,json=sample,request=httpx.Request('GET',url))
        class Client:
            def get(self,path,**kwargs):
                self.path=path; self.kwargs=kwargs
                return response
        instance=Client()
        with patch.object(data_api,'_get_http_client',return_value=instance),patch.object(
                data_api,'_request_headers',return_value={}):
            result=data_api.get_bid_log_administration_queue_events(
                actor_eid=2021,entra_object_id=auth_test.OWNER_OID,
                lane='accounting_tickets',status='PENDING')
        self.assertEqual(result['source'],'RIGGSDATAHUB_OUTBOX')
        self.assertEqual(instance.path,'/v1/bid-log/admin/queue-events')
        self.assertEqual(instance.kwargs['params'],{'lane':'accounting_tickets','status':'PENDING','limit':20})
        self.assertEqual(instance.kwargs['headers']['X-Riggs-Actor-Entra-OID'],str(UUID(auth_test.OWNER_OID)))
        self.assertEqual(instance.kwargs['timeout'].read,data_api.settings.data_api_dashboard_read_timeout_seconds)


if __name__=='__main__':
    unittest.main()
