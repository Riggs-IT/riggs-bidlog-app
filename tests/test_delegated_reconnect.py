from __future__ import annotations

import asyncio
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from backend.app import main

OID = "11111111-2222-3333-4444-555555555555"
OTHER = "99999999-8888-7777-6666-555555555555"


def actor(oid=OID, eid=2021):
    return SimpleNamespace(
        entra_object_id=oid,
        eid=eid,
        tenant_id="company-tenant",
    )


def request():
    return SimpleNamespace(session={
        "entra_identity": {"oid": OID, "tid": "company-tenant"},
        "session_revision": "production",
        "last_activity_at": 12345,
        "delegated_reconnect_oid": OID,
        "delegated_reconnect_eid": 2021,
        "delegated_session_id": "old-opaque-session",
        "delegated_actor_eid": 2021,
    })


class DelegatedReconnectTests(unittest.TestCase):
    def test_start_reconnect_keeps_existing_application_cookie_and_checks_actor(self):
        req = request()
        stub = SimpleNamespace(
            auth_mode="entra", entra_configured=True,
            bid_log_delegated_auth_enabled=True,
            bid_log_delegated_writes_enabled=True,
            entra_redirect_uri="https://bidlog.example/api/auth/callback",
        )
        redirect = AsyncMock(return_value="oauth-redirect")
        with patch.object(main, "settings", stub), \
             patch.object(main.oauth.entra, "authorize_redirect", redirect), \
             patch.object(main, "_require_bid_log_workspace_access") as workspace, \
             patch.object(main, "_require_bid_log_editor") as editor:
            result = asyncio.run(main.auth_delegated_reconnect(req, actor()))
        self.assertEqual(result, "oauth-redirect")
        self.assertEqual(req.session["delegated_session_id"], "old-opaque-session")
        self.assertEqual(req.session["entra_identity"]["oid"], OID)
        self.assertEqual(req.session["delegated_reconnect_oid"], OID)
        self.assertEqual(req.session["delegated_reconnect_eid"], 2021)
        workspace.assert_called_once()
        editor.assert_called_once()
        self.assertEqual(redirect.await_args.kwargs["prompt"], "select_account")

    def test_reconnect_disabled_fails_before_oauth_or_session_mutation(self):
        req = request()
        stub = SimpleNamespace(
            auth_mode="entra", entra_configured=True,
            bid_log_delegated_auth_enabled=True,
            bid_log_delegated_writes_enabled=False,
        )
        redirect = AsyncMock()
        with patch.object(main, "settings", stub), \
             patch.object(main.oauth.entra, "authorize_redirect", redirect):
            with self.assertRaises(main.HTTPException) as exc:
                asyncio.run(main.auth_delegated_reconnect(req, actor()))
        self.assertEqual(exc.exception.status_code, 403)
        self.assertEqual(req.session["delegated_session_id"], "old-opaque-session")
        redirect.assert_not_awaited()

    def test_success_replaces_only_delegated_identity_and_revision(self):
        req = request()
        token = {"access_token": "SECRET-BEARER-TOKEN", "userinfo": {
            "oid": OID, "tid": "company-tenant"}}
        auth = AsyncMock(return_value=token)
        with patch.object(main, "get_current_user", return_value=actor()), \
             patch.object(main, "resolve_entra_user", return_value=actor()), \
             patch.object(main.oauth.entra, "authorize_access_token", auth), \
             patch.object(main, "create_bid_log_delegated_session", return_value={"sessionId": "new-opaque-session"}) as create:
            result = asyncio.run(main._complete_delegated_reconnect(req))
        self.assertEqual(result.status_code, 200)
        self.assertIn(b"connection restored", result.body)
        self.assertEqual(req.session["delegated_session_id"], "new-opaque-session")
        self.assertEqual(req.session["delegated_actor_eid"], 2021)
        self.assertEqual(req.session["entra_identity"]["oid"], OID)
        self.assertEqual(req.session["session_revision"], "production")
        self.assertNotIn("delegated_reconnect_oid", req.session)
        self.assertNotIn("delegated_reconnect_eid", req.session)
        self.assertEqual(len(req.session["delegated_reconnect_revision"]), 32)
        self.assertNotIn(b"SECRET-BEARER-TOKEN", result.body)
        self.assertNotIn("SECRET-BEARER-TOKEN", repr(req.session))
        create.assert_called_once_with(
            user_assertion="SECRET-BEARER-TOKEN", actor_eid=2021,
            request_id=create.call_args.kwargs["request_id"],
        )

    def test_different_microsoft_oid_fails_closed_without_replacing_session(self):
        req = request()
        with patch.object(main, "get_current_user", return_value=actor()), \
             patch.object(main, "resolve_entra_user", return_value=actor(OTHER)), \
             patch.object(main.oauth.entra, "authorize_access_token", AsyncMock(
                 return_value={"access_token": "SECRET", "userinfo": {"oid": OTHER}}
             )), \
             patch.object(main, "create_bid_log_delegated_session") as create:
            result = asyncio.run(main._complete_delegated_reconnect(req))
        self.assertEqual(result.status_code, 200)
        self.assertIn(b"not restored", result.body)
        self.assertEqual(req.session["delegated_session_id"], "old-opaque-session")
        self.assertEqual(req.session["entra_identity"]["oid"], OID)
        self.assertNotIn("delegated_reconnect_revision", req.session)
        create.assert_not_called()

    def test_oauth_failure_does_not_sign_out_browser(self):
        req = request()
        with patch.object(main, "get_current_user", return_value=actor()), \
             patch.object(main.oauth.entra, "authorize_access_token", AsyncMock(side_effect=RuntimeError("denied"))):
            result = asyncio.run(main._complete_delegated_reconnect(req))
        self.assertIn(b"not restored", result.body)
        self.assertEqual(req.session["delegated_session_id"], "old-opaque-session")
        self.assertEqual(req.session["entra_identity"]["oid"], OID)

    def test_reconnect_status_exposes_no_opaque_id_or_token(self):
        req = request()
        req.session["delegated_reconnect_revision"] = "new-revision"
        with patch.object(main, "_require_bid_log_workspace_access"), \
             patch.object(main, "_require_bid_log_editor"):
            response = main.auth_delegated_reconnect_status(req, actor())
        self.assertIn(b"new-revision", response.body)
        self.assertNotIn(b"old-opaque-session", response.body)

    def test_existing_callback_and_api_paths_remain_registered(self):
        urls = [getattr(r, "path", None) for r in main.app.routes]
        for url in ("/api/auth/login", "/api/auth/callback",
                    "/api/auth/delegated/reconnect", "/api/auth/delegated/reconnect-status"):
            self.assertEqual(urls.count(url), 1)
