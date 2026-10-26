"""Stage E: explicit source observation; no change to private Administration gate."""
import time
import unittest
from unittest.mock import patch

from backend.app import administration_sources as module
import test_administration_owner_auth as auth_test


def fixture():
    kinds = module.BASIS
    return {
        'readOnly': True, 'source': 'RIGGSDATAHUB_SOURCE_EVIDENCE',
        'observedAtUTC': '2026-10-26T16:00:00+00:00',
        'rows': [{
            'sourceKey': key, 'evidenceType': kind,
            'timestampBasis': basis, 'recordFound': True,
            'lastRecordedValue': '2026-10-26T15:00:00.000'
        } for key, (kind, basis) in kinds.items()]
    }


class AdministrationSourceEvidenceBFFTests(unittest.TestCase):
    def setUp(self):
        self.owner = auth_test.AdministrationOwnerAuthorizationTests(
            'test_owner_from_signed_entra_and_sql_mapping_allowed')
        self.owner.setUp()
        self.addCleanup(self.owner.doCleanups)
        self.client = self.owner.client

    def test_owner_receives_exact_evidence_and_no_private_fields(self):
        raw = fixture()
        raw['rows'][0]['rawPayload'] = 'SECRET'
        with patch.object(module, 'get_bid_log_administration_source_evidence', return_value=raw) as upstream:
            response = self.client.get('/api/admin/source-evidence', headers={'X-Riggs-Passive-Read': '1'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['availability'], 'AVAILABLE')
        self.assertEqual(len(response.json()['rows']), 5)
        self.assertNotIn('rawPayload',response.text)
        self.assertNotIn('SECRET',response.text)
        self.assertNotIn(auth_test.OWNER_OID, response.text)
        self.assertIn('no-store', response.headers['cache-control'])
        self.assertNotIn('set-cookie', response.headers)
        upstream.assert_called_once_with(actor_eid=2021, entra_object_id=auth_test.OWNER_OID)

    def test_missing_and_unknown_clock_are_preserved(self):
        raw = fixture()
        raw['rows'][0].update(lastRecordedValue=None, recordFound=False)
        raw['rows'][1].update(lastRecordedValue=None, recordFound=True)
        with patch.object(module, 'get_bid_log_administration_source_evidence', return_value=raw):
            response = self.client.get('/api/admin/source-evidence')
        self.assertEqual(response.json()['rows'][0]['recordFound'], False)
        self.assertIsNone(response.json()['rows'][1]['lastRecordedValue'])
        self.assertEqual(response.json()['rows'][1]['timestampBasis'],'UNVERIFIED_SOURCE_CLOCK')

    def test_bad_source_contract_is_unavailable_not_empty(self):
        for change in (
            lambda p: p['rows'].pop(),
            lambda p: p['rows'][0].update(timestampBasis='UNVERIFIED_SOURCE_CLOCK'),
            lambda p: p['rows'][2].update(lastRecordedValue='2026-10-26T15:00:00Z'),
            lambda p: p['rows'][0].update(recordFound=False),
        ):
            raw=fixture();change(raw)
            with patch.object(module, 'get_bid_log_administration_source_evidence', return_value=raw):
                response=self.client.get('/api/admin/source-evidence')
            self.assertEqual(response.json()['availability'],'UNAVAILABLE',response.text)
            self.assertNotIn('rows',response.json())

    def test_nonowner_dev_expired_post_and_passive_semantics(self):
        self.assertEqual(self.client.post('/api/admin/source-evidence').status_code,405)
        self.owner.seed_cookie(last=int(time.time())-3605)
        with patch.object(module, 'get_bid_log_administration_source_evidence') as upstream:
            denied=self.client.get('/api/admin/source-evidence',headers={'X-Riggs-Passive-Read':'1'})
        self.assertEqual(denied.status_code,401)
        upstream.assert_not_called()
        self.owner.cfg.auth_mode='dev'
        with patch.object(module, 'get_bid_log_administration_source_evidence') as upstream:
            denied=self.client.get('/api/admin/source-evidence')
        self.assertEqual(denied.status_code,403)
        upstream.assert_not_called()


if __name__ == '__main__':
    unittest.main()
