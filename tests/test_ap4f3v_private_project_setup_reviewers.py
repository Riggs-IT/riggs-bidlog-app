"""AP4F3V reviewer isolation: guard actual FastAPI routes, not navigation alone."""
from dataclasses import replace
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app import main, project_setup_authoring, data_api
from backend.app.auth import CurrentUser, get_current_user
from backend.app.project_setup_reviewers import can_review_project_setup

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

    def set_user(self, eid, role='ADMIN'):
        main.app.dependency_overrides[get_current_user] = lambda: replace(BASE, eid=eid, app_role=role)

    def test_exact_two_admin_reviewer_ids(self):
        self.assertTrue(can_review_project_setup(BASE))
        self.assertTrue(can_review_project_setup(replace(BASE, eid=176)))
        for user in (replace(BASE,eid=999),replace(BASE,eid=0),
                     replace(BASE,eid=176,app_role='OPERATIONS'),
                     replace(BASE,eid=2021,app_role='MANAGEMENT_ADMIN')):
            self.assertFalse(can_review_project_setup(user))

    def test_authorized_both_get_directory(self):
        for eid in (2021,176):
            self.set_user(eid)
            with self.subTest(eid=eid), patch.object(data_api,'get_project_setup_identity_directory',return_value={'gcs':[]}) as reader:
                response=self.client.get('/api/project-setups/authoring/identities')
                self.assertEqual(response.status_code,200)
                reader.assert_called_once_with(actor_eid=eid)

    def test_nonreviewer_cannot_read_or_write_or_list(self):
        for eid,role in ((999,'ADMIN'),(176,'OPERATIONS'),(999,'OPERATIONS'),(2021,'VIEWER')):
            self.set_user(eid,role)
            with self.subTest(eid=eid,role=role), \
                patch.object(data_api,'get_project_setup_identity_directory') as directory, \
                patch.object(data_api,'edit_project_setup_draft') as edit, \
                patch.object(main,'get_ops_project_setup_summary') as summary, \
                patch.object(main,'get_project_setup_draft') as draft:
                self.assertEqual(self.client.get('/api/project-setups/authoring/identities').status_code,403)
                self.assertEqual(self.client.get('/api/project-setups/ops/awaiting-information').status_code,403)
                self.assertEqual(self.client.get('/api/project-setups/drafts/00000000-0000-4000-8000-000000000001').status_code,403)
                self.assertEqual(self.client.patch('/api/project-setups/authoring/drafts/00000000-0000-4000-8000-000000000001/edits',
                    headers={'X-Riggs-Setup-Write':'1','Origin':'https://example.test'},
                    json={'operationId':'00000000-0000-4000-8000-000000000002','expectedRevision':1,'changes':{'comments':'Synthetic'}}).status_code,403)
                directory.assert_not_called();edit.assert_not_called();summary.assert_not_called();draft.assert_not_called()

    def test_auth_me_exposes_boolean_only(self):
        for eid,role,expected in ((2021,'ADMIN',True),(176,'ADMIN',True),(999,'ADMIN',False),(176,'OPERATIONS',False)):
            self.set_user(eid,role)
            # auth_me uses a real Request session for the owner admin capability; only the project capability is asserted.
            response=self.client.get('/api/auth/me')
            self.assertEqual(response.status_code,200)
            self.assertIs(response.json()['canReviewProjectSetup'], expected)
            self.assertNotIn('reviewerEids',response.json())
