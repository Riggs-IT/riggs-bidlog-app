"""Additional owner-only aggregate monitoring BFF tests; no live SQL."""
import unittest
from unittest.mock import patch
from backend.app import administration, data_api
import test_administration_owner_auth as auth_test
import test_administration_overview as overview_test


class AdministrationSummaryBffTests(unittest.TestCase):
    def setUp(self):
        self.owner = auth_test.AdministrationOwnerAuthorizationTests(
            'test_owner_from_signed_entra_and_sql_mapping_allowed')
        self.owner.setUp()
        self.addCleanup(self.owner.doCleanups)
        self.client = self.owner.client

    def _sources(self, monitoring):
        return (
            patch.object(administration, 'check_data_api_ready', return_value={'status': 'ok', 'sql':'connected'}),
            patch.object(administration, 'get_shared_dashboard_cache_status',
                         return_value=overview_test.fixture_cache()),
            patch.object(administration, 'get_bid_log_administration_monitoring',
                         return_value=monitoring),
        )

    def test_owner_gets_aggregates_without_raw_fields(self):
        fixture = overview_test.AdministrationOverviewTests.monitoring_fixture()
        fixture['usage']['secretRecord'] = 'never expose'
        fixture['queues'][0]['payload'] = 'never expose'
        p1,p2,p3 = self._sources(fixture)
        with p1, p2, p3 as call:
            result = self.client.get('/api/admin/overview')
        self.assertEqual(result.status_code, 200)
        call.assert_called_once_with(
            actor_eid=2021, entra_object_id=self.owner.access.entra_object_id,
        )
        body = result.json()
        self.assertEqual(body['monitoring']['usage']['eligibleForCloseout'], 202)
        self.assertEqual(body['monitoring']['queues'][0]['pendingCount'], 0)
        self.assertNotIn('never expose', result.text)
        self.assertNotIn(self.owner.access.entra_object_id, result.text)

    def test_wrong_monitoring_contract_stays_unverified(self):
        fixture = overview_test.AdministrationOverviewTests.monitoring_fixture()
        fixture['queues'][0]['laneKey'] = fixture['queues'][1]['laneKey']
        p1,p2,p3 = self._sources(fixture)
        with p1,p2,p3:
            result = self.client.get('/api/admin/overview')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['monitoring']['availability'], 'UNAVAILABLE')
        self.assertNotIn('202', result.json()['monitoring'])

    def test_other_admin_denied_before_monitoring(self):
        fixture = overview_test.AdministrationOverviewTests.monitoring_fixture()
        self.owner.access = self.owner.access.__class__(**{
            **self.owner.access.__dict__, 'eid': 415,
            'entra_object_id': auth_test.OTHER_OID,
        })
        self.owner.seed_cookie(oid=auth_test.OTHER_OID)
        p1,p2,p3 = self._sources(fixture)
        with p1,p2,p3 as call:
            result = self.client.get('/api/admin/overview', headers={
                'X-Riggs-User-EID': '2021', 'X-Riggs-Actor-Entra-OID': self.owner.cfg.admin_owner_entra_object_id,
            })
        self.assertEqual(result.status_code, 403)
        call.assert_not_called()

    def test_bff_validates_owner_before_network(self):
        with self.assertRaises(data_api.DataAPIConfigurationError):
            data_api.get_bid_log_administration_monitoring(
                actor_eid=415, entra_object_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            )
        with self.assertRaises(data_api.DataAPIConfigurationError):
            data_api.get_bid_log_administration_monitoring(actor_eid=2021, entra_object_id='invalid')

if __name__ == '__main__':
    unittest.main()
