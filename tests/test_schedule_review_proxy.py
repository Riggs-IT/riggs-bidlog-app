"""Read-only and actor-bound bridge requests for PM schedule-review alerts."""
from __future__ import annotations

from pathlib import Path
import unittest
from unittest.mock import patch, Mock
import httpx
from backend.app import data_api as api

ROOT = Path(__file__).resolve().parents[1]
SCHEDULE_PATH = '/v1/bid-log/pm-forecast/schedule-review'


class ScheduleReviewProxyTests(unittest.TestCase):
    def response(self, payload, path=SCHEDULE_PATH):
        return httpx.Response(200, json=payload,
                              request=httpx.Request('GET', 'https://synthetic.invalid' + path))

    def test_portfolio_read_has_machine_auth_but_no_actor_query(self):
        with patch.object(api, '_get_service_response', return_value=self.response([])) as call:
            self.assertEqual(api.get_pm_forecast_schedule_review(), [])
        self.assertEqual(call.call_args.args, (SCHEDULE_PATH,))
        self.assertNotIn('actor_eid', call.call_args.kwargs)

    def test_personal_read_sends_verified_eid_as_authenticated_header(self):
        client = Mock()
        client.get.return_value = self.response([], SCHEDULE_PATH + '/attention')
        with patch.object(api, '_get_http_client', return_value=client), \
             patch.object(api, '_request_headers', return_value={'X-Riggs-User-EID': '2176'}) as headers:
            self.assertEqual(api.get_pm_forecast_schedule_review_attention(2176), [])
        self.assertEqual(headers.call_args.kwargs['actor_eid'], 2176)
        self.assertEqual(client.get.call_args.args, (SCHEDULE_PATH + '/attention',))
        self.assertEqual(client.get.call_args.kwargs['headers']['X-Riggs-User-EID'], '2176')

    def test_invalid_schedule_response_is_not_accepted_as_empty(self):
        with patch.object(api, '_get_service_response', return_value=self.response({'items': []})):
            with self.assertRaises(api.DataAPIInvalidResponse):
                api.get_pm_forecast_schedule_review()
        client = Mock()
        client.get.return_value = self.response({'items': []}, SCHEDULE_PATH + '/attention')
        with patch.object(api, '_get_http_client', return_value=client), \
             patch.object(api, '_request_headers', return_value={'X-Riggs-User-EID': '2176'}):
            with self.assertRaises(api.DataAPIInvalidResponse):
                api.get_pm_forecast_schedule_review_attention(2176)

    def test_background_schedule_reads_are_passive_allowlisted(self):
        source = (ROOT / 'backend/app/auth.py').read_text()
        head = source.split('_PASSIVE_READ_PATHS = frozenset({', 1)[1].split('})', 1)[0]
        self.assertIn('"/api/pm-forecast/schedule-review"', head)
        self.assertIn('"/api/pm-forecast/schedule-review/attention"', head)
    def test_bff_workspace_boundary_no_permission_upgrade(self):
        source = (ROOT / 'backend/app/main.py').read_text()
        start = source.index('def pm_forecast_schedule_review(')
        end = source.index('def pm_forecast_schedule_review_attention(', start)
        portfolio = source[start:end]
        self.assertIn('_require_projected_workspace_access(current_user)', portfolio)
        personal = source[end:source.index('def pm_forecast_attention(', end)]
        self.assertIn('get_pm_forecast_schedule_review_attention(current_user.eid)', personal)
        self.assertIn('canViewBidLog', personal)
        self.assertNotIn('_require_bid_log_editor', personal)
        self.assertNotIn('update_', personal)


if __name__ == '__main__':
    unittest.main()
