"""Offline tests for deliberately redacted bridge HTTP latency diagnostics."""
from __future__ import annotations

import logging
import unittest
from unittest.mock import patch

import httpx

from backend.app import data_api


class UpstreamRequestTimingTests(unittest.TestCase):
    def response(self, status: int = 200) -> httpx.Response:
        return httpx.Response(status, request=httpx.Request("GET", "https://synthetic.invalid/"))

    def test_fast_success_stays_silent(self):
        with patch.object(data_api, "perf_counter", side_effect=[10.0, 10.1]), \
                patch.object(data_api._UPSTREAM_LOG, "warning") as log:
            self.assertEqual(data_api._timed_data_api_request("safe-read", lambda: self.response()).status_code, 200)
            log.assert_not_called()

    def test_slow_and_error_responses_log_only_safe_fields(self):
        with patch.object(data_api, "perf_counter", side_effect=[10.0, 11.5, 20.0, 20.1]), \
                patch.object(data_api._UPSTREAM_LOG, "warning") as log:
            data_api._timed_data_api_request("safe-read", lambda: self.response())
            data_api._timed_data_api_request("safe-read", lambda: self.response(503))
            self.assertEqual(log.call_count, 2)
            text = " ".join(str(c) for c in log.call_args_list)
            self.assertIn("http_status", text)
            self.assertIn("1500", text)
            self.assertNotIn("CF-Access", text)
            self.assertNotIn("Bearer", text)

    def test_read_timeout_logs_subtype_and_reraises_unchanged(self):
        error = httpx.ReadTimeout("synthetic")
        with patch.object(data_api, "perf_counter", side_effect=[10.0, 15.0]), \
                patch.object(data_api._UPSTREAM_LOG, "warning") as log:
            with self.assertRaises(httpx.ReadTimeout) as caught:
                data_api._timed_data_api_request("identity", lambda: (_ for _ in ()).throw(error))
            self.assertIs(caught.exception, error)
            self.assertIn("ReadTimeout", str(log.call_args))
            self.assertIn("timeout", str(log.call_args))
            self.assertNotIn("entraObjectId", str(log.call_args))

    def test_transport_error_logs_separately(self):
        error = httpx.ConnectError("synthetic")
        with patch.object(data_api, "perf_counter", side_effect=[10.0, 10.05]), \
                patch.object(data_api._UPSTREAM_LOG, "warning") as log:
            with self.assertRaises(httpx.ConnectError):
                data_api._timed_data_api_request("identity", lambda: (_ for _ in ()).throw(error))
            self.assertIn("transport_error", str(log.call_args))


if __name__ == "__main__":
    unittest.main()
