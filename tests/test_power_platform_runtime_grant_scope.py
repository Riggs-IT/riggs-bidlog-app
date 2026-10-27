"""S7.1: fixed runtime audience and non-secret Microsoft OAuth error contract.

All HTTP results and credentials are synthetic. No live Microsoft calls.
"""
from __future__ import annotations

import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from cryptography.fernet import Fernet

from backend.app.power_platform_vault import (
    EncryptedPowerPlatformVault,
    PowerPlatformVaultError,
    _runtime_grant_failure,
)

TENANT = "22222222-2222-4222-8222-222222222222"
CLIENT = "33333333-3333-4333-8333-333333333333"
REFRESH = "synthetic-owner-refresh-not-real"


class RuntimeGrantTests(unittest.TestCase):
    def make_vault(self, *, purpose="runtime"):
        cloud = types.ModuleType("google.cloud")
        firestore = types.ModuleType("google.cloud.firestore")
        firestore.Client = lambda: SimpleNamespace(collection=lambda _: object())
        cloud.firestore = firestore
        settings = SimpleNamespace(
            entra_tenant_id=TENANT,
            entra_client_id=CLIENT,
            entra_client_secret="synthetic-secret-only-for-mock-transport",
            power_platform_refresh_enabled=True,
            power_platform_firestore_collection="riggs_synthetic_test_only",
            power_platform_token_key=Fernet.generate_key().decode(),
        )
        with patch.dict(sys.modules, {"google.cloud": cloud, "google.cloud.firestore": firestore}):
            return EncryptedPowerPlatformVault.from_settings(settings, purpose=purpose)

    def test_exact_runtime_scope_preserves_the_trailing_resource_slash(self):
        vault = self.make_vault()
        calls = []

        def handler(request):
            calls.append(request)
            data = dict(httpx.QueryParams(request.content.decode()))
            self.assertEqual(request.method, "POST")
            self.assertEqual(request.url.host, "login.microsoftonline.com")
            self.assertEqual(request.url.path, f"/{TENANT}/oauth2/v2.0/token")
            self.assertEqual(data["grant_type"], "refresh_token")
            self.assertEqual(data["scope"],
                             "https://service.flow.microsoft.com//.default offline_access")
            self.assertEqual(data["refresh_token"], REFRESH)
            self.assertNotIn("api.powerplatform.com", data["scope"])
            return httpx.Response(200, json={
                "access_token": "synthetic-runtime-access-token", "expires_in": 3600,
            })

        http = httpx.Client(transport=httpx.MockTransport(handler))
        with patch("httpx.Client", return_value=http):
            response = vault._refresh_provider(REFRESH)
        self.assertEqual(response["expires_in"], 3600)
        self.assertEqual(len(calls), 1)

    def test_enforced_numeric_oauth_error_allowlist(self):
        examples = {
            70011: "RUNTIME_INVALID_SCOPE",
            500011: "RUNTIME_RESOURCE_NOT_FOUND",
            65001: "RUNTIME_CONSENT_REQUIRED",
            50076: "RUNTIME_INTERACTION_REQUIRED",
            700082: "RUNTIME_REAUTH_REQUIRED",
            7000215: "RUNTIME_CLIENT_AUTH_FAILED",
        }
        for microsoft_code, expected in examples.items():
            with self.subTest(microsoft_code=microsoft_code):
                actual = _runtime_grant_failure(httpx.Response(400, json={
                    "error": "unexpected",
                    "error_codes": [microsoft_code],
                    "error_description": "DO_NOT_LEAK_PRIVATE_USER_INFO_OR_TOKENS",
                    "trace_id": "DO_NOT_LEAK_TRACE_ID",
                }))
                self.assertEqual(actual, expected)
                self.assertNotIn("DO_NOT_LEAK", actual)

    def test_oauth_error_type_when_numeric_code_unavailable(self):
        for oauth_type, expected in (
            ("invalid_scope", "RUNTIME_INVALID_SCOPE"),
            ("invalid_resource", "RUNTIME_RESOURCE_NOT_FOUND"),
            ("consent_required", "RUNTIME_CONSENT_REQUIRED"),
            ("interaction_required", "RUNTIME_INTERACTION_REQUIRED"),
            ("invalid_grant", "RUNTIME_REAUTH_REQUIRED"),
            ("invalid_client", "RUNTIME_CLIENT_AUTH_FAILED"),
        ):
            with self.subTest(oauth_type=oauth_type):
                self.assertEqual(_runtime_grant_failure(httpx.Response(400,json={
                    "error": oauth_type, "error_description": "PRIVATE_INFORMATION",
                })), expected)

    def test_unrecognized_and_malformed_oauth_errors_do_not_leak(self):
        responses = (
            httpx.Response(400, text="MY_TOKEN_IS_SECRET"),
            httpx.Response(403, json={"error": "UNTRUSTED_EMAIL_ADDRESS"}),
            httpx.Response(400, json={"error_codes": ["70011"]}),
            httpx.Response(400, content=b"x" * 8193),
            httpx.Response(400, json={"error_codes": list(range(10))}),
        )
        for response in responses:
            with self.subTest(status_code=response.status_code):
                self.assertEqual(_runtime_grant_failure(response), "RUNTIME_TOKEN_GRANT_REJECTED")

    def test_rejected_runtime_grant_returns_only_safe_code(self):
        vault = self.make_vault()
        for microsoft_code, expected in (
            (70011, "RUNTIME_INVALID_SCOPE"),
            (65001, "RUNTIME_CONSENT_REQUIRED"),
            (500011, "RUNTIME_RESOURCE_NOT_FOUND"),
        ):
            with self.subTest(code=microsoft_code):
                http = httpx.Client(transport=httpx.MockTransport(
                    lambda _: httpx.Response(400, json={
                        "error": "invalid_grant",
                        "error_codes": [microsoft_code],
                        "error_description": "MY_SECRET_OR_PII_MUST_NEVER_BE_SHOWN",
                    })
                ))
                with patch("httpx.Client", return_value=http):
                    with self.assertRaises(PowerPlatformVaultError) as caught:
                        vault._refresh_provider(REFRESH)
                self.assertEqual(caught.exception.code, expected)
                self.assertNotIn("MY_SECRET", str(caught.exception))

    def test_the_original_platform_scope_and_errors_remain_unchanged(self):
        platform = self.make_vault(purpose="platform")
        observed = []
        def handler(request):
            observed.append(dict(httpx.QueryParams(request.content.decode()))["scope"])
            return httpx.Response(400, json={"error_codes": [70011]})
        http = httpx.Client(transport=httpx.MockTransport(handler))
        with patch("httpx.Client", return_value=http):
            with self.assertRaises(PowerPlatformVaultError) as outcome:
                platform._refresh_provider(REFRESH)
        self.assertEqual(outcome.exception.code, "RECONNECT_REQUIRED")
        self.assertIn("https://api.powerplatform.com/ResourceQuery.Resources.Read", observed[0])
        self.assertNotIn("service.flow.microsoft.com", observed[0])


if __name__ == "__main__":
    unittest.main()
