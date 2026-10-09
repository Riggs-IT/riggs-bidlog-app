from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app import data_api as api


ROOT = Path(__file__).resolve().parents[1]


class OriginatingBidAttentionProxyTests(unittest.TestCase):
    def payload(self):
        return {
            "scope": "PM",
            "graceHours": 24,
            "candidateCountBeforeGrace": 2,
            "graceSuppressedCount": 1,
            "attentionCount": 1,
            "unlinkedCount": 1,
            "reviewExceptionCount": 0,
            "items": [
                {
                    "jobListId": 24,
                    "jobNumber": "11111",
                    "jobName": "Synthetic",
                    "relationshipState": "UNLINKED",
                    "pmIdentityState": "RESOLVED",
                }
            ],
        }

    def test_data_api_reader_sends_authenticated_actor_eid(self):
        with patch.object(
            api,
            "_originating_bid_request",
            return_value=self.payload(),
        ) as read:
            result = api.get_originating_bid_attention(2021)

        self.assertEqual(result["attentionCount"], 1)
        self.assertEqual(
            read.call_args.args,
            ("GET", "/v1/bid-log/originating-bid/attention"),
        )
        self.assertEqual(read.call_args.kwargs["actor_eid"], 2021)

    def test_invalid_count_contract_is_rejected(self):
        bad = self.payload()
        bad["attentionCount"] = 2
        with patch.object(
            api,
            "_originating_bid_request",
            return_value=bad,
        ):
            with self.assertRaises(api.DataAPIInvalidResponse):
                api.get_originating_bid_attention(2021)

    def test_bff_route_owns_actor_identity_and_workspace_guard(self):
        source = (ROOT / "backend/app/main.py").read_text()
        self.assertIn('"/api/originating-bid/attention"', source)
        route_start = source.index('"/api/originating-bid/attention"')
        route = source[route_start:route_start + 900]
        self.assertIn("_require_bid_log_workspace_access", route)
        self.assertIn("current_user.eid", route)
        self.assertNotIn('request.headers.get("X-Riggs-User-EID")', route)

    def test_attention_read_is_passive_allowlisted(self):
        source = (ROOT / "backend/app/auth.py").read_text()
        self.assertIn('"/api/originating-bid/attention"', source)


if __name__ == "__main__":
    unittest.main()
