"""AP4F3S: strict but backward-compatible Form206 contact directory BFF."""
import unittest
from unittest.mock import patch
from backend.app import data_api


def response(architects=None, engineers=None):
    return {
        'source': 'RIGGSDATAHUB_FORM206_MIRROR',
        'persistence': 'SQL_DRAFT_ONLY',
        'externalState': 'NOT_CONNECTED',
        'selectionVerification': 'COGNITO_REST_ON_DRAFT_SAVE',
        'externalWrites': 0,
        'architects': architects if architects is not None else [{'id':'206-12','label':'Architect'}],
        'engineers': engineers if engineers is not None else [{'id':'206-13','label':'Engineer'}],
    }


class Form206DirectoryCompatibilityTests(unittest.TestCase):
    def read(self, value):
        with patch.object(data_api, '_project_setup_authoring_request', return_value=value):
            return data_api.get_project_setup_form206_directory(actor_eid=2021)

    def test_legacy_two_field_directory_remains_accepted(self):
        old=response()
        self.assertEqual(self.read(old),old)

    def test_new_metadata_read_is_accepted_with_nones(self):
        newer=response(
            architects=[{'id':'206-12','label':'Architect','email':'example@example.test','address':'Phoenix, AZ'}],
            engineers=[{'id':'206-13','label':'Engineer','email':None,'address':None}],
        )
        self.assertEqual(self.read(newer),newer)

    def test_rejects_unknown_keys_wrong_types_too_long_and_wrong_id_family(self):
        good={'id':'206-12','label':'Architect','email':None,'address':None}
        bad=[
            {**good,'credential':'not-allowed'},
            {**good,'email':['not','text']},
            {**good,'address':{'not':'text'}},
            {**good,'email':'a'*321},
            {**good,'address':'a'*2001},
            {**good,'id':'140-12'},
            {**good,'label':' '},
            {'id':'206-12','email':None},
        ]
        for entry in bad:
            with self.subTest(entry=list(entry)):
                with self.assertRaises(data_api.DataAPIInvalidResponse):
                    self.read(response(architects=[entry]))

    def test_rejects_duplicate_across_categories(self):
        with self.assertRaises(data_api.DataAPIInvalidResponse):
            self.read(response(engineers=[{'id':'206-12','label':'Engineer'}]))


if __name__ == '__main__':
    unittest.main()
