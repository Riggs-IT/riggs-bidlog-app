"""No-provider read-only Stage4 Bid Log deadline wiring contracts."""
from pathlib import Path
import ast
import unittest
ROOT=Path(__file__).resolve().parents[1]

class DeadlineStage4Wiring(unittest.TestCase):
    def test_backend_auth_and_owner_write(self):
        main=(ROOT/'backend/app/main.py').read_text()
        auth=(ROOT/'backend/app/auth.py').read_text()
        api=(ROOT/'backend/app/data_api.py').read_text()
        ast.parse(main);ast.parse(auth);ast.parse(api)
        self.assertIn("@app.post('/api/admin/pm-forecast-deadline')",main)
        self.assertIn('current_user.eid != 2021',main)
        self.assertIn('_admin_mutation_origin(request)',main)
        self.assertIn('require_administration_owner',main)
        self.assertIn('X-Riggs-Actor-Entra-OID',api)
        self.assertIn('request_id=_browser_request_id(request)',main)
        self.assertIn('"/api/admin/pm-forecast-deadline"',auth)
    def test_source_labels_and_shared_dashboard(self):
        app=(ROOT/'frontend/src/AdministrationDashboard.jsx').read_text()
        admin=(ROOT/'frontend/src/AdministrationForecastDeadline.jsx').read_text()
        forecast=(ROOT/'frontend/src/PMForecastPanel.jsx').read_text()
        self.assertIn('<AdministrationForecastDeadline',app)
        self.assertIn('Normal deadline: end of the 20th',admin)
        self.assertIn('canOpenException',admin)
        self.assertIn('Reopen exception',admin)
        self.assertIn('attributionSource',admin)
        self.assertIn('EDITABLE_EXCEPTION',forecast)

if __name__=='__main__':unittest.main()
