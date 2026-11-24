import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {commitmentRows,filterCommitments,plannerRange,clippedPlan,plannerTicks} from '../src/fieldTeamAvailability.mjs';
const job=(id,role='SUPER')=>({jobListId:id,jobNumber:String(27000+id),jobName:`Fixture ${id}`,resourceRole:role});
const plan=(id,scheduleId,start,end,status='CONFIRMED',role='SUPER')=>({...job(id,role),scheduleId,effectiveStartDate:start,effectiveEndDate:end,status});
const window=['2027-02-03','2027-10-03'];
const snapshot={currentAssignments:Array.from({length:14},(_,i)=>job(i+100)),schedules:Array.from({length:12},(_,i)=>plan(i+100,i+1,'2026-01-01',null))};
test('14 current commitments and 12 matching undated plans remain 14 unique rows',()=>{
 const rows=commitmentRows(snapshot,...window);
 assert.equal(rows.length,14);assert.equal(rows.reduce((n,r)=>n+r.plans.length,0),12);
 assert.equal(rows.filter(r=>r.needsDates).length,14);assert.equal(rows.filter(r=>r.conflicts.length).length,0);
 assert.equal(rows.filter(r=>r.current.length).length,14);assert.equal(rows.filter(r=>!r.plans.length).length,2);
 assert.equal(filterCommitments(rows,'undated').length,14);assert.equal(filterCommitments(rows,'overlaps').length,0);
});
test('multiple role and plan rows retain all details, but counts are per project',()=>{
 const s={currentAssignments:[job(100),job(100,'FOREMAN')],schedules:[plan(100,1,'2027-02-01','2027-03-01'),plan(100,2,'2027-04-01',null,'PLANNED','FOREMAN'),plan(100,3,'2026-01-01','2026-02-01','COMPLETED'),plan(101,4,'2027-01-01','2027-10-01','PLANNED')]};
 const rows=commitmentRows(s,...window,100);
 assert.equal(rows.length,2);assert.equal(rows[0].jobListId,101);
 const r=rows[1];assert.equal(r.current.length,2);assert.equal(r.plans.length,3);assert.equal(r.openPlans.length,2);assert.equal(r.needsDates,true);assert.equal(r.currentWithoutPlan.length,1);assert.equal(r.isCurrentProject,true);assert.equal(r.conflicts.length,0);
 assert.deepEqual(filterCommitments(rows,'current').map(x=>x.jobListId),[100]);assert.deepEqual(filterCommitments(rows,'overlaps').map(x=>x.jobListId),[101]);
 assert.deepEqual(filterCommitments(rows,'undated','Fixture 100').map(x=>x.jobListId),[100]);assert.equal(filterCommitments(rows,'current','27101').length,0);
});
test('completed plan is not an open commitment or conflict and cannot satisfy current coverage',()=>{
 const s={currentAssignments:[job(100)],schedules:[plan(100,1,...window,'COMPLETED'),plan(101,2,...window,'COMPLETED')]};
 const rows=commitmentRows(s,...window);assert.equal(rows.length,2);assert.equal(rows[0].needsDates,true);assert.equal(rows[1].needsDates,false);assert.equal(rows[0].openPlans.length,0);assert.equal(filterCommitments(rows,'overlaps').length,0);
});
test('proposal window clips dated bars; all dates includes earlier and later commitments',()=>{
 const p=[plan(100,1,'2026-01-01','2027-01-01'),plan(101,2,'2027-01-01','2027-04-03'),plan(102,3,'2027-11-01','2028-02-01'),plan(103,4,'2020-01-01',null)];
 const range=plannerRange(p,...window);assert.deepEqual(range,{first:window[0],last:window[1]});
 assert.equal(clippedPlan(p[0].effectiveStartDate,p[0].effectiveEndDate,range).state,'before');
 assert.equal(clippedPlan(p[2].effectiveStartDate,p[2].effectiveEndDate,range).state,'after');
 const partial=clippedPlan(p[1].effectiveStartDate,p[1].effectiveEndDate,range);assert.equal(partial.state,'visible');assert.equal(partial.left,0);assert.ok(partial.width>0&&partial.width<100);
 assert.deepEqual(clippedPlan(...window,range),{state:'visible',left:0,width:100});assert.equal(clippedPlan('2020-01-01',null,range).state,'undated');
 const all=plannerRange(p,...window,'all');assert.deepEqual(all,{first:'2026-01-01',last:'2028-02-01'});assert.equal(plannerTicks(all).length,5);
});
test('single day, invalid and empty windows remain safe',()=>{
 const range=plannerRange([],'2027-03-01','2027-03-01');assert.equal(clippedPlan('2027-03-01','2027-03-01',range).width,100);assert.equal(plannerTicks(range).length,1);
 assert.equal(plannerRange([],'',''),null);assert.deepEqual(plannerTicks(null),[]);assert.equal(clippedPlan(...window,null).state,'undated');
 const rows=commitmentRows(snapshot,'','');assert.equal(rows.length,14);assert.equal(rows.filter(x=>x.conflicts.length).length,0);
});
test('100 projects remain a single searchable list without losing plans',()=>{
 const s={currentAssignments:Array.from({length:100},(_,i)=>job(100+i)),schedules:Array.from({length:100},(_,i)=>plan(100+i,i+1,...window))};
 const rows=commitmentRows(s,...window);assert.equal(rows.length,100);assert.equal(filterCommitments(rows,'overlaps').length,100);assert.equal(filterCommitments(rows,'all','27199').length,1);
});
test('popup uses single bounded table and compact non-input preview status; no write route',()=>{
 const src=readFileSync(new URL('../src/ProjectFieldTeam.jsx',import.meta.url),'utf8');const css=readFileSync(new URL('../src/ProjectFieldTeam.css',import.meta.url),'utf8');
 assert.match(src,/commitmentRows\(snapshot,start,end,jobListId\)/);assert.match(src,/shown\.map\(row=>/);assert.match(src,/<table className="field-team-table">/);assert.match(src,/className="field-team-preview-status"/);assert.match(src,/Changes here are not saved/);assert.doesNotMatch(src,/field-team-commitments|field-team-warning|<h4>Current assignments|Save Assignment|method:\s*['"](?:POST|PATCH|PUT|DELETE)/);
 assert.match(css,/\.field-team-table-scroll\{max-height:[^}]+overflow:auto/);assert.match(css,/\.field-team-table thead th\{position:sticky/);
});

test('field team uses a scoped in-flow options list rather than a clipped overlay',()=>{
 const css=readFileSync(new URL('../src/ProjectFieldTeam.css',import.meta.url),'utf8');
 assert.match(css,/\.field-team-dialog \.project-setup-combobox-wrap\{display:grid/);
 assert.match(css,/\.field-team-dialog \.project-setup-combobox-wrap>input\{grid-area:1\/1/);
 assert.match(css,/\.field-team-dialog \.project-setup-combobox-clear,\.field-team-dialog \.project-setup-combobox-caret\{[^}]*grid-area:1\/1/);
 assert.match(css,/\.field-team-dialog \.project-setup-combobox-list\{position:static;grid-area:2\/1;[^}]*max-height:[^}]*overflow-y:auto/);
 assert.doesNotMatch(css,/(?:^|\n)\.project-setup-combobox-list\{/);
});
