"""Auth, identity, and HTTP cooldown behavior of the actual Bid Log BFF route."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import data_api, main
from backend.app.auth import CurrentUser


def test_user(*, role='ADMIN', trade='PM', billing=True):
    return CurrentUser(
        eid=2021,
        it_user_id=1015,
        display_name='Synthetic Dashboard User',
        app_role=role,
        employee_trade=trade,
        can_edit_billing=billing,
        billing_access_source='TEST',
        microsoft_username=None,
        entra_object_id='00000000-0000-0000-0000-000000000001',
        tenant_id='test',
    )


class ManualRefreshRouteTests(unittest.TestCase):
    def setUp(self):
        self.before = main.app.dependency_overrides.copy()
        main.app.dependency_overrides[main.get_current_user] = lambda: test_user()
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)
        self.addCleanup(self._restore)

    def _restore(self):
        main.app.dependency_overrides.clear()
        main.app.dependency_overrides.update(self.before)

    def test_verified_actor_from_session_not_forged_header(self):
        receipt = {'refreshId': 'test-rebuild-1', 'status': 'RUNNING'}
        with patch.object(main, 'refresh_shared_dashboard_cache', return_value=receipt) as refresh:
            result = self.client.post(
                '/api/projected-billings/dashboard-cache/refresh',
                headers={'X-Riggs-User-EID': '9999'},
            )
            self.assertEqual(result.status_code, 202)
            self.assertEqual(result.json(), receipt)
            refresh.assert_called_once_with(actor_eid=2021)

    def test_throttle_reaches_browser_with_retry_after(self):
        with patch.object(main, 'refresh_shared_dashboard_cache',
                          side_effect=data_api.DataAPISharedRefreshRateLimited(87)):
            result = self.client.post('/api/projected-billings/dashboard-cache/refresh')
            self.assertEqual(result.status_code, 429)
            self.assertEqual(result.headers['retry-after'], '87')
            self.assertEqual(result.json(), {'detail': 'shared_dashboard_refresh_rate_limited'})

    def test_no_projected_billing_access_cannot_refresh(self):
        main.app.dependency_overrides[main.get_current_user] = lambda: test_user(
            role='NONE', trade='NONE', billing=False,
        )
        with patch.object(main, 'refresh_shared_dashboard_cache') as refresh:
            result = self.client.post('/api/projected-billings/dashboard-cache/refresh')
            self.assertEqual(result.status_code, 403)
            refresh.assert_not_called()


if __name__ == '__main__':
    unittest.main()
