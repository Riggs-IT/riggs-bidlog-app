import test from 'node:test';
import assert from 'node:assert/strict';
import { generalDraft, generalChanges, validateGeneralChanges, generalErrorMessage } from '../src/activeProjectGeneral.js';
const baseline = () => ({ scope: '  Keep spaces  ', leed: false, ndaRequired: null, numberOfBuildings: 2,
  buildingNames: [{ id: 'row-1', name: null }] });
test('unchanged values create no patch', () => assert.deepEqual(generalChanges(baseline(), generalDraft(baseline())), {}));
test('scope is the only changed field', () => { const d=generalDraft(baseline());d.scope='Updated';assert.deepEqual(generalChanges(baseline(),d),{scope:'Updated'}); });
test('clearing scope sends null', () => { const d=generalDraft(baseline());d.scope='';assert.deepEqual(generalChanges(baseline(),d),{scope:null}); });
test('boolean strings become real booleans', () => { const d=generalDraft(baseline());d.leed='true';d.ndaRequired='false';assert.deepEqual(generalChanges(baseline(),d),{leed:true,ndaRequired:false}); });
test('new row has null ID; existing null name stays null', () => { const d=generalDraft(baseline());d.buildingNames.push({id:null,name:'B'});assert.deepEqual(generalChanges(baseline(),d),{buildingNames:[{id:'row-1',name:null},{id:null,name:'B'}]}); });
test('deletion explicitly sends empty array', () => { const d=generalDraft(baseline());d.buildingNames=[];assert.deepEqual(generalChanges(baseline(),d),{buildingNames:[]}); });
test('fractional count rejected', () => { const d=generalDraft(baseline());d.numberOfBuildings='1.5';assert.ok(validateGeneralChanges(baseline(),d)); });
test('rows cannot exceed count', () => { const d=generalDraft(baseline());d.numberOfBuildings='1';d.buildingNames.push({id:null,name:'B'});assert.ok(validateGeneralChanges(baseline(),d)); });
test('unchanged unknown boolean allowed during scope edit', () => { const d=generalDraft(baseline());d.scope='Updated';assert.equal(validateGeneralChanges(baseline(),d),null); });
test('changing boolean to unknown rejected', () => { const d=generalDraft(baseline());d.leed='';assert.ok(validateGeneralChanges(baseline(),d)); });
test('nonboolean text not accepted', () => { const d=generalDraft(baseline());d.leed='anything';assert.ok(validateGeneralChanges(baseline(),d)); });
test('scope cap checked', () => { const d=generalDraft(baseline());d.scope='x'.repeat(20001);assert.ok(validateGeneralChanges(baseline(),d)); });
test('structured error message shown', () => assert.equal(generalErrorMessage({code:'conflict',message:'Reload this entry.'}),'Reload this entry.'));
test('validation arrays do not become React objects', () => assert.equal(typeof generalErrorMessage([{msg:'wrong',input:'not shown'}]),'string'));
