"""An HTTP heartbeat must not stall other work on Uvicorn's event loop."""
from __future__ import annotations

import asyncio
from threading import Event
import unittest
from unittest.mock import patch
from uuid import uuid4

import httpx

from backend.app import main
from backend.app.auth import CurrentUser


def _synthetic_actor() -> CurrentUser:
    return CurrentUser(
        eid=2021, it_user_id=24, display_name="Synthetic Tester",
        app_role="ADMIN", employee_trade=None, can_edit_billing=False,
        billing_access_source=None, microsoft_username=None,
        entra_object_id="00000000-0000-0000-0000-000000000001",
        tenant_id="test",
    )


class UsageHeartbeatConcurrencyTests(unittest.TestCase):
    def test_slow_heartbeat_allows_unrelated_health_request(self):
        entered, release = Event(), Event()
        prior_overrides = main.app.dependency_overrides.copy()
        main.app.dependency_overrides[main.get_current_user] = _synthetic_actor
        def slow_bridge(**kwargs):
            entered.set()
            if not release.wait(timeout=2):
                raise AssertionError("synthetic heartbeat was never released")
            return {"status": "recorded"}

        async def exercise():
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                task = asyncio.create_task(client.post("/api/usage/heartbeat", json={
                    "usageSessionId": str(uuid4()),
                    "currentPage": "Projected Billings",
                    "clientActive": True,
                }))
                try:
                    self.assertTrue(await asyncio.to_thread(entered.wait, 1.5))
                    # Event loop must remain responsive while the sync bridge call waits.
                    response = await asyncio.wait_for(client.get("/api/health"), timeout=0.5)
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()["status"], "ok")
                finally:
                    release.set()
                    completed = await task
                    self.assertEqual(completed.status_code, 200)
                    self.assertEqual(completed.json(), {"status": "recorded"})

        try:
            with patch.object(main, "record_bid_log_usage_heartbeat", side_effect=slow_bridge) as backend:
                asyncio.run(exercise())
                backend.assert_called_once()
                self.assertEqual(backend.call_args.kwargs["actor_eid"], 2021)
                self.assertIsInstance(backend.call_args.kwargs["request_id"], str)
        finally:
            main.app.dependency_overrides.clear()
            main.app.dependency_overrides.update(prior_overrides)

    def test_ending_usage_preserves_actor_and_validations(self):
        previous = main.app.dependency_overrides.copy()
        main.app.dependency_overrides[main.get_current_user] = _synthetic_actor
        async def exercise():
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                session = str(uuid4())
                good = await client.post("/api/usage/end", json={
                    "usageSessionId": session, "endReason": "manual_logout",
                })
                bad = await client.post("/api/usage/end", json={
                    "usageSessionId": session, "endReason": "invalid",
                })
                self.assertEqual(good.status_code, 200)
                self.assertEqual(bad.status_code, 400)
        try:
            with patch.object(main, "end_bid_log_usage_session", return_value={"status": "ended"}) as backend:
                asyncio.run(exercise())
                backend.assert_called_once()
                self.assertEqual(backend.call_args.kwargs["actor_eid"], 2021)
        finally:
            main.app.dependency_overrides.clear()
            main.app.dependency_overrides.update(previous)


if __name__ == "__main__":
    unittest.main()
