import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {beginProjectBuildings,projectBuildingLayout,canCancelEmptyBuildingDraft,cancelEmptyBuildingDraft} from '../src/projectEditorLayout.mjs';
import {buildJisChanges,referenceValue} from '../src/unnumberedProjectEditor.mjs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const field=value=>({key:'buildingNames',kind:'rows',editable:true,value});
const dirty=(fields,values)=>Object.keys(values).some(k=>JSON.stringify(values[k])!==JSON.stringify(referenceValue(fields.find(f=>f.key===k))));
test('open first building then remove restores empty layout and produces no write',()=>{
 const f=field([]);let values={buildingNames:beginProjectBuildings(f.value)};
 assert.equal(projectBuildingLayout(values.buildingNames,true,true).showBuildings,true);
 assert.equal(canCancelEmptyBuildingDraft(f),true);
 values=cancelEmptyBuildingDraft(values,f);
 assert.deepEqual(values,{});assert.equal(dirty([f],values),false);
 assert.deepEqual(buildJisChanges({fields:[f]},values),{});
 assert.deepEqual(projectBuildingLayout(f.value,true,Object.hasOwn(values,'buildingNames')),{showBuildings:false,canAddBuildings:true,unavailable:false});
});
test('cancel restores original legacy blank slots and preserves unrelated edits',()=>{
 const f=field([{id:'old1',name:''},{id:'old2',name:' '}]);
 const original=structuredClone(f.value);const scope={key:'scope',kind:'text',editable:true,value:'Original'};
 let values={scope:'Changed',buildingNames:beginProjectBuildings(f.value)};
 assert.equal(projectBuildingLayout(values.buildingNames,true,true).showBuildings,true);
 values={...values,buildingNames:[{...values.buildingNames[0],name:'Unsaved Building'}]};
 const next=cancelEmptyBuildingDraft(values,f);
 assert.deepEqual(next,{scope:'Changed'});assert.deepEqual(f.value,original);
 assert.deepEqual(buildJisChanges({fields:[f,scope]},next),{scope:'Changed'});
 assert.equal(projectBuildingLayout(f.value,true,Object.hasOwn(next,'buildingNames')).canAddBuildings,true);
});
test('saved final building, unknown data, readonly and unrelated fields cannot be cancelled',()=>{
 const values={buildingNames:[{id:null,name:''}]};
 for(const f of [field([{id:'saved',name:'A'}]),field(null),field(undefined),field([{}]),{...field([]),editable:false},{...field([]),key:'scope'}]){
  assert.equal(canCancelEmptyBuildingDraft(f),false);assert.equal(cancelEmptyBuildingDraft(values,f),values);
 }
 const multiple={buildingNames:[{id:null,name:'A'},{id:null,name:'B'}]};assert.equal(cancelEmptyBuildingDraft(multiple,field([])),multiple);
 const unchanged={scope:'X'};assert.equal(cancelEmptyBuildingDraft(unchanged,field([])),unchanged);
});
test('both editors wire cancellation to field-specific draft reset, not a save',()=>{
 const rows=read('ProjectBuildingRows.jsx');assert.match(rows,/rows.length<=1&&!canCancel/);assert.match(rows,/if\(rows.length===1\)\{if\(canCancel\)onCancel\(\);return;\}/);
 const pending=read('UnnumberedProjectEditor.jsx');assert.match(pending,/onCancel=\{canCancelEmptyBuildingDraft\(field\)\?onCancelBuildings:undefined\}/);assert.match(pending,/onCancelBuildings=\{\(\)=>cancelBuildingEdit\(field\)\}/);
 const numbered=read('ActiveProjectEditDrawer.jsx');assert.match(numbered,/onCancelBuildings=\{\(\)=>jis.cancelBuildingEdit\(field\)\}/);
 for(const src of [pending,read('useNumberedProjectJis.js')])assert.match(src,/function cancelBuildingEdit\(field\)\{if\(canEdit&&field.editable\)setValues\(old=>cancelEmptyBuildingDraft\(old,field\)\);\}/);
});
