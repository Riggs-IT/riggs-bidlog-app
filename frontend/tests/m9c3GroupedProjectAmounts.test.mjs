import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayMoneyValue,parseMoneyDraft,groupMoneyDraft,moneyCaretPosition} from '../src/moneyInput.js';
import {buildJisChanges} from '../src/unnumberedProjectEditor.mjs';
import {quantityWholeDisplay,metricsChanges} from '../src/projectMetricsEditor.mjs';
const source=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
test('existing projected billing cent formatting stays the default',()=>{
  for(const [raw,formatted] of [['',''],[null,''],['0','0.00'],['50000','50,000.00'],['1294919.00','1,294,919.00'],['893226.5','893,226.50'],['.42','0.42'],['00012.3','12.30'],['.','.']]) assert.equal(displayMoneyValue(raw),formatted);
  assert.equal(displayMoneyValue('1294919.',true),'1,294,919.');
  assert.equal(parseMoneyDraft('1.234'),null);
  assert.equal(parseMoneyDraft('1,294,919.50'),'1294919.50');
  assert.equal(moneyCaretPosition('1234.50',7,'1,234.50'),8);
});
test('whole quantity inputs retain blanks and zero and reject fractional edits',()=>{
  for(const [raw,formatted] of [['',''],[null,''],['0','0'],['1234567','1,234,567']]) assert.equal(displayMoneyValue(raw,false,0),formatted);
  assert.equal(parseMoneyDraft('1,234,567',0),'1234567');
  for(const v of ['10.5','10.','-1','1e3','abc']) assert.equal(parseMoneyDraft(v,0),null);
  assert.deepEqual(metricsChanges({squareFootage:'5000.1234',cubicYards:'50.1'},{squareFootage:quantityWholeDisplay('5000.1234'),cubicYards:quantityWholeDisplay('50.1')}),[]);
});
test('project amounts preserve allowed precision without rounding or saving commas',()=>{
  assert.equal(displayMoneyValue('1234567.1234',false,4),'1,234,567.1234');
  assert.equal(displayMoneyValue('1234567.5',false,4),'1,234,567.50');
  assert.equal(parseMoneyDraft('$1,234,567.1234',4),'1234567.1234');
  assert.equal(parseMoneyDraft('1.12345',4),null);
  assert.equal(parseMoneyDraft('12.123456',null),'12.123456');
  assert.equal(displayMoneyValue('1200.123456',false,null),'1,200.123456');
  const fields=[{key:'operationalContractAmount',kind:'moneyText',editable:true,value:'1250'},{key:'primaryConcreteAmount',kind:'number',editable:true,value:20}];
  assert.deepEqual(buildJisChanges({fields},{operationalContractAmount:parseMoneyDraft('$1,250,000.1234',4),primaryConcreteAmount:parseMoneyDraft('2,000.25',null)}),{operationalContractAmount:'1250000.1234',primaryConcreteAmount:2000.25});
  assert.deepEqual(buildJisChanges({fields},{}),{});
});
test('both active project editors reuse the money input and keep percentage affixes',()=>{
  const numbered=source('ActiveProjectEditDrawer.jsx'), pending=source('UnnumberedProjectEditor.jsx'), input=source('MoneyInput.jsx');
  const metrics=source('ProjectMetricsFields.jsx');
  for(const editor of [numbered,pending])assert.match(editor,/<ProjectMetricsFields/);
  for(const key of ['squareFootage','cubicYards'])assert.ok(metrics.includes(key));
  assert.match(metrics,/<MoneyInput maxFractionDigits=\{0\} value=\{state.draft\?\.\[key\]/);
  assert.match(metrics,/onValueChange=\{value=>editor.edit\(key,value\)\}/);
  assert.match(pending,/<MoneyInput maxFractionDigits=\{groupedQuantity\?0:field.kind==='moneyText'\?4:null\}/);
  assert.match(pending,/disabled=\{!canChange\|\|!editable\} onValueChange=\{onChange\}/);
  assert.match(pending,/project-value-affix/);
  assert.match(input,/inputMode=\{maxFractionDigits === 0 \? 'numeric' : 'decimal'\}/);
  assert.match(input,/maxFractionDigits = 2/);
});
