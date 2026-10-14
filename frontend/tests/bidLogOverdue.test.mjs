import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hasMissingEstimate, isOverdueForDays} from '../src/bidLogOverdue.js';

const row=(status, price, pm='Alex', snoozed=false) => ({status,estimatedPrice:price,pm,snoozed,dueDate:'2026-10-01'});
const scenarios = [
 ['Assigned past due blank estimate',row('Assigned',null),-1,true],
 ['Potential past due blank estimate',row('Potential',undefined),-1,true],
 ['Unassigned past due blank estimate',row('Potential','', ''),-1,true],
 ['Snoozed past due blank estimate',row('Assigned','  ', 'Alex', true),-1,true],
 ['Assigned priced',row('Assigned',5000),-1,false],
 ['Potential priced',row('Potential',5000),-1,false],
 ['Numeric zero is an estimate',row('Assigned',0),-1,false],
 ['Blank estimate due today',row('Assigned',null),0,false],
 ['Blank estimate due tomorrow',row('Assigned',null),1,false],
 ['Missing due date',row('Assigned',null),null,false],
];
for(const [label,bid,days,expected] of scenarios) {
  test(label,()=>assert.equal(isOverdueForDays(bid,days),expected));
}

test('blank semantics match Power Apps IsBlank; a zero or numeric string is not blank',()=>{
  for(const price of [null,undefined,'',' ','\t\n']) assert.equal(hasMissingEstimate(row('Assigned',price)),true);
  for(const price of [0,'0',5000,'5000']) assert.equal(hasMissingEstimate(row('Assigned',price)),false);
});

test('Active Bids badge, overdue facet and PM notification use the same predicate',()=>{
  const text=readFileSync(new URL('../src/BidLogWorkspace.jsx',import.meta.url),'utf8');
  assert.match(text,/function isOverdue\(row\) \{\s*return isOverdueForDays\(row, daysFromToday\(row\?\.dueDate\)\);/);
  assert.match(text,/function dueState\(row\)[\s\S]*?if \(isOverdue\(row\)\)/);
  assert.match(text,/activeView&&isOverdue\(r\)/);
  assert.match(text,/const state = activeView \? dueState\(row\) : null;/);
  assert.match(text,/pmDirectoryKey\(row\?\.pm\) === userKey\s*&& isOverdue\(row\)/);
  assert.match(text,/setPmFilter\(currentUserPm\);[\s\S]*?setDueFilter\('overdue'\);/);
  assert.match(text,/overdue bid\$\{count === 1/);
  assert.doesNotMatch(text,/overdue assigned bid/);
});

test('Missing Estimate summary and quick filter use the exact same predicate',()=>{
  const text=readFileSync(new URL('../src/BidLogWorkspace.jsx',import.meta.url),'utf8');
  assert.match(text,/quickFilter==='missingEstimate'&&!hasMissingEstimate\(row\)/);
  assert.match(text,/missingEstimate: countItems\.filter\(hasMissingEstimate\)\.length/);
  assert.match(text,/pmFilter === ALL \|\| String\(row\?\.pm \|\| ''\)\.trim\(\) === pmFilter/);
  assert.match(text,/<option value=\{ALL\}>All PMs<\/option>/);
});

test('historical views do not show overdue badges or offer overdue due filters',()=>{
  const text=readFileSync(new URL('../src/BidLogWorkspace.jsx',import.meta.url),'utf8');
  assert.match(text,/requestedViewKey !== 'active' && current === 'overdue'/);
  assert.match(text,/const state = activeView \? dueState\(row\) : null;/);
  assert.match(text,/activeView && facets\.options\.due\.includes\('overdue'\)/);
  assert.match(text,/const activeView\s*=/);
  // No lifecycle state changes were added by this patch.
  assert.doesNotMatch(text,/AppRole\s*===\s*['"]OVERDUE['"]/);
});
