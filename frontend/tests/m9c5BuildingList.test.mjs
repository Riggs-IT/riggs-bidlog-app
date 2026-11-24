import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectEditorSectionFields} from '../src/projectEditorLayout.mjs';
import {buildJisChanges} from '../src/unnumberedProjectEditor.mjs';
const fields=[{key:'numberOfBuildings',section:'buildings',kind:'integer',value:2,editable:false},
  {key:'buildingNames',section:'buildings',kind:'rows',value:[{id:'row1',name:'A'},{id:'row2',name:'B'}],editable:true}];
const src=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
test('one visible building list, no independent count',()=>{
  assert.deepEqual(projectEditorSectionFields(fields,'buildings').map(f=>f.key),['buildingNames']);
  assert.throws(()=>buildJisChanges({fields},{numberOfBuildings:3}),/calculated/);
});
test('add remove and rename submit only name rows',()=>{
  const rows=[{id:'row1',name:'A revised'},{id:null,name:'C'}];
  assert.deepEqual(buildJisChanges({fields},{buildingNames:rows}),{buildingNames:rows});
  assert.deepEqual(buildJisChanges({fields},{buildingNames:fields[1].value}),{});
  for(const rows of [[],[{id:null,name:''}],Array.from({length:101},()=>({id:null,name:'X'}))])assert.throws(()=>buildJisChanges({fields},{buildingNames:rows}));
});
test('numbered read-only and unnumbered edit use the same ordinal row view',()=>{
  assert.match(src('UnnumberedProjectEditor.jsx'),/<ProjectBuildingRows rows=\{value\}/);
  assert.match(src('ActiveProjectCognitoSections.jsx'),/<ProjectBuildingRows rows=\{buildings\}/);
  const rows=src('ProjectBuildingRows.jsx');
  assert.match(rows,/Building \{index\+1\}/);assert.match(rows,/rows.length.*buildings/);
  assert.match(rows,/\+ Add Building/);assert.match(rows,/rows.length<=1/);
  assert.match(rows,/onChange\(rows.filter/);assert.match(rows,/onChange\(\[\.\.\.rows,\{id:null,name:''\}\]\)/);
  assert.doesNotMatch(rows,/type="number"/);
});
