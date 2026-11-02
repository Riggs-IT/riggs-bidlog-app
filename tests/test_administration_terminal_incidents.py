"""Owner-gated Admin watchdog incident feed (read-only, no unsafe fields)."""
from copy import deepcopy
import time
import unittest
from unittest.mock import patch

from backend.app import administration_terminal as module
import test_administration_owner_auth as auth_test


def fixture():
    return {
        'source': 'RIGGSDATAHUB_WATCHDOG_INCIDENTS',
        'observedAtUTC': '2026-11-02T16:00:00+00:00',
        'captureHealth': 'NOT_COLLECTED',
        'totalCount': 1, 'blockedCount': 1, 'uncertainCount': 0,
        'incidents': [{
            'incidentId': 11, 'bidId': 4827, 'status': 'NOT PURSUING',
            'kind': 'BLOCKED', 'reasonCode': 'EXISTING_CANONICAL_BID_REQUIRES_REVIEW',
            'sourceModifiedAtUTC': '2026-11-02T15:20:00+00:00',
            'firstObservedAtUTC': '2026-11-02T15:27:00+00:00',
            'lastObservedAtUTC': '2026-11-02T15:27:00+00:00',
            'observationCount': 1,
        }],
    }


class AdministrationTerminalIncidentsTests(unittest.TestCase):
    def setUp(self):
        self.owner = auth_test.AdministrationOwnerAuthorizationTests(
            'test_owner_from_signed_entra_and_sql_mapping_allowed')
        self.owner.setUp()
        self.addCleanup(self.owner.doCleanups)
        self.client = self.owner.client

    def test_admin_receives_sanitized_incident_without_cookie_refresh(self):
        raw = fixture()
        raw['incidents'][0]['rawError'] = 'PRIVATE_SQL_CONNECTION'
        with patch.object(module, 'get_bid_log_administration_terminal_incidents', return_value=raw) as upstream:
            response = self.client.get('/api/admin/terminal-incidents', headers={'X-Riggs-Passive-Read':'1'})
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data['availability'], 'AVAILABLE')
        self.assertEqual(data['incidents'][0]['bidId'], 4827)
        self.assertNotIn('rawError',response.text)
        self.assertNotIn('PRIVATE_SQL_CONNECTION',response.text)
        self.assertNotIn('set-cookie', response.headers)
        upstream.assert_called_once_with(actor_eid=2021, entra_object_id=auth_test.OWNER_OID)

    def test_unverified_is_not_reported_as_no_incidents(self):
        raw = fixture()
        raw['captureHealth'] = 'HEALTHY'
        with patch.object(module, 'get_bid_log_administration_terminal_incidents', return_value=raw):
            result = self.client.get('/api/admin/terminal-incidents')
        self.assertEqual(result.json()['availability'], 'UNAVAILABLE')
        self.assertNotIn('incidents', result.text)
        empty = fixture()
        empty.update(totalCount=0,blockedCount=0,uncertainCount=0,incidents=[])
        with patch.object(module,'get_bid_log_administration_terminal_incidents',return_value=empty):
            result=self.client.get('/api/admin/terminal-incidents')
        self.assertEqual(result.json()['availability'], 'AVAILABLE')
        self.assertEqual(result.json()['incidents'], [])

    def test_unknown_classification_is_not_relayed(self):
        raw = fixture()
        raw['incidents'][0]['reasonCode']='RAW_DB_PASSWORD'
        with patch.object(module, 'get_bid_log_administration_terminal_incidents', return_value=raw):
            response=self.client.get('/api/admin/terminal-incidents')
        self.assertEqual(response.json()['availability'], 'UNAVAILABLE')
        self.assertNotIn('RAW_DB_PASSWORD', response.text)

    def test_nonowner_dev_expired_and_post_are_denied(self):
        self.assertEqual(self.client.post('/api/admin/terminal-incidents').status_code, 405)
        self.owner.seed_cookie(last=int(time.time())-3605)
        with patch.object(module,'get_bid_log_administration_terminal_incidents') as upstream:
            response=self.client.get('/api/admin/terminal-incidents',headers={'X-Riggs-Passive-Read':'1'})
        self.assertEqual(response.status_code,401)
        upstream.assert_not_called()
        self.owner.cfg.auth_mode='dev'
        with patch.object(module,'get_bid_log_administration_terminal_incidents') as upstream:
            response=self.client.get('/api/admin/terminal-incidents')
        self.assertEqual(response.status_code,403)
        upstream.assert_not_called()


if __name__ == '__main__':
    unittest.main()
