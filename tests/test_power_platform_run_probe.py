"""UX5: selected-flow resource-ID run canary is read-only and fail-closed."""
import json
import unittest

import httpx

from backend.app.power_automate_monitoring import PowerPlatformReadClient

TOKEN = 'synthetic-token-for-offline-tests-NO-SECRETS'
ENV = 'Default-11111111-1111-4111-8111-111111111111'
RESOURCE = '22222222-2222-4222-8222-222222222222'
WORKFLOW = '33333333-3333-4333-8333-333333333333'

def reader_for(responder):
    return PowerPlatformReadClient(
        delegated_access_token=TOKEN,
        client=httpx.Client(transport=httpx.MockTransport(responder)))


def tenant_response(workflow_id=None, env=ENV, resource=RESOURCE):
    props = {'environmentId': env}
    if workflow_id is not None:
        props['workflowEntityId'] = workflow_id
    return httpx.Response(200, json={'data': [{
        'type': 'microsoft.powerautomate/cloudflows',
        'name': resource, 'properties': props,
    }]})


class ResourceProbeTests(unittest.TestCase):
    def test_absent_entity_id_probes_exact_resource_and_accepts_only_explicitly_matched_runs(self):
        calls=[]
        def response(req):
            calls.append((req.method, req.url.path, req.url.params.get('workflowId')))
            self.assertEqual(req.url.host, 'api.powerplatform.com')
            self.assertTrue(req.headers['Authorization'].startswith('Bearer '))
            if req.url.path.endswith('/cloudFlows'):
                return httpx.Response(204)
            if req.method == 'POST':
                body=json.loads(req.content)
                self.assertEqual(body['Clauses'][1]['Values'], [f"'{RESOURCE}'"])
                self.assertEqual(body['Options']['Top'], 4)
                return tenant_response()
            self.assertEqual(req.url.params.get('workflowId'), RESOURCE)
            return httpx.Response(200, json={'value': [
                {'flowRunId': 'failed-run', 'workflowId': RESOURCE,
                 'status': 'Failed', 'startTime': '2026-10-26T19:15:00Z',
                 'inputs': {'secret': 'MUST_NOT_LEAK'}},
                {'flowRunId': 'success-run', 'workflowId': RESOURCE,
                 'status': 'Succeeded', 'startTime': '2026-10-26T18:00:00Z',
                 'endTime': '2026-10-26T18:01:00Z'},
            ]})
        result=reader_for(response).inspect_flow(ENV, RESOURCE)
        self.assertEqual([x[0] for x in calls], ['GET', 'POST', 'GET'])
        self.assertEqual(result['runIdentitySource'], 'RESOURCE_RUN_RESPONSE_MATCH')
        self.assertEqual(result['runHistory']['availability'], 'AVAILABLE')
        self.assertEqual(result['runHistory']['runs'][0]['status'], 'FAILED')
        self.assertEqual(result['runHistory']['runs'][0]['runId'], 'failed-run')
        self.assertEqual(result['runHistory']['lastSuccessInReturnedSampleUTC'], '2026-10-26T18:01:00Z')
        self.assertNotIn('MUST_NOT_LEAK', str(result))
        self.assertNotIn(TOKEN, str(result))

    def test_no_runs_returned_does_not_verify_identity(self):
        calls=[]
        def response(req):
            calls.append(req.method)
            if req.url.path.endswith('/cloudFlows'): return httpx.Response(204)
            if req.method == 'POST': return tenant_response()
            return httpx.Response(204)
        result=reader_for(response).inspect_flow(ENV, RESOURCE)
        self.assertEqual(calls, ['GET', 'POST', 'GET'])
        self.assertEqual(result['runIdentitySource'], 'NOT_VERIFIED')
        self.assertEqual(result['runHistory']['availability'], 'IDENTITY_NOT_VERIFIED')
        self.assertEqual(result['runHistory']['reasonCode'], 'RESOURCE_ID_PROBE_EMPTY')
        self.assertEqual(result['runHistory']['identityLookupReason'], 'WORKFLOW_ENTITY_ID_MISSING')

    def test_mismatched_or_missing_workflow_id_does_not_prove_any_run(self):
        def response(req):
            if req.url.path.endswith('/cloudFlows'): return httpx.Response(204)
            if req.method == 'POST': return tenant_response()
            return httpx.Response(200, json={'value': [
                {'runId':'mismatch', 'workflowId':WORKFLOW, 'status':'Succeeded'},
                {'runId':'no-workflow-id', 'status':'Succeeded'},
            ]})
        result=reader_for(response).inspect_flow(ENV, RESOURCE)
        self.assertEqual(result['runIdentitySource'], 'NOT_VERIFIED')
        self.assertEqual(result['runHistory']['reasonCode'], 'RESOURCE_ID_RUN_MISMATCH_OR_MISSING')
        self.assertFalse(result['runHistory']['runs'])

    def test_mixed_provider_rows_only_keep_verified_and_report_partial(self):
        def response(req):
            if req.url.path.endswith('/cloudFlows'): return httpx.Response(204)
            if req.method == 'POST': return tenant_response()
            return httpx.Response(200, json={'value': [
                {'runId':'wrong', 'workflowId':WORKFLOW,'status':'Succeeded'},
                {'runId':'correct', 'workflowId':RESOURCE,'status':'Failed',
                 'startTime':'2026-10-26T10:00:00Z'},
            ]})
        result=reader_for(response).inspect_flow(ENV, RESOURCE)
        self.assertEqual(result['runIdentitySource'], 'RESOURCE_RUN_RESPONSE_MATCH')
        self.assertEqual(result['runHistory']['availability'], 'PARTIAL')
        self.assertEqual(len(result['runHistory']['runs']), 1)
        self.assertEqual(result['runHistory']['runs'][0]['runId'], 'correct')
        self.assertEqual(result['runHistory']['invalidRows'], 1)

    def test_exact_entity_id_uses_supported_identity_and_skips_probe(self):
        calls=[]
        def response(req):
            calls.append((req.method, req.url.params.get('workflowId')))
            if req.url.path.endswith('/cloudFlows'): return httpx.Response(204)
            if req.method == 'POST': return tenant_response(WORKFLOW)
            self.assertEqual(req.url.params.get('workflowId'), WORKFLOW)
            return httpx.Response(200, json={'value': [
                {'runId':'good','workflowId':WORKFLOW,'status':'Succeeded',
                 'startTime':'2026-10-26T11:00:00Z'}]})
        result=reader_for(response).inspect_flow(ENV,RESOURCE)
        self.assertEqual(len(calls), 3)
        self.assertEqual(result['runIdentitySource'], 'TENANT_WORKFLOW_ENTITY_ID')
        self.assertEqual(result['runHistory']['runs'][0]['runId'], 'good')

    def test_different_environment_mapping_prevents_probe(self):
        calls=[]
        def response(req):
            calls.append(req.method)
            if req.method == 'POST': return tenant_response(None, 'Default-other-tenant')
            return httpx.Response(204)
        result=reader_for(response).inspect_flow(ENV,RESOURCE)
        self.assertEqual(calls,['GET','POST'])
        self.assertEqual(result['runHistory']['reasonCode'],'RESOURCE_MISMATCH')

    def test_tenant_invalid_or_ambiguous_identity_prevents_probe(self):
        for rows in (
            [ {'type': 'microsoft.powerautomate/cloudflows', 'name': RESOURCE,
               'properties': {'environmentId': ENV, 'workflowEntityId': 'INVALID'}}],
            [ {'type': 'microsoft.powerautomate/cloudflows', 'name': RESOURCE,
               'properties': {'environmentId': ENV}},
              {'type': 'microsoft.powerautomate/cloudflows', 'name': RESOURCE,
               'properties': {'environmentId': ENV}}],
        ):
            calls=[]
            def response(req):
                calls.append(req.method)
                if req.method == 'POST': return httpx.Response(200, json={'data':rows})
                return httpx.Response(204)
            result=reader_for(response).inspect_flow(ENV,RESOURCE)
            self.assertEqual(calls, ['GET','POST'])
            self.assertEqual(result['runIdentitySource'], 'NOT_VERIFIED')

    def test_tenant_empty_query_can_probe_but_empty_result_remains_unknown(self):
        calls=[]
        def response(req):
            calls.append(req.method)
            if req.method == 'POST': return httpx.Response(200, json={'data':[]})
            return httpx.Response(204)
        result=reader_for(response).inspect_flow(ENV,RESOURCE)
        self.assertEqual(calls,['GET','POST','GET'])
        self.assertEqual(result['runHistory']['identityLookupReason'], 'RESOURCE_NOT_RETURNED')
        self.assertEqual(result['runHistory']['availability'], 'IDENTITY_NOT_VERIFIED')

    def test_provider_error_or_denial_does_not_become_empty_success(self):
        for status in (403, 429, 404):
            def response(req):
                if req.url.path.endswith('/cloudFlows'): return httpx.Response(204)
                if req.method == 'POST': return tenant_response()
                return httpx.Response(status, json={'private':'CREDENTIAL_NEVER_OUTPUT'})
            result=reader_for(response).inspect_flow(ENV,RESOURCE)
            self.assertEqual(result['runHistory']['availability'], 'IDENTITY_NOT_VERIFIED')
            self.assertIn(result['runHistory']['reasonCode'],
                          ('ACCESS_DENIED','THROTTLED','NO_DATAVERSE_OR_NOT_FOUND'))
            self.assertNotIn('CREDENTIAL_NEVER_OUTPUT',str(result))


if __name__ == '__main__': unittest.main()
