from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import (
    MagicMock,
    patch,
)

from backend.app import data_api
from backend.app.auth import (
    CurrentUser,
    _from_access_user,
)


OID = (
    "11111111-2222-3333-4444-555555555555"
)


class BillingCapabilityWiringTests(
    unittest.TestCase
):
    @patch(
        "backend.app.data_api._request_headers"
    )
    @patch(
        "backend.app.data_api._get_http_client"
    )
    def test_access_client_requires_and_returns_billing_capability(
        self,
        get_client,
        request_headers,
    ):
        request_headers.return_value = {}

        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "eid": 1,
            "itUserId": 1001,
            "displayName": "Chris Loeffelholz",
            "microsoftUsername": "chris@example.com",
            "entraObjectId": OID,
            "appRole": "OPERATIONS",
            "employeeTrade": "ESTIMATOR",
            "canEditBilling": True,
            "billingAccessSource": (
                "EXPLICIT_OVERRIDE"
            ),
        }

        client = MagicMock()
        client.post.return_value = response
        get_client.return_value = client

        access = (
            data_api.resolve_bid_log_user(
                OID
            )
        )

        self.assertTrue(
            access.can_edit_billing
        )
        self.assertEqual(
            access.billing_access_source,
            "EXPLICIT_OVERRIDE",
        )

    def test_current_user_public_payload_carries_billing_capability(
        self,
    ):
        access = data_api.BidLogAccessUser(
            eid=2425,
            it_user_id=1002,
            display_name="Tye Smedegaard",
            microsoft_username="tye@example.com",
            entra_object_id=OID,
            app_role="OPERATIONS",
            employee_trade="PM",
            can_edit_billing=False,
            billing_access_source="DENIED",
        )

        user = _from_access_user(
            access,
            tenant_id="tenant",
            microsoft_username=None,
        )

        self.assertIsInstance(
            user,
            CurrentUser,
        )
        self.assertFalse(
            user.can_edit_billing
        )

        payload = user.to_public_dict()

        self.assertIs(
            payload["canEditBilling"],
            False,
        )
        self.assertEqual(
            payload["billingAccessSource"],
            "DENIED",
        )

    def test_forecast_guard_and_frontend_use_billing_capability(
        self,
    ):
        main_source = Path(
            "backend/app/main.py"
        ).read_text()

        panel_source = Path(
            "frontend/src/PMForecastPanel.jsx"
        ).read_text()

        guard_start = main_source.index(
            "def _require_current_project_projection_editor"
        )
        guard_end = main_source.index(
            "def _role_scoped_bid_log_payload",
            guard_start,
        )
        guard_source = main_source[
            guard_start:guard_end
        ]

        self.assertIn(
            "current_user.can_edit_billing",
            guard_source,
        )

        self.assertIn(
            "user?.canEditBilling",
            panel_source,
        )


if __name__ == "__main__":
    unittest.main()
