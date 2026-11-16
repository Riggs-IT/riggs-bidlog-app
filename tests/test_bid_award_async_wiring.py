"""Offline source-contract guards for the feature-gated async Award transition.

End-to-end FastAPI/integration behavior is also certified by the complete BFF
suite on the real host, using its installed dependencies. No network/writes.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class AwardAsyncWiring(unittest.TestCase):
    def test_backend_default_off_and_separate_status_read(self):
        config=(ROOT/'backend/app/config.py').read_text()
        main=(ROOT/'backend/app/main.py').read_text()
        api=(ROOT/'backend/app/data_api.py').read_text()
        self.assertIn('bid_log_award_async_enabled: bool = False',config)
        self.assertIn('and str(payload.get("action") or "").strip().upper() == "AWARDED"',main)
        self.assertIn('enqueue_active_bid_award(',main)
        self.assertIn('award-progress',main)
        self.assertIn('get_current_user',main)
        self.assertIn('status_code != 202',api)
        self.assertIn('"X-Riggs-User-EID"',api)
        self.assertNotIn('graph_access_token',api[api.index('def enqueue_active_bid_award('):api.index('def get_active_bid_award_status(')])

    def test_badge_and_reconnect_are_local_to_create_bid(self):
        create=(ROOT/'frontend/src/BidLogCreateDrawer.jsx').read_text()
        css=(ROOT/'frontend/src/styles/11-lifecycle-feedback.css').read_text()
        self.assertIn('actionLabel={reconnectNeeded',create)
        self.assertIn('floating-editor-surface.bid-log-create-drawer',css)

if __name__=='__main__':
    unittest.main()
