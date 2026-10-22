"""Completed originating bid is read-only for viewers and a guarded action for admins."""
from dataclasses import replace
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app import main, data_api
from backend.app.auth import CurrentUser, get_current_user

ADMIN = CurrentUser(
    eid=2021, it_user_id=1, display_name='Test Admin',
    app_role='ADMIN', employee_trade='PM', can_edit_billing=True,
    billing_access_source='TEST', microsoft_username=None,
    entra_object_id='00000000-0000-0000-0000-000000000001', tenant_id='test',
)
VIEWER = replace(ADMIN, app_role='VIEWER', can_edit_billing=False)
NO_COMPLETED_VIEW = replace(ADMIN, app_role='OPERATIONS', employee_trade='FIELD', can_edit_billing=False)
ROUTE = '/api/completed-projects/446/originating-bid'
CANDIDATES = '/api/completed-projects/446/bid-candidates'
BID = {
    'jobListId': 446, 'jobNumber': '25517', 'jobName': 'Nexus Commerce Center',
    'linked': True, 'bid': {'originalBidLogId': 7, 'bidStatus': 'Awarded'},
}

class CompletedBidLinkProxyTests(unittest.TestCase):
    def setUp(self):
        main.app.dependency_overrides[get_current_user] = lambda: ADMIN
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def test_admin_and_viewer_can_read_linked_bid(self):
        for role in (ADMIN, VIEWER):
            main.app.dependency_overrides[get_current_user] = lambda role=role: role
            with patch.object(main, 'get_completed_project_originating_bid', return_value=BID) as read:
                response = self.client.get(ROUTE)
            self.assertEqual(response.status_code, 200, response.text)
            read.assert_called_once_with(446)
            self.assertEqual(response.json()['bid']['originalBidLogId'], 7)

    def test_outside_completed_workspace_cannot_read(self):
        main.app.dependency_overrides[get_current_user] = lambda: NO_COMPLETED_VIEW
        with patch.object(main, 'get_completed_project_originating_bid') as read:
            response = self.client.get(ROUTE)
        self.assertEqual(response.status_code, 403)
        read.assert_not_called()

    def test_viewer_cannot_get_candidates_or_post_bid_link(self):
        main.app.dependency_overrides[get_current_user] = lambda: VIEWER
        with (patch.object(main, 'get_completed_project_bid_candidates') as candidates,
              patch.object(main, 'link_completed_project_originating_bid') as write):
            found = self.client.get(CANDIDATES)
            saved = self.client.post(ROUTE, json={'originalBidLogId': 7})
        self.assertEqual(found.status_code, 403)
        self.assertEqual(saved.status_code, 403)
        candidates.assert_not_called()
        write.assert_not_called()

    def test_approved_admin_post_uses_session_actor_not_browser_actor(self):
        with patch.object(main, 'link_completed_project_originating_bid', return_value={'resultAction': 'LINKED', **BID}) as write:
            result = self.client.post(ROUTE, json={'originalBidLogId': 7}, headers={'X-Riggs-User-EID': '99999'})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(write.call_args.args, (446, 7))
        self.assertEqual(write.call_args.kwargs['actor_eid'], 2021)
        self.assertTrue(write.call_args.kwargs['request_id'])

    def test_invalid_body_never_calls_writer(self):
        with patch.object(main, 'link_completed_project_originating_bid') as write:
            for bad in ({'originalBidLogId': True}, {'originalBidLogId': 7, 'actorEid': 1},
                        {'originalBidLogId': 0}, {'originalBidLogId': '7'}, [], None):
                with self.subTest(body=bad):
                    self.assertEqual(self.client.post(ROUTE, json=bad).status_code, 400)
        write.assert_not_called()

    def test_bff_client_invalidates_completed_cache_after_acknowledged_write(self):
        with (patch.object(data_api, '_originating_bid_request', return_value={'resultAction': 'LINKED', **BID}) as request,
              patch.object(data_api, '_dashboard_cache_invalidate_key') as invalidate):
            data_api.link_completed_project_originating_bid(446, 7, actor_eid=2021, request_id='test-req')
        self.assertEqual(request.call_args.args[0], 'POST')
        self.assertEqual(request.call_args.kwargs['actor_eid'], 2021)
        self.assertEqual(request.call_args.kwargs['json_payload'], {'originalBidLogId': 7})
        invalidate.assert_called_once_with('completed_projects')

if __name__ == '__main__':
    unittest.main()
