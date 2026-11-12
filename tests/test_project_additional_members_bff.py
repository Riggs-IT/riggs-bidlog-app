"""No provider access. Authenticated BFF wrapper contract tests."""
from __future__ import annotations
from unittest import TestCase
from unittest.mock import patch
import httpx
from fastapi import HTTPException

from backend.app.project_additional_members import _bridge, ReplaceMembers


class MockClient:
    def __init__(self, response):
        self.response = response
        self.calls = []
    def request(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.response


def response(code, body):
    return httpx.Response(code, json=body, request=httpx.Request('GET', 'https://example.invalid'))


class TestBff(TestCase):
    def test_get_uses_trusted_actor_only(self):
        value = dict(jobListId=561, rosterRevision=0, members=[], directory=[], timeline=[],
                     deliveryState='READY', persistence='SQL_ROSTER_ONLY', externalWrites=0)
        client = MockClient(response(200, value))
        with patch('backend.app.project_additional_members.data_api._get_http_client', return_value=client), \
             patch('backend.app.project_additional_members.data_api._request_headers', return_value={'X-Test': 'safe'}) as heads:
            result = _bridge('GET', 561, 2021)
        self.assertEqual(result['rosterRevision'], 0)
        self.assertEqual(client.calls[0][0], ('GET', '/v1/jobs/561/additional-members'))
        self.assertEqual(heads.call_args.kwargs['actor_eid'], 2021)
        self.assertTrue(heads.call_args.kwargs['include_service_auth'])
        self.assertIsNone(client.calls[0][1]['json'])

    def test_put_response_identity_checked(self):
        body = dict(operationId='99999999-aaaa-4bbb-8ccc-123456789012',
                    expectedRevision=0, memberITUserIds=[11])
        reply = dict(jobListId=561, operationId=body['operationId'], rosterRevision=1,
                     resultAction='UPDATED', persistence='SQL_ROSTER_ONLY', externalWrites=0)
        client = MockClient(response(200, reply))
        with patch('backend.app.project_additional_members.data_api._get_http_client', return_value=client), \
             patch('backend.app.project_additional_members.data_api._request_headers', return_value={}):
            self.assertEqual(_bridge('PUT', 561, 2021, body)['rosterRevision'], 1)
        self.assertEqual(client.calls[0][1]['json'], body)

    def test_rejects_unrecognized_upstream_detail(self):
        client = MockClient(response(409, {'detail':'raw_sql_exception_with_private_data'}))
        with patch('backend.app.project_additional_members.data_api._get_http_client', return_value=client), \
             patch('backend.app.project_additional_members.data_api._request_headers', return_value={}):
            with self.assertRaises(HTTPException) as caught:
                _bridge('PUT', 561, 2021, {})
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.detail, 'project_additional_members_unavailable')

    def test_known_revision_conflict(self):
        client = MockClient(response(409, {'detail':'project_additional_members_revision_conflict'}))
        with patch('backend.app.project_additional_members.data_api._get_http_client', return_value=client), \
             patch('backend.app.project_additional_members.data_api._request_headers', return_value={}):
            with self.assertRaises(HTTPException) as caught:
                _bridge('PUT', 561, 2021, {})
        self.assertEqual(caught.exception.status_code, 409)

    def test_response_mismatch_refused(self):
        client = MockClient(response(200, dict(jobListId=100,
                     persistence='SQL_ROSTER_ONLY', externalWrites=0)))
        with patch('backend.app.project_additional_members.data_api._get_http_client', return_value=client), \
             patch('backend.app.project_additional_members.data_api._request_headers', return_value={}):
            with self.assertRaises(HTTPException) as caught:
                _bridge('GET', 561, 2021)
        self.assertEqual(caught.exception.status_code, 502)

    def test_strict_schema(self):
        from pydantic import ValidationError
        base = dict(operationId='99999999-aaaa-4bbb-8ccc-123456789012',
                    expectedRevision=0, memberITUserIds=[11])
        self.assertEqual(ReplaceMembers.model_validate(base).memberITUserIds, [11])
        for updates in ({'expectedRevision': '0'}, {'memberITUserIds': ['11']},
                        {'memberITUserIds': [11,11]}, {'actorEid': 9999}):
            with self.subTest(updates=updates), self.assertRaises(ValidationError):
                ReplaceMembers.model_validate({**base, **updates})


class TestBffHttp(TestCase):
    def setUp(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from backend.app import project_additional_members as routes
        from backend.app.auth import get_current_user
        from types import SimpleNamespace
        self.routes = routes
        self.get_current_user = get_current_user
        self.app = FastAPI()
        self.app.include_router(routes.router)
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(app_role='ADMIN', eid=2021)
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def test_admin_get_uses_session_identity(self):
        data = dict(jobListId=561, rosterRevision=0, persistence='SQL_ROSTER_ONLY')
        with patch.object(self.routes, '_bridge', return_value=data) as bridge:
            response = self.client.get('/api/active-projects/561/additional-members',
                                       headers={'X-Riggs-User-EID': '123456789'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(bridge.call_args.args, ('GET', 561, 2021))
        self.assertIn('no-store', response.headers['cache-control'])

    def test_nonadmin_get_and_put_denied(self):
        from types import SimpleNamespace
        self.app.dependency_overrides[self.get_current_user] = lambda: SimpleNamespace(app_role='VIEWER', eid=2021)
        payload = dict(operationId='99999999-aaaa-4bbb-8ccc-123456789012',
                       expectedRevision=0, memberITUserIds=[11])
        with patch.object(self.routes, '_bridge') as bridge:
            self.assertEqual(self.client.get('/api/active-projects/561/additional-members').status_code, 403)
            self.assertEqual(self.client.put('/api/active-projects/561/additional-members',
                         headers={'X-Riggs-Setup-Write': '1'}, json=payload).status_code, 403)
        bridge.assert_not_called()

    def test_write_rejects_missing_origin_protection_header(self):
        body = dict(operationId='99999999-aaaa-4bbb-8ccc-123456789012',
                    expectedRevision=0, memberITUserIds=[11])
        with patch.object(self.routes, '_bridge') as bridge:
            response = self.client.put('/api/active-projects/561/additional-members', json=body)
        self.assertEqual(response.status_code, 403)
        bridge.assert_not_called()

    def test_cross_site_fetch_is_rejected(self):
        body = dict(operationId='99999999-aaaa-4bbb-8ccc-123456789012',
                    expectedRevision=0, memberITUserIds=[11])
        with patch.object(self.routes, '_bridge') as bridge:
            response = self.client.put('/api/active-projects/561/additional-members', json=body,
                         headers={'X-Riggs-Setup-Write':'1','Sec-Fetch-Site':'cross-site'})
        self.assertEqual(response.status_code, 403)
        bridge.assert_not_called()

    def test_admin_put_passes_only_session_actor_and_body(self):
        body = dict(operationId='99999999-aaaa-4bbb-8ccc-123456789012',
                    expectedRevision=0, memberITUserIds=[11])
        with patch.object(self.routes, '_bridge', return_value=dict(jobListId=561)) as bridge:
            result = self.client.put('/api/active-projects/561/additional-members', json=body,
                                     headers={'X-Riggs-Setup-Write': '1', 'X-Riggs-User-EID': '999999'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(bridge.call_args.args, ('PUT', 561, 2021, body))
