"""S8: selected-page passive batch read, strict owner authorization and bounded reuse."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.auth import CurrentUser, require_administration_owner
from backend.app.power_platform_routes import create_power_platform_router
from backend.app.power_platform_vault import PowerPlatformVaultError
from backend.app.power_automate_monitoring import PowerPlatformReadError

ENV = 'Default-11111111-1111-4111-8111-111111111111'
FLOW1 = '22222222-2222-4222-8222-222222222222'
FLOW2 = '33333333-3333-4333-8333-333333333333'
FLOW3 = '44444444-4444-4444-8444-444444444444'
FLOW4 = '55555555-5555-4555-8555-555555555555'
ACCESS = 'synthetic-test-runtime-access-credential'


def route_client(runtime_enabled=True):
    settings = SimpleNamespace(
        power_platform_monitoring_enabled=True,
        power_platform_runtime_probe_enabled=runtime_enabled,
        power_platform_sso_enabled=True,
        power_platform_refresh_enabled=True,
        auth_mode='entra', entra_configured=True,
        power_platform_redirect_uri='https://example.test/oauth/callback',
        power_platform_token_key='not-a-live-credential',
    )
    app = FastAPI()
    app.include_router(create_power_platform_router(oauth=SimpleNamespace(), settings=settings))
    owner = CurrentUser(eid=2021,it_user_id=1,display_name='Synthetic Owner',
        app_role='ADMIN',employee_trade=None,can_edit_billing=False,
        billing_access_source=None,microsoft_username=None,
        entra_object_id='11111111-1111-4111-8111-111111111111',
        tenant_id='22222222-2222-4222-8222-222222222222')
    app.dependency_overrides[require_administration_owner] = lambda: owner
    return TestClient(app), app


class FakeVault:
    calls=[]
    @classmethod
    def from_settings(cls, settings, *, purpose='platform'):
        cls.calls.append(('read',purpose))
        return cls()
    def runtime_access_token_from(self, identity, source):
        self.calls.append(('grant',identity.eid))
        return ACCESS


class FakeReader:
    calls=[]
    def __init__(self, *, delegated_access_token):
        assert delegated_access_token==ACCESS
    def __enter__(self): return self
    def __exit__(self,*args): return None
    def selected_runs(self, env, flow):
        self.calls.append((env,flow))
        if flow == FLOW2:
            raise PowerPlatformReadError('THROTTLED')
        status='FAILED' if flow == FLOW1 else 'SUCCEEDED'
        return {'availability':'AVAILABLE','hasMore':False,
            'runs':[{'runId':'run-001','status':status,'startedAtUTC':'2026-10-26T16:29:19Z'}],
            'lastSuccessInReturnedSampleUTC':'2026-10-26T16:29:19Z' if status=='SUCCEEDED' else None}


class RunBatchTests(unittest.TestCase):
    def setUp(self):
        FakeVault.calls=[]
        FakeReader.calls=[]

    def query(self, client, *flows):
        return client.get('/api/admin/power-platform/runtime-run-batch',
            params=[('flow',f'{ENV}:{f}') for f in flows])

    def test_four_flows_one_token_lookup_and_sanitized_boundaries(self):
        client,_=route_client()
        with patch('backend.app.power_platform_routes.EncryptedPowerPlatformVault',FakeVault),\
             patch('backend.app.power_platform_routes.FlowRuntimeReadClient',FakeReader):
            res=self.query(client,FLOW1,FLOW2,FLOW3,FLOW4)
        self.assertEqual(res.status_code,200)
        self.assertEqual(res.headers['Cache-Control'],'private, no-store')
        payload=res.json()['results']
        self.assertEqual(len(payload),4)
        self.assertEqual([p['resourceId'] for p in payload],[FLOW1,FLOW2,FLOW3,FLOW4])
        self.assertEqual([p['runIdentitySource'] for p in payload],
            ['RUNTIME_EXACT_RESOURCE_ENDPOINT','NOT_VERIFIED',
             'RUNTIME_EXACT_RESOURCE_ENDPOINT','RUNTIME_EXACT_RESOURCE_ENDPOINT'])
        self.assertEqual(payload[0]['runHistory']['runs'][0]['status'],'FAILED')
        self.assertEqual(payload[1]['runHistory']['availability'],'THROTTLED')
        self.assertEqual(FakeVault.calls,[('read','runtime'),('read','platform'),('grant',2021)])
        self.assertEqual(len(FakeReader.calls),4)
        self.assertNotIn(ACCESS,res.text)

    def test_invalid_size_duplicate_or_bad_flow_rejected_before_vault(self):
        client,_=route_client()
        with patch('backend.app.power_platform_routes.EncryptedPowerPlatformVault',FakeVault):
            for flows in ((),(FLOW1,FLOW1),(FLOW1,FLOW2,FLOW3,FLOW4,FLOW1)):
                with self.subTest(flows=flows):
                    self.assertEqual(self.query(client,*flows).status_code,422)
            for path in [
                f'/api/admin/power-platform/runtime-run-batch?flow={ENV}:notaguid',
                '/api/admin/power-platform/runtime-run-batch?flow=https://evil:stuff',
            ]:
                self.assertEqual(client.get(path).status_code,422)
        self.assertEqual(FakeVault.calls,[])

    def test_disabling_runtime_flag_fails_closed(self):
        client,_=route_client(runtime_enabled=False)
        with patch('backend.app.power_platform_routes.EncryptedPowerPlatformVault',FakeVault):
            self.assertEqual(self.query(client,FLOW1).status_code,404)
        self.assertEqual(FakeVault.calls,[])

    def test_owner_gate_denies_other_admin_before_grant(self):
        client,app=route_client()
        app.dependency_overrides.clear()
        with patch('backend.app.power_platform_routes.EncryptedPowerPlatformVault',FakeVault):
            self.assertIn(self.query(client,FLOW1).status_code,(401,403,503))
        self.assertEqual(FakeVault.calls,[])

    def test_runtime_credential_denial_returns_unverified_not_success(self):
        client,_=route_client()
        class DeniedVault(FakeVault):
            def runtime_access_token_from(self,identity,source):
                raise PowerPlatformVaultError('RUNTIME_CONSENT_REQUIRED')
        with patch('backend.app.power_platform_routes.EncryptedPowerPlatformVault',DeniedVault),\
             patch('backend.app.power_platform_routes.FlowRuntimeReadClient',FakeReader):
            res=self.query(client,FLOW1,FLOW2)
        self.assertEqual(res.status_code,200)
        self.assertEqual([p['runHistory']['availability'] for p in res.json()['results']],
            ['RUNTIME_CONSENT_REQUIRED']*2)
        self.assertTrue(all(p['runIdentitySource']=='NOT_VERIFIED' for p in res.json()['results']))
        self.assertEqual(FakeReader.calls,[])

    def test_only_get_supported_for_batch(self):
        client,_=route_client()
        self.assertEqual(client.post('/api/admin/power-platform/runtime-run-batch').status_code,405)


if __name__=='__main__': unittest.main()
