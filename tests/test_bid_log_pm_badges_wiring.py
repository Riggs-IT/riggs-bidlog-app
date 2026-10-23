"""Static read-boundary regression: PM colors cannot grant billing/editor access."""
from __future__ import annotations
from pathlib import Path
import unittest

BASE = Path(__file__).resolve().parents[1]


class BidLogPMBadgeWiringTests(unittest.TestCase):
    def test_read_only_color_endpoint_has_bid_log_workspace_guard(self):
        main = (BASE / 'backend/app/main.py').read_text()
        start = main.index('def bid_log_pm_badges_proxy(')
        end = main.index('def bid_log_active_list_proxy(', start)
        route = main[start:end]
        self.assertIn('_require_bid_log_workspace_access(current_user)', route)
        self.assertNotIn('_require_projected_workspace_access', route)
        self.assertNotIn('_require_bid_log_editor', route)
        self.assertIn('Cache-Control', route)
        self.assertIn('get_bid_log_pm_badges()', route)

    def test_bridge_client_uses_existing_machine_service_path(self):
        client = (BASE / 'backend/app/data_api.py').read_text()
        start = client.index('def get_bid_log_pm_badges(')
        end = client.index('def get_bid_log_general_contractors(', start)
        function = client[start:end]
        self.assertIn('_get_service_response(', function)
        self.assertIn('/v1/bid-log/reference/pm-badges', function)
        self.assertIn('DataAPIInvalidResponse', function)
        self.assertNotIn('request.post(', function)

    def test_viewer_badge_read_does_not_require_billing_datasets(self):
        view = (BASE / 'frontend/src/BidLogWorkspace.jsx').read_text()
        hook = (BASE / 'frontend/src/useTeamBadgeDirectory.js').read_text()
        app = (BASE / 'frontend/src/App.jsx').read_text()
        self.assertIn("/api/bid-log/reference/pm-badges", hook)
        self.assertIn('useTeamBadgeDirectory(user?.eid, canViewBidLog)', app)
        self.assertIn('pmBadgeDirectory={teamBadgeDirectory}', app)
        self.assertIn('pmBadgeDirectory', view)
        self.assertIn('...pmBadgeDirectory', view)
        self.assertNotIn('canViewProjectedBillings', view)


if __name__ == '__main__':
    unittest.main()
