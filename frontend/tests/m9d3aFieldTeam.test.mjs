import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {availabilityPath,dateOnly,projectWindow,validWindow,validateAvailability,availabilitySummary,timelineGeometry} from '../src/fieldTeamAvailability.mjs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const commitment={jobListId:90,jobNumber:'27001',jobName:'Synthetic fixture',resourceRole:'SUPER'};
const plan={...commitment,scheduleId:1,effectiveStartDate:'2027-02-03',effectiveEndDate:'2027-04-15',status:'PLANNED'};
const body={role:'SUPER',employeeEid:4,employees:[{id:4,label:'Synthetic employee'}],currentAssignments:[commitment],schedules:[plan],readOnly:true};
test('project dates use anticipated start plus calendar months, clamp month ends',()=>{
 assert.deepEqual(projectWindow('2027-02-03',8),{start:'2027-02-03',end:'2027-10-03'});
 assert.deepEqual(projectWindow('2027-01-31',1),{start:'2027-01-31',end:'2027-02-28'});
 assert.deepEqual(projectWindow('2028-01-31',1),{start:'2028-01-31',end:'2028-02-29'});
 assert.deepEqual(projectWindow('2027-01-31',null),{start:'2027-01-31',end:''});
 assert.equal(dateOnly('2027-02-30'),'');assert.equal(dateOnly('2027-03-01T12:00:00Z'),'2027-03-01');assert.equal(validWindow('2027-02-02','2027-02-01'),false);
});
test('strict read path only accepts eligible role and positive EID',()=>{
 assert.equal(availabilityPath('SUPER'),'/api/project-setups/jis/field-team/availability?role=SUPER');
 assert.equal(availabilityPath('FOREMAN',4),'/api/project-setups/jis/field-team/availability?role=FOREMAN&employeeEid=4');
 for(const args of [['PM',4],['SUPER',0],['SUPER','4']])assert.throws(()=>availabilityPath(...args));
});
test('snapshot rejects mismatched identities, protected projects and malformed dates',()=>{
 assert.equal(validateAvailability(body,'SUPER',4),body);
 assert.throws(()=>validateAvailability({...body,employeeEid:5},'SUPER',4));
 assert.throws(()=>validateAvailability({...body,readOnly:false},'SUPER',4));
 assert.throws(()=>validateAvailability({...body,currentAssignments:[{...commitment,jobListId:24}]},'SUPER',4));
 assert.throws(()=>validateAvailability({...body,schedules:[{...plan,jobName:'Riggs Yard 2026'}]},'SUPER',4));
 assert.throws(()=>validateAvailability({...body,schedules:[{...plan,effectiveStartDate:'2027-02-30'}]},'SUPER',4));
 assert.throws(()=>validateAvailability({...body,schedules:[plan,plan]},'SUPER',4));
 assert.throws(()=>validateAvailability({...body,employeeEid:null},'SUPER',null));
 assert.doesNotThrow(()=>validateAvailability({...body,schedules:[{...plan,effectiveEndDate:null}]},'SUPER',4));
});
test('conflicts are inclusive, completed plans ignored, current project is not a cross-project conflict',()=>{
 const plans=[plan,{...plan,scheduleId:2,status:'COMPLETED'},{...plan,scheduleId:3,jobListId:91,effectiveEndDate:null}];
 const input={...body,schedules:plans,currentAssignments:[commitment,{...commitment,jobListId:92}]};
 const first=availabilitySummary(input,'2027-04-15','2027-05-01');
 assert.deepEqual(first.conflicts,[plan]);assert.equal(first.unresolved.length,1);assert.equal(first.currentWithoutPlan.length,1);
 assert.equal(availabilitySummary(input,'2027-04-15','2027-05-01',90).conflicts.length,0);
 assert.equal(availabilitySummary(input,'2027-04-16','2027-05-01').conflicts.length,0);
 assert.equal(availabilitySummary(input,'','').conflicts.length,0);
});
test('timeline uses actual range, supports one-day previews and leaves missing dates out of bars',()=>{
 const g=timelineGeometry([plan,{...plan,scheduleId:2,effectiveEndDate:null}],'2027-02-03','2027-10-03');
 assert.equal(g.first,'2027-02-03');assert.equal(g.last,'2027-10-03');assert.equal(g.rows.length,2);assert.equal(g.rows[1].width,100);assert.equal(g.rows[1].left,0);
 assert.ok(g.rows[0].width<100);assert.equal(timelineGeometry([],'2027-01-01','2027-01-01').rows[0].width,100);
 assert.equal(timelineGeometry([],'',''),null);
});
test('both editors use project-specific popup, no protected write gate or save route',()=>{
 const numbered=read('ActiveProjectEditDrawer.jsx'),pending=read('UnnumberedProjectEditor.jsx'),popup=read('ProjectFieldTeam.jsx');
 assert.match(numbered,/<ProjectFieldTeam jobListId=\{jobListId\}/);assert.match(numbered,/canInspect=\{canInspectChoices\}/);assert.match(numbered,/<ActiveProjectAdditionalMembers/);
 assert.match(pending,/<ProjectFieldTeam projectName=\{detail.jobName\}/);assert.match(pending,/canInspect=\{inspector\}/);
 assert.doesNotMatch(popup,/awaiting job number/i);assert.match(popup,/Availability preview · Changes here are not saved/);assert.match(popup,/Current assignment unavailable.*Not assigned/);assert.match(popup,/showModal\(\)/);assert.match(popup,/requestSetup\(availabilityPath\(role,eid\),\{signal:controller.signal\}\)/);
 assert.doesNotMatch(popup,/method:\s*['"](?:POST|PATCH|PUT|DELETE)|\/staffing\/assign|Save Assignment/);
 assert.doesNotMatch(numbered,/writeEnabled=\{Number\(jobListId\) === 24\}/);
});
