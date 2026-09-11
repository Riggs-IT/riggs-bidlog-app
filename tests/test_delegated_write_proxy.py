from __future__ import annotations

import unittest
from unittest.mock import (
    MagicMock,
    patch,
)

from backend.app import data_api


class DelegatedWriteProxyTests(
    unittest.TestCase
):
    @patch(
        "backend.app.data_api._request_headers"
    )
    @patch(
        "backend.app.data_api._get_http_client"
    )
    def test_create_sends_opaque_session(
        self,
        get_client,
        request_headers,
    ):
        request_headers.return_value = {
            "X-Riggs-Delegated-Session":
                "opaque-session",
        }

        response = MagicMock()
        response.status_code = 201
        response.json.return_value = {
            "sharePointItemId": 1,
        }

        client = MagicMock()
        client.post.return_value = response
        get_client.return_value = client

        data_api.create_active_bid(
            {
                "bidName": "Test",
            },
            actor_eid=2021,
            request_id="request-id",
            delegated_session_id=
                "opaque-session",
        )

        request_headers.assert_called_once_with(
            include_service_auth=True,
            request_id="request-id",
            actor_eid=2021,
            delegated_session_id=
                "opaque-session",
        )

    @patch(
        "backend.app.data_api._request_headers"
    )
    @patch(
        "backend.app.data_api._get_http_client"
    )
    def test_active_update_sends_opaque_session(
        self,
        get_client,
        request_headers,
    ):
        request_headers.return_value = {
            "X-Riggs-Delegated-Session":
                "opaque-session",
        }

        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "sharePointItemId": 1,
        }

        client = MagicMock()
        client.patch.return_value = response
        get_client.return_value = client

        data_api.update_active_bid(
            1,
            {
                "expectedEtag": '"etag,1"',
                "changes": {
                    "notes": "Test",
                },
            },
            actor_eid=2021,
            request_id="request-id",
            delegated_session_id=
                "opaque-session",
        )

        request_headers.assert_called_once_with(
            include_service_auth=True,
            request_id="request-id",
            actor_eid=2021,
            delegated_session_id=
                "opaque-session",
        )

    @patch(
        "backend.app.data_api._request_headers"
    )
    @patch(
        "backend.app.data_api._get_http_client"
    )
    def test_outcome_update_sends_opaque_session(
        self,
        get_client,
        request_headers,
    ):
        request_headers.return_value = {
            "X-Riggs-Delegated-Session":
                "opaque-session",
        }

        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "originalBidLogId": 1061,
        }

        client = MagicMock()
        client.patch.return_value = response
        get_client.return_value = client

        data_api.update_bid_log_outcome(
            1061,
            {
                "status": "Lost",
                "expectedEtag": '"etag,7"',
                "changes": {
                    "notes": "Test",
                },
            },
            actor_eid=2021,
            request_id="request-id",
            delegated_session_id=
                "opaque-session",
        )

        request_headers.assert_called_once_with(
            include_service_auth=True,
            request_id="request-id",
            actor_eid=2021,
            delegated_session_id=
                "opaque-session",
        )


if __name__ == "__main__":
    unittest.main()
