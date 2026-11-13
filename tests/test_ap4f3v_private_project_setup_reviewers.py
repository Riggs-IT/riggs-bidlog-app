"""AP4F3W: verified-session role gate, management read-only; no fabricated actor IDs."""
from dataclasses import replace
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app import main, data_api
from backend.app.auth import CurrentUser, get_current_user
from backend.app.project_setup_reviewers import can_review_project_setup, can_edit_project_setup

BASE = CurrentUser(eid=2021, it_user_id=7, display_name='Synthetic', app_role='ADMIN',
    employee_trade=None, can_edit_billing=False, billing_access_source=None,
    microsoft_username=None, entra_object_id='00000000-0000-4000-8000-000000000010',
    tenant_id='00000000-0000-4000-8000-000000000020')

class ReviewerTests(unittest.TestCase):
    def setUp(self):
        main.app.dependency_overrides[get_current_user] = lambda: BASE
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def set_user(self,eid,role='ADMIN'):
        main.app.dependency_overrides[get_current_user] = lambda: replace(BASE,eid=eid,app_role=role)

    def test_role_matrix(self):
        admin=BASE
        manager=replace(BASE,eid=176,app_role='MANAGEMENT_ADMIN')
        self.assertTrue(can_review_project_setup(admin))
        self.assertTrue(can_edit_project_setup(admin))
        self.assertTrue(can_review_project_setup(manager))
        self.assertFalse(can_edit_project_setup(manager))
        for bad in (replace(BASE,app_role='VIEWER'),replace(BASE,app_role='OPERATIONS'),
                    replace(BASE,eid=0),replace(BASE,eid=-4)):
            self.assertFalse(can_review_project_setup(bad))
            self.assertFalse(can_edit_project_setup(bad))

    def test_missing_actor_is_401_while_valid_unauthorized_user_is_403(self):
        # Prevent regressions of the existing AP4F route contract: mocked
        # missing actors must not be confused with authenticated VIEWER roles.
        for eid,role in ((0,'ADMIN'),(-4,'ADMIN'),(0,'MANAGEMENT_ADMIN')):
            self.set_user(eid,role)
            with self.subTest(eid=eid,role=role), \
                 patch.object(data_api,'get_project_setup_identity_directory') as identities, \
                 patch.object(data_api,'get_project_setup_award_context') as award:
                self.assertEqual(self.client.get('/api/project-setups/authoring/identities').status_code,401)
                self.assertEqual(self.client.get('/api/project-setups/authoring/awards/42').status_code,401)
                identities.assert_not_called();award.assert_not_called()
        for role in ('OPERATIONS','VIEWER'):
            self.set_user(111,role)
            with self.subTest(role=role), \
                 patch.object(data_api,'get_project_setup_identity_directory') as identities, \
                 patch.object(data_api,'get_project_setup_award_context') as award:
                self.assertEqual(self.client.get('/api/project-setups/authoring/identities').status_code,403)
                self.assertEqual(self.client.get('/api/project-setups/authoring/awards/42').status_code,403)
                identities.assert_not_called();award.assert_not_called()

    def test_read_directory_for_admin_and_management_only(self):
        for eid,role in ((2021,'ADMIN'),(176,'MANAGEMENT_ADMIN')):
            self.set_user(eid,role)
            with self.subTest(eid=eid,role=role), patch.object(data_api,'get_project_setup_identity_directory',return_value={'gcs':[]}) as reader:
                response=self.client.get('/api/project-setups/authoring/identities',headers={'X-Riggs-User-EID':'9001'})
                self.assertEqual(response.status_code,200)
                reader.assert_called_once_with(actor_eid=eid)

    def test_management_can_read_form206_but_cannot_read_award_context_or_write(self):
        self.set_user(176,'MANAGEMENT_ADMIN')
        with patch.object(data_api,'get_project_setup_form206_directory',return_value={'architects':[]}) as read, \
             patch.object(data_api,'get_project_setup_award_context') as award, \
             patch.object(data_api,'start_initial_project_setup') as start, \
             patch.object(data_api,'edit_project_setup_draft') as edit:
            self.assertEqual(self.client.get('/api/project-setups/authoring/form206').status_code,200)
            read.assert_called_once_with(actor_eid=176)
            self.assertEqual(self.client.get('/api/project-setups/authoring/awards/42').status_code,403)
            self.assertEqual(self.client.post('/api/project-setups/authoring/awards/42/start',json={}).status_code,403)
            self.assertEqual(self.client.patch('/api/project-setups/authoring/drafts/00000000-0000-4000-8000-000000000001/edits',json={}).status_code,403)
            award.assert_not_called();start.assert_not_called();edit.assert_not_called()

    def test_operations_and_viewer_denied_at_all_three_read_surfaces(self):
        for eid,role in ((111,'OPERATIONS'),(111,'VIEWER')):
            self.set_user(eid,role)
            with self.subTest(eid=eid), patch.object(data_api,'get_project_setup_identity_directory') as identities, \
                patch.object(main,'get_ops_project_setup_summary') as list_data, \
                patch.object(main,'get_project_setup_draft') as draft:
                self.assertEqual(self.client.get('/api/project-setups/authoring/identities').status_code,403)
                self.assertEqual(self.client.get('/api/project-setups/ops/awaiting-information').status_code,403)
                self.assertEqual(self.client.get('/api/project-setups/drafts/00000000-0000-4000-8000-000000000001').status_code,403)
                identities.assert_not_called();list_data.assert_not_called();draft.assert_not_called()

    def test_auth_me_flags_derived_from_server_identity(self):
        for eid,role,can_view,can_edit in ((2021,'ADMIN',True,True),
            (176,'MANAGEMENT_ADMIN',True,False),(999,'OPERATIONS',False,False),
            (999,'VIEWER',False,False)):
            self.set_user(eid,role)
            with self.subTest(eid=eid,role=role):
                result=self.client.get('/api/auth/me')
                self.assertEqual(result.status_code,200)
                self.assertIs(result.json()['canReviewProjectSetup'],can_view)
                self.assertIs(result.json()['canEditProjectSetup'],can_edit)
                self.assertNotIn('reviewerEids',result.json())
