from __future__ import annotations

import unittest
from unittest.mock import (
    MagicMock,
    patch,
)

from backend.app.config import Settings
from backend.app import data_api


class DelegatedAuthWiringTests(
    unittest.TestCase
):
    def test_entra_oauth_scope_contains_data_api_scope(
        self,
    ):
        settings = Settings(
            app_env="development",
            auth_mode="entra",
            entra_tenant_id="tenant",
            entra_client_id="bidlog-client",
            entra_client_secret="secret",
            entra_redirect_uri=(
                "https://example.com/api/auth/callback"
            ),
            entra_data_api_scope=(
                "api://data-api-client/access_as_user"
            ),
            bid_log_delegated_auth_enabled=True,
            session_secret=("x" * 64),
        )

        self.assertEqual(
            settings.entra_oauth_scope,
            (
                "openid profile email "
                "api://data-api-client/access_as_user"
            ),
        )

        self.assertIs(
            settings.entra_configured,
            True,
        )

    def test_request_headers_support_user_and_session(
        self,
    ):
        headers = data_api._request_headers(
            include_service_auth=False,
            request_id="request-test",
            actor_eid=2021,
            user_bearer_token="user-access-token",
            delegated_session_id="opaque-session-id",
        )

        self.assertEqual(
            headers["Authorization"],
            "Bearer user-access-token",
        )

        self.assertEqual(
            headers["X-Riggs-Delegated-Session"],
            "opaque-session-id",
        )

        self.assertEqual(
            headers["X-Riggs-User-EID"],
            "2021",
        )

    @patch(
        "backend.app.data_api._request_headers"
    )
    @patch(
        "backend.app.data_api._get_http_client"
    )
    def test_create_delegated_session_returns_only_api_payload(
        self,
        get_client,
        request_headers,
    ):
        request_headers.return_value = {
            "Authorization":
                "Bearer user-token",
        }

        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "sessionId":
                "opaque-session-id",

            "eid":
                2021,

            "entraObjectId":
                "11111111-2222-3333-4444-555555555555",

            "displayName":
                "Test User",

            "appRole":
                "ADMIN",

            "expiresInSeconds":
                28800,
        }

        client = MagicMock()
        client.post.return_value = response
        get_client.return_value = client

        result = (
            data_api.create_bid_log_delegated_session(
                user_assertion="user-token",
                actor_eid=2021,
                request_id="request-test",
            )
        )

        self.assertEqual(
            result["sessionId"],
            "opaque-session-id",
        )

        self.assertNotIn(
            "user-token",
            repr(result),
        )

        request_headers.assert_called_once_with(
            include_service_auth=True,
            request_id="request-test",
            actor_eid=2021,
            user_bearer_token="user-token",
        )


if __name__ == "__main__":
    unittest.main()
