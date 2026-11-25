import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {beginProjectBuildings,projectBuildingLayout} from '../src/projectEditorLayout.mjs';
import {saveProjectEditLanes} from '../src/projectEditorSave.mjs';
import {validateMetricEdits} from '../src/projectMetricsEditor.mjs';
import {buildJisChanges} from '../src/unnumberedProjectEditor.mjs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
test('legacy unnamed slots count as no named buildings; their IDs are preserved on add',()=>{
 const rows=[{id:'old-1',name:''},{id:'old-2',name:' '}];
 assert.deepEqual(projectBuildingLayout(rows,true),{showBuildings:false,canAddBuildings:true,unavailable:false});
 assert.deepEqual(beginProjectBuildings(rows),rows);
 assert.notEqual(beginProjectBuildings(rows)[0],rows[0]);
 assert.equal(projectBuildingLayout(rows,true,true).showBuildings,true);
 assert.deepEqual(beginProjectBuildings([]),[{id:null,name:''}]);
});
test('unreadable building data never enables writes, populated rows are not replaced',()=>{
 for(const rows of [undefined,null,{},[{id:'x',name:'Named'}]])assert.equal(beginProjectBuildings(rows),null);
 assert.equal(projectBuildingLayout(null,true).canAddBuildings,false);
 assert.equal(projectBuildingLayout([{id:'x',name:'Named'}],true).showBuildings,true);
 assert.equal(projectBuildingLayout([],false).canAddBuildings,false);
});
test('a named first row is saved through the existing typed count-derived contract',()=>{
 const f={key:'buildingNames',kind:'rows',editable:true,value:[{id:'old',name:''}]};
 assert.deepEqual(buildJisChanges({fields:[f]},{buildingNames:[{id:'old',name:'A'}]}),{buildingNames:[{id:'old',name:'A'}]});
});
const call=(events,key,result=true)=>async()=>{events.push(key);return result;};
test('combined project save runs only dirty lanes and preserves ordering',async()=>{
 for(const [m,f,expected] of [[true,false,['metrics']],[false,true,['fields']],[true,true,['metrics','fields']],[false,false,[]]]){
  const events=[];assert.deepEqual(await saveProjectEditLanes({metricsDirty:m,fieldsDirty:f,saveMetrics:call(events,'metrics'),saveFields:call(events,'fields')}),{ok:true,saved:expected});assert.deepEqual(events,expected);
 }
});
test('unconfirmed metrics stops JIS patch; partial field failure does not repeat successful metrics',async()=>{
 let events=[];assert.deepEqual(await saveProjectEditLanes({metricsDirty:true,fieldsDirty:true,saveMetrics:call(events,'metrics',false),saveFields:call(events,'fields')}),{ok:false,saved:[],failed:'metrics'});assert.deepEqual(events,['metrics']);
 events=[];assert.deepEqual(await saveProjectEditLanes({metricsDirty:true,fieldsDirty:true,saveMetrics:call(events,'metrics'),saveFields:call(events,'fields',false)}),{ok:false,saved:['metrics'],failed:'fields'});assert.deepEqual(events,['metrics','fields']);
 events=[];await saveProjectEditLanes({metricsDirty:false,fieldsDirty:true,saveMetrics:call(events,'metrics'),saveFields:call(events,'fields')});assert.deepEqual(events,['fields']);
});
test('preflight quantity validation rejects blanks and fractional counts but preserves zero and unchanged precision',()=>{
 const base={squareFootage:'10.1234',cubicYards:'2',numberOfPanels:5,panelApplicable:true};
 assert.deepEqual(validateMetricEdits(base,{squareFootage:'10',cubicYards:'0',numberOfPanels:'5'}),{cubicYards:'0'});
 for(const value of ['', '1.5','2147483648','-1'])assert.throws(()=>validateMetricEdits(base,{squareFootage:'10',cubicYards:'2',numberOfPanels:value}));
});
test('both editors use the common metrics fields and the same header layout, no standalone metrics save',()=>{
 for(const name of ['ActiveProjectEditDrawer.jsx','UnnumberedProjectEditor.jsx']){
  const src=read(name);for(const s of ['ProjectMetricsFields','ProjectQuantitiesLayout','active-project-core-grid','active-project-location-grid','active-project-admin-grid','Save Changes','Discard Changes','Reload details'])assert.ok(src.includes(s),`${name}: ${s}`);
  assert.doesNotMatch(src,/Save Metrics|Discard Metrics/);
 }
 const u=read('UnnumberedProjectEditor.jsx');assert.ok(u.indexOf('validateMetricEdits(metricsState.snapshot,metricsState.draft)')<u.indexOf('await saveProjectEditLanes('));
 assert.match(u,/dirty\|\|metricsDirty/);assert.match(u,/metricsEditor.discard\(\)/);
 const fields=read('ProjectMetricsFields.jsx');assert.match(fields,/state.snapshot\?\.panelApplicable===true/);assert.match(fields,/fields.length===3\?'three-column':'two-column'/);
});
