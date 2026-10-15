"""Bid Log BFF preserves the bridge's terminal flag without trusting browser EID."""
from __future__ import annotations

import asyncio
import unittest
from unittest.mock import patch
from uuid import uuid4

import httpx
from backend.app import main
from backend.app.auth import CurrentUser


def actor():
    return CurrentUser(
        eid=2021, it_user_id=24, display_name="Synthetic Tester",
        app_role="ADMIN", employee_trade=None, can_edit_billing=False,
        billing_access_source=None, microsoft_username=None,
        entra_object_id="00000000-0000-0000-0000-000000000001",
        tenant_id="test",
    )


class TerminalFeedbackProxyTests(unittest.TestCase):
    def setUp(self):
        self.original = main.app.dependency_overrides.copy()
        main.app.dependency_overrides[main.get_current_user] = actor

    def tearDown(self):
        main.app.dependency_overrides.clear()
        main.app.dependency_overrides.update(self.original)

    def test_ended_marker_reaches_browser_and_actor_is_resolved_server_side(self):
        session_id = str(uuid4())
        result = {"usageSessionId": session_id, "sessionEnded": True, "eid": 2021}

        async def exercise():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=main.app),
                base_url="http://testserver",
            ) as client:
                return await client.post(
                    "/api/usage/heartbeat",
                    headers={"X-Riggs-User-EID": "9999"},
                    json={"usageSessionId": session_id, "clientActive": True},
                )

        with patch.object(main, "record_bid_log_usage_heartbeat", return_value=result) as bridge:
            response = asyncio.run(exercise())
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), result)
            bridge.assert_called_once()
            self.assertEqual(bridge.call_args.kwargs["actor_eid"], 2021)
            self.assertEqual(bridge.call_args.kwargs["usage_session_id"], session_id)

    def test_missing_or_false_marker_remains_compatible_with_older_bridge(self):
        session_id = str(uuid4())

        async def exercise(result):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=main.app),
                base_url="http://testserver",
            ) as client:
                return await client.post(
                    "/api/usage/heartbeat",
                    json={"usageSessionId": session_id},
                )

        for payload in (
            {"usageSessionId": session_id},
            {"usageSessionId": session_id, "sessionEnded": False},
        ):
            with self.subTest(payload=payload), patch.object(
                main, "record_bid_log_usage_heartbeat", return_value=payload,
            ) as bridge:
                response = asyncio.run(exercise(payload))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), payload)
                self.assertEqual(bridge.call_args.kwargs["actor_eid"], 2021)


if __name__ == "__main__":
    unittest.main()
