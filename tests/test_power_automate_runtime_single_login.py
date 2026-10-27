"""Synthetic-only certification of experimental runtime reader and SSO bootstrap."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from cryptography.fernet import Fernet

from backend.app.power_automate_monitoring import PowerPlatformReadError
from backend.app.power_automate_runtime import FlowRuntimeReadClient
from backend.app.power_platform_sso import exchange_login_refresh, bootstrap_owner_connection
from backend.app.power_platform_vault import (
    EncryptedPowerPlatformVault, PowerPlatformVaultError, VerifiedPrincipal,
)
from tests.test_power_platform_silent_refresh import Collection

ENV = "Default-6b230179-bcf9-4193-928b-727447b8e954"
FLOW = "9f0c7436-813c-4980-9f2c-67073fe89290"
OID = "11111111-1111-4111-8111-111111111111"
TENANT = "22222222-2222-4222-8222-222222222222"
CLIENT = "33333333-3333-4333-8333-333333333333"
ACCESS = "synthetic-platform-access-token-for-test-only"
REFRESH = "synthetic-platform-refresh-token-for-test-only"


def runtime_row(i, date, status):
    return {
        "name": f"run-{i}",
        "id": f"/providers/Microsoft.ProcessSimple/environments/{ENV}/flows/{FLOW}/runs/run-{i}",
        "properties": {"startTime": date, "status": status,
                       "endTime": date, "inputs": {"secret": "NEVER_SHOW_ME"},
                       "error": {"message": "NEVER_SHOW_ME"}},
    }


RUNS = [
    runtime_row(1, "2026-10-26T16:29:19Z", "Succeeded"),
    runtime_row(2, "2026-10-21T20:08:31Z", "Failed"),
    runtime_row(3, "2026-10-21T19:00:42Z", "Succeeded"),
    runtime_row(4, "2026-10-21T15:52:15Z", "Failed"),
    runtime_row(5, "2026-10-21T15:51:10Z", "Failed"),
    runtime_row(6, "2026-10-21T15:48:50Z", "Failed"),
]


class RuntimeReaderTests(unittest.TestCase):
    def test_six_known_executions_match_portal_and_hide_payload(self):
        seen = []
        def reply(request):
            seen.append(request)
            self.assertEqual(request.method, "GET")
            self.assertEqual(str(request.url.scheme), "https")
            self.assertEqual(request.url.host, "api.flow.microsoft.com")
            self.assertEqual(request.url.params.get("api-version"), "2016-11-01")
            self.assertEqual(request.url.params.get("$top"), "20")
            self.assertTrue(request.url.path.endswith(f"/flows/{FLOW}/runs"))
            return httpx.Response(200, json={"value": RUNS})
        client = httpx.Client(transport=httpx.MockTransport(reply))
        with FlowRuntimeReadClient(delegated_access_token=ACCESS, client=client) as reader:
            result = reader.selected_runs(ENV, FLOW)
        self.assertEqual(len(seen), 1)
        self.assertEqual(result["availability"], "AVAILABLE")
        self.assertEqual(len(result["runs"]), 6)
        self.assertEqual([r["status"] for r in result["runs"]],
                         ["SUCCEEDED", "FAILED", "SUCCEEDED", "FAILED", "FAILED", "FAILED"])
        self.assertEqual(result["runs"][0]["startedAtUTC"], "2026-10-26T16:29:19Z")
        self.assertEqual(result["lastSuccessInReturnedSampleUTC"], "2026-10-26T16:29:19Z")
        self.assertNotIn("NEVER_SHOW_ME", str(result))
        self.assertNotIn(ACCESS, str(result))

    def test_rejects_input_id_before_any_http_call(self):
        seen = []
        client = httpx.Client(transport=httpx.MockTransport(
            lambda request: seen.append(request) or httpx.Response(200, json={"value": []})))
        with FlowRuntimeReadClient(delegated_access_token=ACCESS, client=client) as reader:
            for env,flow in (("../evil",FLOW),(ENV,"evil"),(ENV,"https://evil")):
                with self.assertRaises(PowerPlatformReadError):
                    reader.selected_runs(env,flow)
        self.assertEqual(seen, [])

    def test_bad_association_does_not_create_successful_history(self):
        evil = dict(RUNS[0], id=RUNS[0]["id"].replace(FLOW, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))
        with FlowRuntimeReadClient(delegated_access_token=ACCESS, client=httpx.Client(
            transport=httpx.MockTransport(lambda _: httpx.Response(200,json={"value":[evil]})))) as reader:
            with self.assertRaises(PowerPlatformReadError) as context:
                reader.selected_runs(ENV,FLOW)
        self.assertEqual(context.exception.code, "RUN_DATA_UNVERIFIABLE")

    def test_200_empty_means_only_no_reported_runs(self):
        with FlowRuntimeReadClient(delegated_access_token=ACCESS, client=httpx.Client(
            transport=httpx.MockTransport(lambda _: httpx.Response(200,json={"value":[]})))) as reader:
            result = reader.selected_runs(ENV, FLOW)
        self.assertEqual(result["availability"], "NO_RUNS_REPORTED")
        self.assertEqual(result["runs"], [])

    def test_http_errors_redact_body_and_skip_redirects(self):
        for code,expected in ((401,"RUNTIME_TOKEN_REJECTED"),(403,"ACCESS_DENIED"),
                              (404,"RUNTIME_FLOW_NOT_FOUND"),(429,"THROTTLED"),
                              (500,"UPSTREAM_UNAVAILABLE"),(302,"INVALID_RESPONSE")):
            with self.subTest(code=code):
                with FlowRuntimeReadClient(delegated_access_token=ACCESS, client=httpx.Client(
                    transport=httpx.MockTransport(lambda _:httpx.Response(code,text="DO_NOT_LEAK")))) as reader:
                    with self.assertRaises(PowerPlatformReadError) as outcome:
                        reader.selected_runs(ENV,FLOW)
                    self.assertEqual(outcome.exception.code,expected)
                    self.assertNotIn("DO_NOT_LEAK",str(outcome.exception))

    def test_bounded_response_rejects_more_than_twenty(self):
        with FlowRuntimeReadClient(delegated_access_token=ACCESS, client=httpx.Client(
            transport=httpx.MockTransport(lambda _:httpx.Response(200,json={"value":RUNS*4})))) as reader:
            with self.assertRaises(PowerPlatformReadError) as caught:
                reader.selected_runs(ENV,FLOW)
        self.assertEqual(caught.exception.code,"RESPONSE_TOO_LARGE")


class SingleLoginAndRuntimeVaultTests(unittest.TestCase):
    def setUp(self):
        self.settings = SimpleNamespace(
            entra_tenant_id=TENANT, entra_client_id=CLIENT,
            entra_client_secret="synthetic-confidential-app-client-secret-only",
            power_platform_monitoring_enabled=True,
            power_platform_refresh_enabled=True,
            power_platform_sso_enabled=True,
        )
        self.principal = VerifiedPrincipal(2021, OID, TENANT)
        self.other = VerifiedPrincipal(176, OID, TENANT)
        self.collection = Collection()
        self.key = Fernet.generate_key().decode()
        self.source = EncryptedPowerPlatformVault(
            collection=self.collection,encryption_key=self.key,refresh_enabled=True,
            refresh_provider=lambda _: {"access_token":ACCESS,"refresh_token":REFRESH,"expires_in":3600},
        )
        self.runtime = EncryptedPowerPlatformVault(
            collection=self.collection,encryption_key=self.key,refresh_enabled=True,
            purpose="runtime",refresh_provider=lambda _: {
                "access_token":"synthetic-runtime-access-token-000", "refresh_token":"synthetic-runtime-refresh-token-000", "expires_in":3600},
        )

    def test_refresh_exchange_uses_fixed_tenant_and_only_read_scope(self):
        seen=[]
        def exchange(request):
            seen.append(request)
            self.assertEqual(request.method,"POST")
            self.assertEqual(request.url.host,"login.microsoftonline.com")
            self.assertEqual(request.url.path,f"/{TENANT}/oauth2/v2.0/token")
            data = dict(httpx.QueryParams(request.content.decode()))
            self.assertEqual(data["grant_type"],"refresh_token")
            self.assertEqual(data["refresh_token"],REFRESH)
            self.assertIn("ResourceQuery.Resources.Read",data["scope"])
            self.assertNotIn("User.ReadWrite",data["scope"])
            return httpx.Response(200,json={"access_token":ACCESS,"refresh_token":REFRESH,"expires_in":3600})
        result=exchange_login_refresh(self.settings,REFRESH,client=httpx.Client(transport=httpx.MockTransport(exchange)))
        self.assertEqual(result["access_token"],ACCESS)
        self.assertEqual(len(seen),1)

    def test_bootstrap_isolated_best_effort_and_no_raw_grant(self):
        with patch("backend.app.power_platform_sso.EncryptedPowerPlatformVault.from_settings",return_value=self.source):
            with patch("backend.app.power_platform_sso.exchange_login_refresh",return_value={
                "access_token": ACCESS,"refresh_token":REFRESH,"expires_in":3600,
            }) as ex:
                self.assertEqual(bootstrap_owner_connection(self.settings,self.principal,REFRESH),"CONNECTED")
                self.assertEqual(bootstrap_owner_connection(self.settings,self.principal,REFRESH),"ALREADY_CONNECTED")
                self.assertEqual(ex.call_count,1)
        self.assertNotIn(REFRESH,str(self.collection.rows))
        self.assertNotIn(ACCESS,str(self.collection.rows))
        self.assertEqual(self.source.status(self.other)["connected"],False)

    def test_missing_consent_never_breaks_login_or_erases_vault(self):
        with patch("backend.app.power_platform_sso.EncryptedPowerPlatformVault.from_settings",return_value=self.source):
            with patch("backend.app.power_platform_sso.exchange_login_refresh",side_effect=PowerPlatformVaultError("SSO_CONSENT_OR_REAUTH_REQUIRED")):
                self.assertEqual(bootstrap_owner_connection(self.settings,self.principal,REFRESH),"SSO_CONSENT_OR_REAUTH_REQUIRED")
        self.assertEqual(self.collection.rows,{})

    def test_runtime_vault_separate_encrypted_owner_document(self):
        self.source.save(self.principal,{"access_token":ACCESS,"refresh_token":REFRESH,"expires_in":3600})
        token=self.runtime.runtime_access_token_from(self.principal,self.source)
        self.assertEqual(token,"synthetic-runtime-access-token-000")
        self.assertNotEqual(self.source._document_key(self.principal),self.runtime._document_key(self.principal))
        self.assertNotIn("synthetic-runtime-access-token-000",str(self.collection.rows))
        self.assertNotIn(REFRESH,str(self.collection.rows))
        self.assertEqual(self.source.access_token(self.principal),ACCESS)
        self.assertEqual(self.runtime.access_token(self.other),None)

    def test_runtime_consent_failure_keeps_platform_connection(self):
        self.source.save(self.principal,{"access_token":ACCESS,"refresh_token":REFRESH,"expires_in":3600})
        self.runtime._refresh_provider=lambda _: (_ for _ in ()).throw(PowerPlatformVaultError("RUNTIME_TOKEN_GRANT_REJECTED"))
        with self.assertRaises(PowerPlatformVaultError) as caught:
            self.runtime.runtime_access_token_from(self.principal,self.source)
        self.assertEqual(caught.exception.code,"RUNTIME_TOKEN_GRANT_REJECTED")
        self.assertTrue(self.source.status(self.principal)["connected"])

    def test_no_runtime_refresh_token_is_not_stored(self):
        self.source.save(self.principal,{"access_token":ACCESS,"refresh_token":REFRESH,"expires_in":3600})
        self.runtime._refresh_provider=lambda _: {"access_token":"synthetic-runtime-access-token-000", "expires_in":3600}
        self.assertEqual(self.runtime.runtime_access_token_from(self.principal,self.source),"synthetic-runtime-access-token-000")
        self.assertFalse(self.runtime.status(self.principal)["connected"])


if __name__ == "__main__": unittest.main()


class AuthorizationBoundaryTests(unittest.TestCase):
    def test_owner_gate_requires_authoritative_eid_role_tenant_and_oid(self):
        from backend.app import auth
        from backend.app.auth import CurrentUser, can_view_administration
        configured = SimpleNamespace(auth_mode="entra", entra_configured=True,
            admin_owner_entra_object_id=OID, entra_tenant_id=TENANT)
        base = dict(eid=2021,it_user_id=13,display_name="Synthetic",
            app_role="ADMIN",employee_trade=None,can_edit_billing=False,
            billing_access_source=None,microsoft_username=None,
            entra_object_id=OID,tenant_id=TENANT)
        identity={"oid":OID,"tid":TENANT}
        with patch.object(auth,"settings",configured):
            self.assertTrue(can_view_administration(CurrentUser(**base),identity))
            for change in ({"eid":176},{"app_role":"VIEWER"},
                           {"entra_object_id":"44444444-4444-4444-8444-444444444444"},
                           {"tenant_id":"55555555-5555-4555-8555-555555555555"}):
                self.assertFalse(can_view_administration(CurrentUser(**{**base,**change}),identity))
            self.assertFalse(can_view_administration(CurrentUser(**base),{"oid":base["entra_object_id"],
                "tid":"55555555-5555-4555-8555-555555555555"}))


class SelectedFlowRuntimeRouteTests(unittest.TestCase):
    """HTTP contract, owner access, feature boundary and upstream failure behavior."""

    def _client(self, runtime_enabled=True):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from backend.app.auth import CurrentUser, require_administration_owner
        from backend.app.power_platform_routes import create_power_platform_router

        settings = SimpleNamespace(
            power_platform_monitoring_enabled=True,
            power_platform_runtime_probe_enabled=runtime_enabled,
            power_platform_sso_enabled=True,
            power_platform_refresh_enabled=True,
            auth_mode="entra", entra_configured=True,
            power_platform_redirect_uri="https://bidlog.riggscompanies.com/api/admin/power-platform/callback",
            power_platform_token_key="mock-secret-key-never-used",
        )
        app = FastAPI()
        app.include_router(create_power_platform_router(oauth=SimpleNamespace(), settings=settings))
        owner = CurrentUser(eid=2021, it_user_id=1, display_name="Synthetic Owner",
            app_role="ADMIN", employee_trade=None, can_edit_billing=False,
            billing_access_source=None, microsoft_username=None,
            entra_object_id=OID, tenant_id=TENANT)
        app.dependency_overrides[require_administration_owner] = lambda: owner
        return TestClient(app), app

    def test_selected_flow_http_only_returns_six_sanitized_runs(self):
        client, _ = self._client()
        reader_calls = []
        from backend.app.power_automate_runtime import FlowRuntimeReadClient
        old_client = httpx.Client(transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json={"value": RUNS})))

        class FakeVault:
            @classmethod
            def from_settings(cls, _settings, purpose="platform"):
                reader_calls.append(("vault", purpose))
                return cls()
            def runtime_access_token_from(self, principal, source):
                self_inner = principal
                assert self_inner.eid == 2021
                assert isinstance(source, FakeVault)
                return ACCESS
        with patch("backend.app.power_platform_routes.EncryptedPowerPlatformVault", FakeVault), \
             patch("backend.app.power_platform_routes.FlowRuntimeReadClient") as read:
            read.side_effect = lambda delegated_access_token: FlowRuntimeReadClient(
                delegated_access_token=delegated_access_token, client=old_client)
            response = client.get(f"/api/admin/power-platform/environments/{ENV}/flows/{FLOW}/inspect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "private, no-store")
        body = response.json()
        self.assertEqual(body["runIdentitySource"], "RUNTIME_EXACT_RESOURCE_ENDPOINT")
        self.assertEqual(body["runHistory"]["availability"], "AVAILABLE")
        self.assertEqual(len(body["runHistory"]["runs"]), 6)
        self.assertEqual(reader_calls, [("vault", "runtime"), ("vault", "platform")])
        self.assertNotIn("NEVER_SHOW_ME", response.text)
        self.assertNotIn(ACCESS, response.text)
        self.assertEqual(client.post(f"/api/admin/power-platform/environments/{ENV}/flows/{FLOW}/inspect").status_code,405)

    def test_bad_input_rejected_before_vault_or_upstream(self):
        client, _ = self._client()
        with patch("backend.app.power_platform_routes.EncryptedPowerPlatformVault") as storage:
            response = client.get(f"/api/admin/power-platform/environments/bad!env/flows/{FLOW}/inspect")
            self.assertEqual(response.status_code,422)
            self.assertIn("INVALID", response.json().get("detail", ""))
            storage.assert_not_called()

    def test_generic_admin_without_owner_gate_denied(self):
        from backend.app.auth import require_administration_owner
        client, app = self._client()
        app.dependency_overrides.clear()
        with patch("backend.app.power_platform_routes.EncryptedPowerPlatformVault") as storage:
            response = client.get(f"/api/admin/power-platform/environments/{ENV}/flows/{FLOW}/inspect")
            self.assertIn(response.status_code, (401, 403, 503))
            storage.assert_not_called()

    def test_denied_runtime_token_is_nonsecret_unverified_response(self):
        client, _ = self._client()
        class FakeVault:
            @classmethod
            def from_settings(cls, *args, **kwargs): return cls()
            def runtime_access_token_from(self, *_args):
                raise PowerPlatformVaultError("RUNTIME_TOKEN_GRANT_REJECTED")
        with patch("backend.app.power_platform_routes.EncryptedPowerPlatformVault", FakeVault):
            response = client.get(f"/api/admin/power-platform/environments/{ENV}/flows/{FLOW}/inspect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["runHistory"]["availability"], "RUNTIME_TOKEN_GRANT_REJECTED")
        self.assertEqual(response.json()["runHistory"]["runs"], [])
        self.assertEqual(response.json()["runIdentitySource"], "NOT_VERIFIED")
