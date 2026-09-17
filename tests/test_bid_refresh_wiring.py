from __future__ import annotations

import unittest
from pathlib import Path


class BidRefreshWiringTests(unittest.TestCase):
    def test_active_bid_editor_gets_bypass_browser_cache(self):
        source = Path(
            "frontend/src/BidLogEditDrawer.jsx"
        ).read_text()

        self.assertIn(
            "const method = String(options.method || 'GET').toUpperCase();",
            source,
        )
        self.assertIn(
            "? { cache: 'no-store' }",
            source,
        )

    def test_bid_workspace_refreshes_authoritative_list_and_notifies_dashboard(self):
        source = Path(
            "frontend/src/BidLogWorkspace.jsx"
        ).read_text()

        self.assertIn(
            "cache: 'no-store',",
            source,
        )
        self.assertIn(
            "async function refreshBidViewAfterMutation(viewKey)",
            source,
        )
        self.assertIn(
            "void refreshBidViewAfterMutation(bidView);",
            source,
        )
        self.assertIn(
            "onBidDataChanged?.();",
            source,
        )

    def test_app_refreshes_projected_bids_after_bid_log_mutation(self):
        source = Path(
            "frontend/src/App.jsx"
        ).read_text()

        self.assertIn(
            "{ cache: 'no-store' },",
            source,
        )
        self.assertIn(
            "onBidDataChanged={() => {",
            source,
        )
        self.assertIn(
            "void refreshProjectedBidData();",
            source,
        )

    def test_duration_save_invalidates_projected_bid_dashboard_cache(self):
        source = Path(
            "backend/app/data_api.py"
        ).read_text()

        start = source.index(
            "def save_active_bid_projected_billing_settings("
        )
        end = source.index(
            "def get_project_close_accountability",
            start,
        )

        function_source = source[start:end]

        self.assertIn(
            '_dashboard_cache_invalidate_key(\n'
            '        "active_bid_dashboard",\n'
            '    )',
            function_source,
        )


if __name__ == "__main__":
    unittest.main()
