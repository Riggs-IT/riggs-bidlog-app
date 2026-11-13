import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSavedReadiness} from '../src/projectSetupServerReadiness.mjs';
const sid='00000000-0000-4000-8000-000000000001';
function response(){return {setupId:sid,revision:5,mappingVersion:'AP4F4F_51',basis:'SAVED_SQL_REVISION',
  readiness:'BLOCKED',fieldReviewIsAdvisory:true,fieldCount:51,rootCount:32,
  missingReviewFields:['gcLookupId'],fields:Array.from({length:50},(_,i)=>({path:`field${i}`,state:'PRESENT',collector:'OPS'})).concat(
    [{path:'gcLookupId',state:'MISSING',collector:'BID'}]),
  blockers:[{code:'SIGNED_AWARD_AMOUNT_NOT_ATTESTED',scope:'BUSINESS'}],readyForJis:false,
  form19CreateAuthorized:false,canSaveIncompleteDraft:true,externalWrites:0};}
test('accept exact saved revision and blocked readiness',()=>{
  assert.equal(validateSavedReadiness(response(),sid,5).readiness,'BLOCKED');
});
test('reject stale draft and changed setup ID',()=>{
  assert.throws(()=>validateSavedReadiness(response(),sid,6));
  assert.throws(()=>validateSavedReadiness(response(),'00000000-0000-4000-8000-000000000002',5));
});
test('reject fake Ready or false external-write claim',()=>{
  for (const [key,value] of [['readiness','READY'],['readyForJis',true],['form19CreateAuthorized',true],['externalWrites',1]]){
    const r=response();r[key]=value;assert.throws(()=>validateSavedReadiness(r,sid,5));
  }
});
test('reject duplicate, missing or unknown rows',()=>{
  const x=response();x.fields[50]=x.fields[0];assert.throws(()=>validateSavedReadiness(x,sid,5));
  const y=response();y.fields.pop();assert.throws(()=>validateSavedReadiness(y,sid,5));
});
test('reject invalid blocker types and fabricated missing labels',()=>{
  const x=response();x.blockers[0].scope='FOO';assert.throws(()=>validateSavedReadiness(x,sid,5));
  const y=response();y.missingReviewFields=['NO_SUCH_FIELD'];assert.throws(()=>validateSavedReadiness(y,sid,5));
});
