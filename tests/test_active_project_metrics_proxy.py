from __future__ import annotations
import unittest
from dataclasses import replace
from unittest.mock import patch
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient
from backend.app import main, data_api
from backend.app.auth import CurrentUser, get_current_user
from backend.app.data_api import DataAPIRequestRejected

ADMIN = CurrentUser(eid=2021, it_user_id=1015, display_name="Test ADMIN",
    app_role="ADMIN", employee_trade=None, can_edit_billing=True,
    billing_access_source="TEST", microsoft_username="test@example.test",
    entra_object_id="00000000-0000-0000-0000-000000000001",
    tenant_id="00000000-0000-0000-0000-000000000002")


def valid_patch():
    return {"operationId": str(uuid4()), "expectedRevision": 0,
            "setSquareFootage": True, "setCubicYards": False,
            "squareFootage": "0"}


class ProjectMetricsBffTests(unittest.TestCase):
    def setUp(self):
        main.app.dependency_overrides[get_current_user] = lambda: ADMIN
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)

    def test_get_uses_session_eid_not_browser_header(self):
        with patch.object(main, "get_active_project_metrics", return_value={"jobListId": 24}) as fn:
            r = self.client.get('/api/active-projects/24/metrics', headers={'X-Riggs-User-EID': '9999'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(fn.call_args.kwargs['actor_eid'], 2021)
        self.assertIn('no-store', r.headers['cache-control'])

    def test_patch_uses_session_eid_and_exact_body(self):
        payload = valid_patch()
        with patch.object(main, "save_active_project_metrics", return_value={"jobListId": 24}) as fn:
            r = self.client.patch('/api/active-projects/24/metrics', json=payload,
                headers={'X-Riggs-User-EID': '9999'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(fn.call_args.kwargs['actor_eid'], 2021)
        self.assertEqual(fn.call_args.args[1], payload)
        self.assertIn('no-store', r.headers['cache-control'])

    def test_view_only_users_cannot_patch(self):
        for role in ('VIEWER', 'OPERATIONS', 'MANAGEMENT_ADMIN'):
            main.app.dependency_overrides[get_current_user] = lambda role=role: replace(ADMIN, app_role=role)
            with self.subTest(role=role), patch.object(main, 'save_active_project_metrics') as fn:
                r = self.client.patch('/api/active-projects/24/metrics', json=valid_patch())
                self.assertEqual(r.status_code, 403)
                fn.assert_not_called()

    def test_reject_forged_actor_and_invalid_quantities(self):
        for extra in ({'actorEid': 9999}, {'jobListId': 500}, {'squareFootage': '-1'},
                      {'squareFootage': 'NaN'}, {'squareFootage': '1e6'}, {'squareFootage': ''},
                      {'squareFootage': '1.00000'}, {'setSquareFootage': False},
                      {'setSquareFootage': 1}, {'expectedRevision': True}):
            payload = {**valid_patch(), **extra}
            with self.subTest(extra=extra), patch.object(main, 'save_active_project_metrics') as fn:
                r = self.client.patch('/api/active-projects/24/metrics', json=payload)
                self.assertEqual(r.status_code, 422)
                fn.assert_not_called()

    def test_conflict_preserved(self):
        with patch.object(main, 'save_active_project_metrics', side_effect=DataAPIRequestRejected(409, 'project_metrics_revision_conflict')):
            r = self.client.patch('/api/active-projects/24/metrics', json=valid_patch())
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()['detail'], 'project_metrics_revision_conflict')


class ProjectMetricsClientTests(unittest.TestCase):
    def test_get_passes_actor_header_one_request(self):
        with patch.object(data_api, '_get_http_client') as client, patch.object(data_api, '_request_headers', return_value={'X-Riggs-User-EID':'2021'}) as headers:
            client.return_value.get.return_value = httpx.Response(200, json={'jobListId': 24, 'revision': 0})
            data_api.get_active_project_metrics(24, actor_eid=2021)
            client.return_value.get.assert_called_once()
            self.assertEqual(headers.call_args.kwargs['actor_eid'], 2021)

    def test_patch_passes_actor_header_one_request(self):
        with patch.object(data_api, '_get_http_client') as client, patch.object(data_api, '_request_headers', return_value={'X-Riggs-User-EID':'2021'}) as headers:
            client.return_value.request.return_value = httpx.Response(200, json={'jobListId': 24, 'revision': 1})
            data_api.save_active_project_metrics(24, valid_patch(), actor_eid=2021, request_id=str(uuid4()))
            client.return_value.request.assert_called_once()
            self.assertEqual(headers.call_args.kwargs['actor_eid'], 2021)
            self.assertEqual(client.return_value.request.call_args.args[0], 'PATCH')

    def test_get_conflict_not_misclassified_as_edge(self):
        with patch.object(data_api, '_get_http_client') as client, patch.object(data_api, '_request_headers', return_value={}):
            client.return_value.get.return_value = httpx.Response(403, json={'detail':'project_metrics_forbidden'})
            with self.assertRaises(DataAPIRequestRejected) as ctx:
                data_api.get_active_project_metrics(24, actor_eid=2021)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_default_off_signal_preserved_without_writes(self):
        with patch.object(data_api, '_get_http_client') as client, patch.object(data_api, '_request_headers', return_value={}):
            client.return_value.get.return_value = httpx.Response(503, json={'detail':'project_metrics_reads_disabled'})
            with self.assertRaises(DataAPIRequestRejected) as ctx:
                data_api.get_active_project_metrics(24, actor_eid=2021)
        self.assertEqual(ctx.exception.detail, 'project_metrics_reads_disabled')


if __name__ == '__main__':
    unittest.main()
