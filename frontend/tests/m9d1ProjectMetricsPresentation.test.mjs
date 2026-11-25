import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectEditorSectionFields} from '../src/projectEditorLayout.mjs';
import {quantityWholeDisplay,metricsChanges} from '../src/projectMetricsEditor.mjs';
import {displayMoneyValue} from '../src/moneyInput.js';
const read = name => readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
test('metrics are displayed once; planned dates and notes are hidden without changing values',()=>{
 const fields=[{key:'squareFootageSF',section:'basics',value:'5000.125'},{key:'cubicYardsCY',section:'basics',value:'0'},
 {key:'jobName',section:'basics',value:'Project'},{key:'anticipatedStartDate',section:'location',value:'2027-01-01'},
 {key:'estimatedDurationMonths',section:'location',value:3},{key:'plannedStartDate',section:'location',value:'2027-02-01'},
 {key:'plannedEndDate',section:'location',value:'2027-03-01'},{key:'scheduleNotes',section:'location',value:'Existing notes'},
 {key:'comments',section:'scope',value:'Project notes'}];
 const original=structuredClone(fields);
 const keys=section=>projectEditorSectionFields(fields,section).map(f=>f.key);
 assert.deepEqual(keys('basics'),['jobName']);assert.deepEqual(keys('metrics'),['squareFootageSF','cubicYardsCY']);
 assert.deepEqual(keys('location'),['anticipatedStartDate','estimatedDurationMonths']);assert.deepEqual(keys('scope'),['comments']);
 assert.deepEqual(fields,original);
});
test('numbered metrics retain independent SQL save bindings and reference display',()=>{
 const source=read('ActiveProjectEditDrawer.jsx'),card=read('ProjectMetricsFields.jsx');
 assert.match(source,/title="Project Metrics"/);assert.match(card,/state.disabled\?/);
 assert.match(source,/<ProjectMetricsFields state=\{metricsState\} editor=\{metricsEditor\}/);
 assert.match(card,/state.snapshot\?\.canEdit/);assert.match(source,/await metricsEditor.save\(\)/);
 assert.doesNotMatch(source.split('sectionId="basics"')[1].split('</ActiveProjectSection>')[0],/Square Footage|Cubic Yards/);
});
test('pending metrics use the same card, independent SQL persistence and one footer save',()=>{
 const source=read('UnnumberedProjectEditor.jsx');assert.match(source,/renderSection\(\['metrics','METRICS','Project Metrics'\]\)/);
 assert.match(source,/<ProjectMetricsFields state=\{metricsState\} editor=\{metricsEditor\}/);
 assert.match(source,/saveMetrics:\(\)=>metricsEditor.save\(\)/);
 assert.match(source,/disabled=\{!canSave\} onClick=\{\(\)=>void save\(\)\}/);
 assert.doesNotMatch(source,/Save Metrics|Discard Metrics/);
});
test('formatting keeps missing and zero distinct and does not mark untouched precision dirty',()=>{
 assert.equal(displayMoneyValue(quantityWholeDisplay('12345.1234'),false,0),'12,345');
 assert.equal(displayMoneyValue(quantityWholeDisplay('0'),false,0),'0');
 assert.equal(displayMoneyValue(quantityWholeDisplay(null),false,0),'');
 assert.deepEqual(metricsChanges({squareFootage:'5000.125',cubicYards:'50.4'},{squareFootage:'5000',cubicYards:'50'}),[]);
});
