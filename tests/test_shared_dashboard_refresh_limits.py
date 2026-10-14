"""Protect the manual shared-refresh contract; never perform real HTTP requests."""
from __future__ import annotations

import unittest
from unittest.mock import patch

import httpx

from backend.app import data_api


def response(status, payload, *, retry_after=None):
    headers = {"Retry-After": str(retry_after)} if retry_after is not None else {}
    return httpx.Response(
        status_code=status,
        json=payload,
        headers=headers,
        request=httpx.Request("POST", "https://api.invalid/v1/bid-log/dashboard-cache/refresh"),
    )


class SharedRefreshLimitClientTests(unittest.TestCase):
    def test_refresh_supplies_trusted_actor_and_returns_receipt(self):
        receipt = {"refreshId": "synthetic-id", "status": "RUNNING"}
        with patch.object(data_api, "_get_http_client") as client:
            with patch.object(data_api, "_request_headers", return_value={"X-Riggs-User-EID": "212"}) as headers:
                client.return_value.post.return_value = response(202, receipt)
                self.assertEqual(data_api.refresh_shared_dashboard_cache(actor_eid=212), receipt)
                headers.assert_called_once_with(include_service_auth=True, actor_eid=212)
                self.assertIn("/v1/bid-log/dashboard-cache/refresh", client.return_value.post.call_args.args)

    def test_throttled_bridge_request_is_distinct_from_an_outage(self):
        with patch.object(data_api, "_get_http_client") as client:
            with patch.object(data_api, "_request_headers", return_value={}):
                client.return_value.post.return_value = response(
                    429, {"detail": "shared_dashboard_refresh_rate_limited"}, retry_after=87,
                )
                with self.assertRaises(data_api.DataAPISharedRefreshRateLimited) as ctx:
                    data_api.refresh_shared_dashboard_cache(actor_eid=506)
                self.assertEqual(ctx.exception.retry_after_seconds, 87)

    def test_malformed_rate_limit_response_is_not_accepted(self):
        with patch.object(data_api, "_get_http_client") as client:
            with patch.object(data_api, "_request_headers", return_value={}):
                client.return_value.post.return_value = response(
                    429, {"detail": "shared_dashboard_refresh_rate_limited"}, retry_after="not-a-number",
                )
                with self.assertRaises(data_api.DataAPIInvalidResponse):
                    data_api.refresh_shared_dashboard_cache(actor_eid=506)


if __name__ == "__main__":
    unittest.main()
