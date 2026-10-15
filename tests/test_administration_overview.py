"""Administration read-only monitoring, exact-owner route, and privacy tests."""
import unittest
from unittest.mock import patch

from backend.app import administration, auth, main
from backend.app.data_api import DataAPIUnavailable
import test_administration_owner_auth as owner_auth_tests


DATASET_KEYS = (
    'current_project_summary', 'current_project_monthly_bulk',
    'current_project_primary_projection', 'active_bid_dashboard',
    'portfolio_balance', 'schedule_review',
)


def fixture_cache():
    return {
        'refreshId': 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'status': 'RUNNING',
        'startedAtUTC': '2026-10-15T15:58:35+00:00',
        'finishedAtUTC': None,
        'completedDatasets': 4,
        'totalDatasets': 6,
        'failedDatasets': [],
        'ttlSeconds': 120,
        'maxStaleSeconds': 601,
        'manualCooldownSeconds': 90,
        'perUserCooldownSeconds': 180,
        'datasets': {
            key: {
                'state': 'FRESH' if i < 4 else 'STALE',
                'ageSeconds': 4.8 if i < 4 else 135,
                'updatedAtUTC': '2026-10-15T15:58:42+00:00',
                'lastErrorType': None,
                'secretInjected': 'never expose',
            } for i, key in enumerate(DATASET_KEYS)
        },
        'secretInjected': 'never expose',
    }


class AdministrationOverviewTests(unittest.TestCase):
    def setUp(self):
        # Reuse exactly the signed-cookie/owner-resolver test fixture, not
        # an override that skips authentication or produces synthetic EID.
        self.owner = owner_auth_tests.AdministrationOwnerAuthorizationTests(
            'test_owner_from_signed_entra_and_sql_mapping_allowed'
        )
        self.owner.setUp()
        self.addCleanup(self.owner.doCleanups)
        self.client = self.owner.client
        self.monitoring_patch = patch.object(
            administration, 'get_bid_log_administration_monitoring',
            return_value=self.monitoring_fixture(),
        )
        self.monitoring_patch.start()
        self.addCleanup(self.monitoring_patch.stop)

    @staticmethod
    def monitoring_fixture():
        lanes = (
            'accounting_tickets', 'cognito_staffing', 'job_cognito',
            'job_sharepoint', 'ordering_center', 'project_forecast',
        )
        return {
            'source': 'RIGGSDATAHUB_AGGREGATE',
            'observedAtUTC': '2026-10-15T19:49:00Z',
            'usage': {
                'totalSessions': 420, 'openSessions': 205,
                'recentlyActiveSessions': 1, 'eligibleForCloseout': 202,
                'endedSessions': 215, 'heartbeatExpiredSessions': 0,
                'endedLast24Hours': 9, 'activeDefinitionSeconds': 120,
            },
            'queues': [{
                'laneKey': key, 'pendingCount': 0, 'processingCount': 0,
                'failedCount': 0, 'oldestPendingAtUTC': None,
                'latestProcessedAtUTC': None,
                'processHealth': 'NOT_COLLECTED',
                'rawSecret': 'never expose',
            } for key in lanes],
            'reconciliation': {
                'enabled': False, 'intervalSeconds': 900, 'batchLimit': 50,
                'minimumIdleMinutes': 65, 'lastRunAtUTC': None,
                'lastRunSource': 'NOT_COLLECTED',
            },
        }

    def _patch_sources(self):
        return (
            patch.object(administration, 'check_data_api_ready',
                         return_value={'status': 'ok', 'sql': 'connected',
                                       'sensitive': 'never expose'}),
            patch.object(administration, 'get_shared_dashboard_cache_status',
                         side_effect=fixture_cache),
        )

    def test_owner_overview_is_structured_redacted_read_only(self):
        ready, cache = self._patch_sources()
        with ready as a, cache as b:
            response = self.client.get('/api/admin/overview', headers={
                'X-Riggs-Passive-Read': '1',
            })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn('no-store', response.headers['cache-control'])
        payload = response.json()
        self.assertTrue(payload['readOnly'])
        self.assertEqual(payload['services']['dataApi']['state'], 'AVAILABLE')
        self.assertEqual(payload['services']['sql']['state'], 'CONNECTED')
        self.assertEqual(payload['cache']['refresh']['status'], 'RUNNING')
        self.assertEqual(payload['cache']['policy']['maxStaleSeconds'], 601.0)
        self.assertEqual(len(payload['cache']['datasets']), 6)
        self.assertIn('notCollected', payload)
        self.assertEqual(payload['monitoring']['availability'], 'AVAILABLE')
        self.assertEqual(payload['monitoring']['usage']['eligibleForCloseout'], 202)
        self.assertEqual(len(payload['monitoring']['queues']), 6)
        self.assertNotIn('never expose', response.text)
        self.assertNotIn(self.owner.cfg.admin_owner_entra_object_id, response.text)
        a.assert_called_once_with()
        b.assert_called_once_with()

    def test_other_admin_forged_identity_is_denied_before_upstream(self):
        self.owner.access = self.owner.access.__class__(**{
            **self.owner.access.__dict__, 'eid': 415, 'entra_object_id': owner_auth_tests.OTHER_OID,
        })
        self.owner.seed_cookie(oid=owner_auth_tests.OTHER_OID)
        ready, cache = self._patch_sources()
        with ready as a, cache as b:
            response = self.client.get('/api/admin/overview?eid=2021', headers={
                'X-Riggs-Actor-EID': '2021', 'X-Is-Admin': 'true',
            })
        self.assertEqual(response.status_code, 403, response.text)
        a.assert_not_called()
        b.assert_not_called()

    def test_management_admin_same_eid_cannot_read_monitoring(self):
        self.owner.access = self.owner.access.__class__(**{
            **self.owner.access.__dict__, 'app_role': 'MANAGEMENT_ADMIN',
        })
        ready, cache = self._patch_sources()
        with ready as a, cache as b:
            self.assertEqual(self.client.get('/api/admin/overview').status_code, 403)
        a.assert_not_called()
        b.assert_not_called()

    def test_stale_revision_cannot_read_monitoring(self):
        self.owner.seed_cookie(revision='old-revision')
        ready, cache = self._patch_sources()
        with ready as a, cache as b:
            self.assertEqual(self.client.get('/api/admin/overview').status_code, 401)
        a.assert_not_called()
        b.assert_not_called()

    def test_dev_auth_cannot_read_monitoring(self):
        self.owner.cfg.auth_mode = 'dev'
        ready, cache = self._patch_sources()
        with ready as a, cache as b:
            self.assertEqual(self.client.get('/api/admin/overview').status_code, 403)
        a.assert_not_called()
        b.assert_not_called()

    def test_missing_pin_denies_monitoring(self):
        self.owner.cfg.admin_owner_entra_object_id = ''
        self.assertEqual(self.client.get('/api/admin/overview').status_code, 403)

    def test_no_cookie_denies_before_upstream(self):
        self.client.cookies.clear()
        ready, cache = self._patch_sources()
        with ready as a, cache as b:
            self.assertEqual(self.client.get('/api/admin/overview').status_code, 401)
        a.assert_not_called()
        b.assert_not_called()

    def test_bridge_errors_are_labeled_not_exposed(self):
        with patch.object(administration, 'check_data_api_ready',
                          side_effect=DataAPIUnavailable('secret-in-error')):
            with patch.object(administration, 'get_shared_dashboard_cache_status',
                              side_effect=DataAPIUnavailable('secret-in-error')):
                response = self.client.get('/api/admin/overview')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['services']['sql']['state'], 'UNVERIFIED')
        self.assertEqual(response.json()['services']['dataApi']['state'], 'UNAVAILABLE')
        self.assertEqual(response.json()['cache']['availability'], 'UNAVAILABLE')
        self.assertEqual(response.json()['cache']['reasonCode'], 'UPSTREAM_UNAVAILABLE')
        self.assertNotIn('secret-in-error', response.text)

    def test_bad_cache_contract_is_not_marked_healthy(self):
        bad = fixture_cache()
        del bad['datasets']['schedule_review']
        with patch.object(administration, 'check_data_api_ready',
                          return_value={'status': 'ok', 'sql': 'connected'}):
            with patch.object(administration, 'get_shared_dashboard_cache_status',
                              return_value=bad):
                response = self.client.get('/api/admin/overview')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['cache']['availability'], 'UNAVAILABLE')
        self.assertEqual(response.json()['cache']['reasonCode'], 'UNEXPECTED_ERROR')

    def test_no_mutation_routes(self):
        self.assertEqual(self.client.post('/api/admin/overview').status_code, 405)
        matches = [r for r in main.app.routes if getattr(r, 'path', '') == '/api/admin/overview']
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].methods, {'GET'})
        self.assertIn('/api/admin/overview', auth._PASSIVE_READ_PATHS)

    def test_source_cache_failure_type_allowlisted(self):
        source = fixture_cache()
        source['datasets']['portfolio_balance']['lastErrorType'] = 'token=secret/toxic'
        safe = administration._sanitize_cache(source)
        portfolio = next(item for item in safe['datasets'] if item['key'] == 'portfolio_balance')
        self.assertIsNone(portfolio['errorType'])
        self.assertNotIn('toxic', str(safe))

    def test_null_is_not_zero(self):
        source = fixture_cache()
        source['datasets']['portfolio_balance']['ageSeconds'] = None
        safe = administration._sanitize_cache(source)
        portfolio = next(item for item in safe['datasets'] if item['key'] == 'portfolio_balance')
        self.assertIsNone(portfolio['ageSeconds'])


if __name__ == '__main__':
    unittest.main()
