"""Static defense-in-depth: preview users never acquire an application writer."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class PreviewSourceTests(unittest.TestCase):
    def test_bff_routes_get_vs_post(self):
        b=(ROOT/'backend/app/project_setup_authoring.py').read_text()
        self.assertIn('def _reader(',b)
        self.assertIn('def _admin(',b)
        self.assertIn('Depends(_reader)',b)
        self.assertIn('current_user: CurrentUser = Depends(_admin)',b)
        self.assertIn('def start_initial(',b)
        self.assertIn('def edit_draft(',b)
        self.assertIn('def award_context(',b) # status transition may reconcile, remains ADMIN-only
    def test_sql_ownership_not_reimplemented_in_browser(self):
        editor=(ROOT/'frontend/src/ProjectSetupEditor.jsx').read_text()
        self.assertIn('if (!author && !selection?.setupId)',editor)
        self.assertIn('if (saving.current || busy || !record || !author || conflict) return',editor)
        self.assertIn('record && author &&',editor)
        self.assertIn('UNDER DEVELOPMENT · VIEW ONLY',editor)
        self.assertIn('disabled={busy||uncertain||conflict||!inspector}',editor)
        src=(ROOT/'backend/app/project_setup_reviewers.py').read_text()
        self.assertIn('MANAGEMENT_ADMIN',src)
        self.assertIn('== "ADMIN"',src)
