from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.app import data_api


class BidLifecycleOwnershipBFFTests(unittest.TestCase):
    @patch("backend.app.data_api._request_headers")
    @patch("backend.app.data_api._get_http_client")
    def test_cutover_503_detail_is_preserved(
        self,
        get_client,
        request_headers,
    ):
        request_headers.return_value = {
            "X-Request-ID": "request-id",
        }

        response = MagicMock()
        response.status_code = 503
        response.json.return_value = {
            "detail": {
                "code": "bid_lifecycle_cutover_paused",
                "message": "Bid lifecycle cutover is paused.",
            }
        }

        client = MagicMock()
        client.post.return_value = response
        get_client.return_value = client

        with self.assertRaises(
            data_api.DataAPIRequestRejected
        ) as raised:
            data_api.transition_active_bid_lifecycle(
                123,
                {
                    "action": "Awarded",
                    "expectedEtag": '"etag,1"',
                },
                actor_eid=2021,
                request_id="request-id",
                delegated_session_id="opaque-session",
            )

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn(
            "bid_lifecycle_cutover_paused",
            raised.exception.detail,
        )
        self.assertNotIsInstance(
            raised.exception,
            data_api.DataAPIUnavailable,
        )

        request_headers.assert_called_once_with(
            include_service_auth=True,
            request_id="request-id",
            actor_eid=2021,
            delegated_session_id="opaque-session",
        )


    @patch("backend.app.data_api._request_headers")
    @patch("backend.app.data_api._get_http_client")
    def test_owned_lifecycle_has_route_scoped_read_timeout(self, get_client, request_headers):
        import httpx
        request_headers.return_value = {"X-Request-ID": "synthetic"}
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {"transitionApplied": True}
        get_client.return_value.post.return_value = response

        result = data_api.transition_active_bid_lifecycle(
            123, {"action": "Awarded", "expectedEtag": '"synthetic"'},
            actor_eid=2021, request_id="synthetic", delegated_session_id="synthetic",
        )
        self.assertTrue(result["transitionApplied"])
        kwargs = get_client.return_value.post.call_args.kwargs
        self.assertIsInstance(kwargs["timeout"], httpx.Timeout)
        self.assertEqual(kwargs["timeout"].read, 90.0)
        self.assertEqual(kwargs["timeout"].connect, data_api.settings.data_api_connect_timeout_seconds)
        self.assertNotIn("timeout", kwargs["headers"])


if __name__ == "__main__":
    unittest.main()
