import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unifiedFlowInventoryEvidence} from '../src/administrationPowerAutomateEvidence.mjs';
const ui = readFileSync(new URL('../src/AdministrationPowerAutomate.jsx', import.meta.url),'utf8');
const status = {availability:'UNVERIFIED_EMPTY',coverage:'BOUNDED_ACCESSIBLE_ENVIRONMENTS_ONLY',
  flows:[],environments:[],hasMore:false,coverageComplete:false};

test('provider zero is not verified zero company flows',()=>{
  const result=unifiedFlowInventoryEvidence(status);
  assert.equal(result.count,null);
  assert.match(result.message,/does not verify/);
});
test('merged inventory displays origin environment',()=>{
  const result=unifiedFlowInventoryEvidence({...status,availability:'AVAILABLE', flows:[{
    workflowId:'12345678-1234-4234-8234-123456789012',environmentId:'Default-demo',
    environmentName:'Riggs default',name:'Import',platformState:'UNKNOWN',
    lastRunState:'NOT_COLLECTED',modifiedAtUTC:null,
  }]});
  assert.equal(result.count,1);
  assert.equal(result.flows[0].environmentName,'Riggs default');
});
test('no environment picker, passive joined load, owner API only',()=>{
  assert.match(ui,/readJson\('\/inventory', \{signal: controller.signal\}\)/);
  assert.doesNotMatch(ui,/Choose an environment|List accessible environments|Load flows/);
  assert.match(ui,/Checked failures &amp; recent runs/);
  assert.match(ui, /<option value="MODIFIED">Last modified<\/option>/);
  assert.match(ui, /const \[sortBy, setSortBy\] = useState\('RUNS'\)/);
  assert.doesNotMatch(ui,/resubmitRun|restartFlow|deleteFlow/);
});
