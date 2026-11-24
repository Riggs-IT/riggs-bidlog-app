import test from 'node:test';
import assert from 'node:assert/strict';
import {PILOT_STAFFING_SETUP as sid,staffingPath,validateStaffing,staffingCommand,validateStaffingReceipt,verifyStaffingReadback,saveStaffing} from '../src/setupStaffing.mjs';
import {commitmentRows,availabilitySummary,validateAvailability} from '../src/fieldTeamAvailability.mjs';
const op='11111111-2222-4333-8444-555555555555';
const plan={scheduleId:113,employeeEid:7,employeeName:'Synthetic leader',resourceRole:'SUPER',effectiveStartDate:'2027-02-03',effectiveEndDate:'2027-10-03',status:'PLANNED',eligible:true};
const initial={setupId:sid,revision:0,canEdit:true,plans:[]};
const saved={...initial,revision:1,plans:[plan]};
const args={snapshot:initial,resourceRole:'SUPER',employeeEid:7,startDate:'2027-02-03',endDate:'2027-10-03',operationId:op};
const receipt={setupId:sid,operationId:op,revision:1,scheduleId:113,replayed:false};
const pending={jobListId:null,setupId:sid,jobNumber:'',jobName:'Synthetic setup',resourceRole:'SUPER',scheduleId:113,effectiveStartDate:plan.effectiveStartDate,effectiveEndDate:plan.effectiveEndDate,status:'PLANNED'};
test('exact pilot and valid revisions; fail closed on malformed plans',()=>{
 assert.equal(staffingPath(sid),`/api/project-setups/jis/${sid}/field-team/plans`);assert.throws(()=>staffingPath('24'));
 assert.equal(validateStaffing(initial,sid),initial);assert.equal(validateStaffing(saved,sid),saved);
 for(const v of [{...saved,revision:-1},{...saved,canEdit:'true'},{...saved,plans:[plan,plan]},{...saved,plans:[plan,{...plan,scheduleId:114,employeeEid:9}]},{...saved,plans:[{...plan,effectiveEndDate:null}]}])assert.throws(()=>validateStaffing(v,sid));
});
test('explicit ADD EDIT REMOVE, independent dates, no duplicate SUPER or FOREMAN',()=>{
 const add=staffingCommand(args);assert.deepEqual(add,{operationId:op,expectedRevision:0,resourceRole:'SUPER',action:'ADD',employeeEid:7,startDate:args.startDate,endDate:args.endDate});
 const edit=staffingCommand({...args,snapshot:saved,plan,employeeEid:8});assert.equal(edit.action,'EDIT');assert.equal(edit.scheduleId,113);assert.equal(edit.expectedRevision,1);
 assert.deepEqual(staffingCommand({...args,snapshot:saved,plan,remove:true}),{operationId:op,expectedRevision:1,resourceRole:'SUPER',action:'REMOVE',scheduleId:113});
 const foreman={...plan,resourceRole:'FOREMAN'};const roster={...saved,plans:[foreman]};
 assert.equal(staffingCommand({...args,snapshot:roster,resourceRole:'FOREMAN',employeeEid:8,startDate:'2027-04-01'}).action,'ADD');
 for(const v of [{...args,snapshot:saved},{...args,snapshot:{...initial,canEdit:false}},{...args,startDate:''},{...args,endDate:'2027-01-01'},{...args,startDate:'2027-02-30'},{...args,snapshot:roster,resourceRole:'FOREMAN'},{...args,snapshot:saved,plan:{...plan,scheduleId:999}},{...args,employeeEid:true}])assert.throws(()=>staffingCommand(v));
});
test('receipt identity and authoritative post-write readback',()=>{
 const body=staffingCommand(args);assert.equal(validateStaffingReceipt(receipt,sid,body),receipt);assert.equal(verifyStaffingReadback(saved,receipt,body),saved);
 for(const r of [{...receipt,operationId:'other'},{...receipt,revision:2},{...receipt,replayed:'false'},{...receipt,scheduleId:0}])assert.throws(()=>validateStaffingReceipt(r,sid,body));
 assert.throws(()=>verifyStaffingReadback(initial,receipt,body));assert.throws(()=>verifyStaffingReadback({...saved,plans:[]},receipt,body));
 assert.equal(verifyStaffingReadback({...saved,revision:2,plans:[]},receipt,body).revision,2);
 const remove=staffingCommand({...args,snapshot:saved,plan,remove:true});assert.equal(verifyStaffingReadback({...saved,revision:2,plans:[]},{...receipt,revision:2},remove).plans.length,0);
});
test('send once then GET; readback failure remains uncertain even when GET returns 404; explicit same-body replay',async()=>{
 const body=staffingCommand(args),calls=[];let attempt=0;
 const request=async(path,opts)=>{calls.push({path,opts});if(opts.method==='PATCH')return {...receipt,replayed:attempt++>0};if(attempt===1)throw Object.assign(Error('missing'),{status:404});return saved;};
 await assert.rejects(saveStaffing(sid,body,{request}),e=>e.status===undefined&&/readback not confirmed/.test(e.message));assert.equal(calls.length,2);
 const result=await saveStaffing(sid,body,{request});assert.equal(result.receipt.replayed,true);assert.equal(calls.length,4);assert.deepEqual(calls[0],calls[2]);
});
test('numbered and pending projects have different keys and own SetupID is not overlap',()=>{
 const numbered={...pending,scheduleId:2,jobListId:90,jobNumber:'27001',setupId:null};
 const another={...pending,scheduleId:3,setupId:'22222222-2222-4222-8222-222222222222'};
 const snapshot={role:'SUPER',employeeEid:7,employees:[{id:7,label:'Fixture'}],currentAssignments:[],schedules:[pending,numbered,another],readOnly:true};
 assert.equal(validateAvailability(snapshot,'SUPER',7),snapshot);const rows=commitmentRows(snapshot,args.startDate,args.endDate,null,sid);assert.equal(rows.length,3);assert.equal(rows.filter(r=>r.isCurrentProject).length,1);assert.equal(rows.filter(r=>r.conflicts.length).length,2);
 assert.equal(availabilitySummary(snapshot,args.startDate,args.endDate,90).conflicts.length,2);assert.equal(availabilitySummary(snapshot,args.startDate,args.endDate).conflicts.length,3);
 for(const p of [{...pending,jobListId:24},{...pending,setupId:null},{...pending,jobNumber:'11111'},{...pending,effectiveEndDate:null}])assert.throws(()=>validateAvailability({...snapshot,schedules:[p]},'SUPER',7));
});
