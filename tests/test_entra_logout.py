from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from backend.app import main


class EntraLogoutTests(
    unittest.IsolatedAsyncioTestCase
):
    async def test_end_session_url_uses_oidc_metadata(
        self,
    ):
        with (
            patch.object(
                main.settings,
                "auth_mode",
                "entra",
            ),
            patch.object(
                main.settings,
                "entra_post_logout_redirect_uri",
                (
                    "https://bidlog.riggscompanies.com/"
                    "api/auth/signed-out"
                ),
            ),
            patch.object(
                main.oauth.entra,
                "load_server_metadata",
                new=AsyncMock(
                    return_value={
                        "end_session_endpoint": (
                            "https://login.microsoftonline.com/"
                            "tenant/oauth2/v2.0/logout"
                        ),
                    }
                ),
            ),
        ):
            url = await (
                main._entra_end_session_url()
            )

        self.assertEqual(
            url,
            (
                "https://login.microsoftonline.com/"
                "tenant/oauth2/v2.0/logout?"
                "post_logout_redirect_uri="
                "https%3A%2F%2F"
                "bidlog.riggscompanies.com%2F"
                "api%2Fauth%2Fsigned-out"
            ),
        )

    async def test_end_session_url_rejects_other_host(
        self,
    ):
        with (
            patch.object(
                main.settings,
                "auth_mode",
                "entra",
            ),
            patch.object(
                main.settings,
                "entra_post_logout_redirect_uri",
                (
                    "https://bidlog.riggscompanies.com/"
                    "api/auth/signed-out"
                ),
            ),
            patch.object(
                main.oauth.entra,
                "load_server_metadata",
                new=AsyncMock(
                    return_value={
                        "end_session_endpoint":
                            "https://example.com/logout",
                    }
                ),
            ),
        ):
            url = await (
                main._entra_end_session_url()
            )

        self.assertIsNone(url)

    async def test_missing_post_logout_config_falls_back(
        self,
    ):
        with (
            patch.object(
                main.settings,
                "auth_mode",
                "entra",
            ),
            patch.object(
                main.settings,
                "entra_post_logout_redirect_uri",
                "",
            ),
        ):
            url = await (
                main._entra_end_session_url()
            )

        self.assertIsNone(url)


if __name__ == "__main__":
    unittest.main()
