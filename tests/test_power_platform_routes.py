"""Offline OAuth identity pin, owner gate and read-only HTTP method tests."""
from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.responses import RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

from backend.app.auth import CurrentUser, require_administration_owner
from backend.app.power_platform_routes import create_power_platform_router

OID = '11111111-1111-4111-8111-111111111111'
TENANT = '22222222-2222-4222-8222-222222222222'
ACCESS = 'synthetic-delegated-access-token-do-not-store'

class FakeOAuthClient:
    def __init__(self, oid=OID): self.oid = oid
    async def authorize_redirect(self, *_args, **_kwargs): return RedirectResponse('https://login.microsoftonline.com/test')
    async def authorize_access_token(self, _request):
        return {'userinfo': {'oid': self.oid, 'tid': TENANT}, 'access_token': ACCESS, 'expires_in': 1800}

class FakeVault:
    def __init__(self): self.saved = []
    def save(self, identity, token): self.saved.append((identity, token))
    def status(self, identity): return {'connected': bool(self.saved), 'availability':'CONNECTED' if self.saved else 'RECONNECT_REQUIRED', 'expiresAtUTC':None}
    def access_token(self, identity): return ACCESS if self.saved else None
    def disconnect(self, identity): self.saved.clear()

class RouteTests(unittest.TestCase):
    def build(self, enabled=True, fake_oid=OID):
        settings = SimpleNamespace(
            power_platform_monitoring_enabled=enabled, auth_mode='entra',
            entra_configured=True, power_platform_redirect_uri='https://bidlog.riggscompanies.com/api/admin/power-platform/callback',
            power_platform_token_key='unused-fake',
        )
        oauth = SimpleNamespace(power_platform=FakeOAuthClient(fake_oid))
        app = FastAPI()
        app.add_middleware(SessionMiddleware, secret_key='offline-only-test-key')
        app.include_router(create_power_platform_router(oauth=oauth, settings=settings))
        user = CurrentUser(eid=2021,it_user_id=1,display_name='Owner',app_role='ADMIN',
            employee_trade=None,can_edit_billing=True,billing_access_source=None,
            microsoft_username=None,entra_object_id=OID,tenant_id=TENANT)
        app.dependency_overrides[require_administration_owner] = lambda: user
        return TestClient(app), app, settings

    def test_disabled_status_and_no_read(self):
        client, _, _ = self.build(enabled=False)
        self.assertEqual(client.get('/api/admin/power-platform/status').json(), {'enabled':False})
        self.assertEqual(client.get('/api/admin/power-platform/environments').status_code, 404)

    def test_owner_gate_does_not_fall_back_to_admin_role(self):
        client, app, _ = self.build()
        app.dependency_overrides.clear()
        self.assertNotEqual(client.get('/api/admin/power-platform/status').status_code, 200)

    def test_connect_then_callback_is_identity_bound(self):
        client, _, _ = self.build()
        vault = FakeVault()
        with patch('backend.app.power_platform_routes._vault',return_value=vault):
            c = client.get('/api/admin/power-platform/connect',follow_redirects=False)
            self.assertEqual(c.status_code,307)
            self.assertEqual(client.get('/api/admin/power-platform/callback').status_code,200)
            self.assertEqual(len(vault.saved),1)
            self.assertNotIn(ACCESS, str(client.cookies))
            self.assertNotIn(ACCESS, client.get('/api/admin/power-platform/status').text)

    def test_wrong_oid_callback_never_saves_token(self):
        client, _, _ = self.build(fake_oid='33333333-3333-4333-8333-333333333333')
        vault = FakeVault()
        with patch('backend.app.power_platform_routes._vault',return_value=vault):
            client.get('/api/admin/power-platform/connect',follow_redirects=False)
            response = client.get('/api/admin/power-platform/callback')
            self.assertEqual(response.status_code,200)
            self.assertIn('connection failed',response.text)
            self.assertFalse(vault.saved)

    def test_callback_without_intent_does_not_save(self):
        client,_,_ = self.build()
        vault=FakeVault()
        with patch('backend.app.power_platform_routes._vault',return_value=vault):
            self.assertIn('connection failed',client.get('/api/admin/power-platform/callback').text)
            self.assertFalse(vault.saved)

    def test_post_cannot_mutate_flows_and_disconnect_requires_header(self):
        client,_,_ = self.build()
        vault = FakeVault()
        with patch('backend.app.power_platform_routes._vault',return_value=vault):
            self.assertEqual(client.post('/api/admin/power-platform/environments').status_code,405)
            self.assertEqual(client.post('/api/admin/power-platform/disconnect').status_code,403)
            self.assertEqual(client.post('/api/admin/power-platform/disconnect',
                headers={'X-Riggs-PowerPlatform-Action':'disconnect'}).status_code,200)

if __name__=='__main__':unittest.main()
