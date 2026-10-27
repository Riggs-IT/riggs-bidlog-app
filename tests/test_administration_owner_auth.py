"""Owner-only Administration auth: synthetic identity, real signed sessions.

No live SQL, Entra, Cloudflare, or real employee OIDs are used here.
"""
from __future__ import annotations

import base64
import json
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from starlette.middleware.sessions import SessionMiddleware

from backend.app import auth, main
from backend.app.config import Settings
from backend.app.data_api import BidLogAccessUser

OWNER_OID = "11111111-1111-4111-8111-111111111111"
RODNEY_OID = "55555555-5555-4555-8555-555555555555"
OTHER_OID = "22222222-2222-4222-8222-222222222222"
TENANT = "33333333-3333-4333-8333-333333333333"
OTHER_TENANT = "44444444-4444-4444-8444-444444444444"
COOKIE = "riggs_bid_log_session"


class AdministrationOwnerAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.cfg = SimpleNamespace(
            auth_mode="entra",
            dev_auth_entra_object_id=OWNER_OID,
            entra_configured=True,
            entra_tenant_id=TENANT,
            admin_owner_entra_object_id=OWNER_OID,
            admin_secondary_entra_object_id="",
            session_revision="owner-test-revision",
            session_idle_timeout_seconds=3600,
            is_production_runtime=False,
        )
        self.auth_settings = patch.object(auth, "settings", self.cfg)
        self.main_settings = patch.object(main, "settings", self.cfg)
        self.auth_settings.start()
        self.main_settings.start()
        self.addCleanup(self.auth_settings.stop)
        self.addCleanup(self.main_settings.stop)

        self.access = BidLogAccessUser(
            eid=2021,
            it_user_id=301,
            display_name="Synthetic Owner",
            microsoft_username="synthetic@example.invalid",
            entra_object_id=OWNER_OID,
            app_role="ADMIN",
            employee_trade=None,
            can_edit_billing=False,
            billing_access_source=None,
        )
        self.resolver = patch.object(auth, "resolve_bid_log_user", side_effect=lambda oid: self.access)
        self.resolve = self.resolver.start()
        self.addCleanup(self.resolver.stop)

        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

        # Obtain the test app's actual SessionMiddleware secret, not an
        # assumed runtime value. No secret values are output or stored.
        middleware = next(
            item for item in main.app.user_middleware
            if item.cls is SessionMiddleware
        )
        self.signer = TimestampSigner(middleware.kwargs["secret_key"])
        self.seed_cookie()

    def seed_cookie(self, *, oid=OWNER_OID, tid=TENANT, last=None, revision=None):
        data = {
            "entra_identity": {"oid": oid, "tid": tid},
            "last_activity_at": int(time.time()) if last is None else last,
            "session_revision": self.cfg.session_revision if revision is None else revision,
        }
        raw = base64.b64encode(json.dumps(data, separators=(",", ":")).encode("utf-8"))
        value = self.signer.sign(raw).decode("utf-8")
        self.client.cookies.set(COOKIE, value)

    def test_owner_from_signed_entra_and_sql_mapping_allowed(self):
        r = self.client.get("/api/admin/access")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json(), {"canViewAdministration": True, "readOnly": True})
        self.assertIn("no-store", r.headers.get("cache-control", ""))
        self.assertNotIn("entraObjectId", r.text)
        self.assertNotIn(OWNER_OID, r.text)
        self.resolve.assert_called_once_with(OWNER_OID)

        self.resolve.reset_mock()
        me = self.client.get("/api/auth/me")
        self.assertEqual(me.status_code, 200, me.text)
        self.assertIs(me.json()["canViewAdministration"], True)
        self.resolve.assert_called_once_with(OWNER_OID)

    def test_only_explicitly_pinned_second_admin_is_allowed(self):
        # No real identities/OIDs in test source; all values are synthetic.
        self.access = self.access.__class__(**{
            **self.access.__dict__, "eid": 176,
            "entra_object_id": RODNEY_OID, "app_role": "MANAGEMENT_ADMIN",
        })
        self.seed_cookie(oid=RODNEY_OID)
        self.assertEqual(self.client.get("/api/admin/access").status_code, 403)
        self.cfg.admin_secondary_entra_object_id = RODNEY_OID
        self.assertEqual(self.client.get("/api/admin/access").status_code, 200)
        self.assertIs(self.client.get("/api/auth/me").json()["canViewAdministration"], True)
        self.cfg.admin_secondary_entra_object_id = OWNER_OID
        self.assertEqual(self.client.get("/api/admin/access").status_code, 403)
        self.cfg.admin_secondary_entra_object_id = RODNEY_OID
        self.access = self.access.__class__(**{
            **self.access.__dict__, "app_role": "ADMIN",
        })
        self.assertEqual(self.client.get("/api/admin/access").status_code, 403)

    def test_unapproved_management_admin_stays_denied(self):
        self.cfg.admin_secondary_entra_object_id = RODNEY_OID
        self.access = self.access.__class__(**{
            **self.access.__dict__, "eid": 415,
            "entra_object_id": RODNEY_OID, "app_role": "MANAGEMENT_ADMIN",
        })
        self.seed_cookie(oid=RODNEY_OID)
        self.assertEqual(self.client.get("/api/admin/access").status_code, 403)

    def test_other_admin_does_not_inherit_private_capability(self):
        self.access = self.access.__class__(**{
            **self.access.__dict__, "eid": 415, "entra_object_id": OTHER_OID,
        })
        self.seed_cookie(oid=OTHER_OID)
        r = self.client.get("/api/admin/access")
        self.assertEqual(r.status_code, 403, r.text)
        self.assertEqual(r.json()["detail"], "administration_not_authorized")
        self.assertEqual(self.client.get("/api/auth/me").json()["canViewAdministration"], False)

    def test_management_admin_denied_even_when_eid_is_2021(self):
        self.access = self.access.__class__(**{**self.access.__dict__, "app_role": "MANAGEMENT_ADMIN"})
        self.assertEqual(self.client.get("/api/admin/access").status_code, 403)

    def test_viewer_denied_even_when_eid_is_2021(self):
        self.access = self.access.__class__(**{**self.access.__dict__, "app_role": "VIEWER"})
        self.assertEqual(self.client.get("/api/admin/access").status_code, 403)

    def test_different_oid_with_same_eid_denied(self):
        self.access = self.access.__class__(**{**self.access.__dict__, "entra_object_id": OTHER_OID})
        self.seed_cookie(oid=OTHER_OID)
        self.assertEqual(self.client.get("/api/admin/access").status_code, 403)

    def test_mismatched_session_and_resolved_oid_denied(self):
        self.access = self.access.__class__(**{**self.access.__dict__, "entra_object_id": OTHER_OID})
        self.assertEqual(self.client.get("/api/admin/access").status_code, 403)

    def test_wrong_tenant_denied_by_existing_resolver(self):
        self.seed_cookie(tid=OTHER_TENANT)
        r = self.client.get("/api/admin/access")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["detail"], "entra_tenant_not_authorized")
        self.resolve.assert_not_called()

    def test_missing_or_invalid_pin_fails_closed(self):
        for pin in ("", "not-a-guid", "00000000-0000-0000-0000-000000000000", OTHER_OID):
            with self.subTest(pin=pin):
                self.cfg.admin_owner_entra_object_id = pin
                self.assertEqual(self.client.get("/api/admin/access").status_code, 403)
                self.assertFalse(self.client.get("/api/auth/me").json()["canViewAdministration"])

    def test_forged_browser_headers_do_not_grant_owner_access(self):
        self.access = self.access.__class__(**{
            **self.access.__dict__, "eid": 415, "entra_object_id": OTHER_OID,
        })
        self.seed_cookie(oid=OTHER_OID)
        r = self.client.get(
            "/api/admin/access?eid=2021&isAdmin=true",
            headers={"X-Riggs-Actor-EID": "2021", "X-Riggs-User-EID": "2021", "X-Is-Admin": "true"},
        )
        self.assertEqual(r.status_code, 403)

    def test_dev_auth_denied_even_if_dev_oid_matches(self):
        self.cfg.auth_mode = "dev"
        r = self.client.get("/api/admin/access")
        self.assertEqual(r.status_code, 403)
        self.assertFalse(self.client.get("/api/auth/me").json()["canViewAdministration"])

    def test_no_cookie_and_invalid_cookie_still_fail(self):
        self.client.cookies.clear()
        self.assertEqual(self.client.get("/api/admin/access").status_code, 401)
        self.client.cookies.set(COOKIE, "unsignable")
        self.assertEqual(self.client.get("/api/admin/access").status_code, 401)
        self.resolve.assert_not_called()

    def test_stale_and_old_revision_sessions_still_fail(self):
        self.seed_cookie(last=int(time.time()) - 3605)
        self.assertEqual(self.client.get("/api/admin/access").status_code, 401)
        self.seed_cookie(revision="old-revision")
        self.assertEqual(self.client.get("/api/admin/access").status_code, 401)
        self.resolve.assert_not_called()

    def test_private_route_get_only_and_actual_registration(self):
        self.assertEqual(self.client.post("/api/admin/access").status_code, 405)
        matches = [route for route in main.app.routes if getattr(route, "path", "") == "/api/admin/access"]
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].methods, {"GET"})

    def test_entra_permission_pinning_configuration_is_optional_but_validated(self):
        # Optional for ordinary app operation; missing means zero Admin grants.
        valid = Settings(auth_mode="entra", admin_owner_entra_object_id=OWNER_OID)
        self.assertEqual(valid.admin_owner_entra_object_id, OWNER_OID)
        self.assertEqual(Settings(auth_mode="entra").admin_owner_entra_object_id, "")
        self.assertEqual(Settings(auth_mode="entra").admin_secondary_entra_object_id, "")
        self.assertEqual(Settings(auth_mode="entra", admin_secondary_entra_object_id=RODNEY_OID).admin_secondary_entra_object_id, RODNEY_OID)
        with self.assertRaises(ValueError):
            Settings(auth_mode="entra", admin_owner_entra_object_id=OWNER_OID,
                     admin_secondary_entra_object_id=OWNER_OID)
        for invalid in ("invalid", "00000000-0000-0000-0000-000000000000"):
            with self.subTest(value=invalid), self.assertRaises(ValueError):
                Settings(auth_mode="entra", admin_owner_entra_object_id=invalid)


if __name__ == "__main__":
    unittest.main()
