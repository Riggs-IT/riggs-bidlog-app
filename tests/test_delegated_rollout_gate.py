from __future__ import annotations

import unittest

from backend.app.config import Settings


def _settings(
    *,
    delegated_auth: bool,
    delegated_writes: bool = False,
    data_api_scope: str = "",
) -> Settings:
    return Settings(
        app_env="development",
        auth_mode="entra",
        entra_tenant_id="tenant",
        entra_client_id="bidlog-client",
        entra_client_secret="secret",
        entra_redirect_uri=(
            "https://example.com/api/auth/callback"
        ),
        entra_data_api_scope=data_api_scope,
        bid_log_delegated_auth_enabled=
            delegated_auth,
        bid_log_delegated_writes_enabled=
            delegated_writes,
        session_secret=("x" * 64),
    )


class DelegatedRolloutConfigTests(
    unittest.TestCase
):
    def test_defaults_are_off(
        self,
    ):
        settings = _settings(
            delegated_auth=False,
        )

        self.assertIs(
            settings
            .bid_log_delegated_auth_enabled,
            False,
        )

        self.assertIs(
            settings
            .bid_log_delegated_writes_enabled,
            False,
        )

    def test_normal_entra_config_does_not_require_scope_when_gate_off(
        self,
    ):
        settings = _settings(
            delegated_auth=False,
            data_api_scope="",
        )

        self.assertIs(
            settings.entra_configured,
            True,
        )

        self.assertEqual(
            settings.entra_oauth_scope,
            "openid profile email",
        )

    def test_delegated_auth_requires_data_api_scope(
        self,
    ):
        settings = _settings(
            delegated_auth=True,
            data_api_scope="",
        )

        self.assertIs(
            settings.entra_configured,
            False,
        )

    def test_delegated_auth_adds_data_api_scope(
        self,
    ):
        settings = _settings(
            delegated_auth=True,
            data_api_scope=(
                "api://data-api-client/"
                "access_as_user"
            ),
        )

        self.assertIs(
            settings.entra_configured,
            True,
        )

        self.assertEqual(
            settings.entra_oauth_scope,
            (
                "openid profile email "
                "api://data-api-client/"
                "access_as_user"
            ),
        )


if __name__ == "__main__":
    unittest.main()
