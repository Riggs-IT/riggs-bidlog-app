"""Owner-only cross-app presence BFF tests; uses synthetic data only."""
import unittest
from unittest.mock import patch
from backend.app import administration, data_api
import test_administration_owner_auth as auth_test


def fixture():
    rows=[]
    for code in ("ACCOUNTING","BID_LOG","OPERATIONS"):
        n = 1 if code == "BID_LOG" else 0
        rows.append({
            "appCode":code,"openSessions":70 if not n else 200,
            "recentSessions":n,"recentUsers":n,"recentlyActiveSessions":n,
            "recentHeartbeatSessions":0,"idleUnconfirmedSessions":0,
            "lastOpenHeartbeatAtUTC":"2026-10-15T19:49:15Z", "truncated":False,
        })
    return {
       "source":"RIGGSDATAHUB_USAGE_SESSIONS",
       "observedAtUTC":"2026-10-15T19:49:15Z",
       "activityWindowSeconds":120,"idleWindowMinutes":65,"maxSessionsPerApp":50,
       "apps":rows,
       "sessions":[{
          "appCode":"BID_LOG", "eid":2021,
          "displayName":"Synthetic Person", "appRole":"ADMIN", "currentPage":"Administration",
          "startedAtUTC":"2026-10-15T19:49:00Z",
          "lastHeartbeatAtUTC":"2026-10-15T19:49:15Z",
          "lastActiveAtUTC":"2026-10-15T19:49:15Z", "status":"RECENT_ACTIVITY",
          "microsoftUsername":"do-not-expose@example.invalid",
          "usageSessionId":"not-for-browser",
       }],
       "internalNotes":"do-not-expose",
    }


class PresenceBffTests(unittest.TestCase):
    def setUp(self):
        self.owner = auth_test.AdministrationOwnerAuthorizationTests(
            'test_owner_from_signed_entra_and_sql_mapping_allowed')
        self.owner.setUp()
        self.addCleanup(self.owner.doCleanups)
        self.client=self.owner.client

    def test_owner_can_read_allowlisted_evidence(self):
        with patch.object(administration,"get_bid_log_administration_presence",return_value=fixture()) as upstream:
            result=self.client.get('/api/admin/presence')
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['availability'],'AVAILABLE')
        self.assertEqual(len(result.json()['apps']),3)
        self.assertEqual(len(result.json()['sessions']),1)
        self.assertNotIn('do-not-expose',result.text)
        self.assertNotIn('usageSessionId',result.text)
        upstream.assert_called_once_with(actor_eid=2021, entra_object_id=self.owner.access.entra_object_id)

    def test_other_admin_denied_before_upstream(self):
        self.owner.access = self.owner.access.__class__(**{
            **self.owner.access.__dict__, 'eid':415,
            'entra_object_id':auth_test.OTHER_OID,
        })
        self.owner.seed_cookie(oid=auth_test.OTHER_OID)
        with patch.object(administration,"get_bid_log_administration_presence",return_value=fixture()) as upstream:
            result=self.client.get('/api/admin/presence',headers={
               'X-Riggs-User-EID':'2021',
               'X-Riggs-Actor-Entra-OID':self.owner.cfg.admin_owner_entra_object_id,
            })
        self.assertEqual(result.status_code,403)
        upstream.assert_not_called()

    def test_bad_contract_fails_closed_without_false_zero(self):
        bad=fixture()
        bad['sessions'][0]['status']='LOGGED_IN'
        with patch.object(administration,'get_bid_log_administration_presence',return_value=bad):
            result=self.client.get('/api/admin/presence')
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['availability'],'UNAVAILABLE')
        self.assertNotIn('sessions',result.json())

    def test_inconsistent_counts_rejected(self):
        bad=fixture()
        bad['apps'][1]['recentSessions']=2
        with self.assertRaises(ValueError):
            administration._sanitize_presence(bad)

    def test_invalid_actor_blocked_locally(self):
        with self.assertRaises(data_api.DataAPIConfigurationError):
            data_api.get_bid_log_administration_presence(actor_eid=415,entra_object_id='invalid')
        with self.assertRaises(data_api.DataAPIConfigurationError):
            data_api.get_bid_log_administration_presence(actor_eid=2021,entra_object_id='invalid')

if __name__=='__main__':
    unittest.main()
