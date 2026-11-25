import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {saveTeamRosters,teamSummary} from '../src/projectTeamSave.mjs';
import {projectBuildingLayout,selectedReferenceContact} from '../src/projectEditorLayout.mjs';
import {buildJisChanges} from '../src/unnumberedProjectEditor.mjs';
import {normalizeExternalContacts} from '../src/projectExternalTeam.mjs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
function lane(key,events,{dirty=true,blocked=false,result={ok:true,committed:true},throws=false}={}){
 return {key,dirty,handle:{prepareSave(){events.push(`prepare:${key}`);if(!dirty)return {state:'unchanged'};if(blocked)return {state:'blocked',message:'Invalid roster'};return {state:'ready',run:async()=>{events.push(`save:${key}`);if(throws)throw Error('transport');return result;}};}}};
}
test('one click prevalidates both lists, saves sequentially and reports success',async()=>{
 const calls=[];assert.deepEqual(await saveTeamRosters([lane('internal',calls),lane('external',calls)]),{ok:true,saved:['internal','external']});
 assert.deepEqual(calls,['prepare:internal','prepare:external','save:internal','save:external']);
});
test('invalid second roster prevents either mutation',async()=>{
 const calls=[];const out=await saveTeamRosters([lane('internal',calls),lane('external',calls,{blocked:true})]);assert.equal(out.ok,false);assert.equal(out.failed,'external');assert.deepEqual(out.saved,[]);assert.deepEqual(calls,['prepare:internal','prepare:external']);
});
test('partial success is reported; retry only dirty lane',async()=>{
 const calls=[];const out=await saveTeamRosters([lane('internal',calls),lane('external',calls,{throws:true})]);assert.equal(out.ok,false);assert.deepEqual(out.saved,['internal']);assert.equal(out.failed,'external');
 const next=[];assert.deepEqual(await saveTeamRosters([lane('internal',next,{dirty:false}),lane('external',next)]),{ok:true,saved:['external']});assert.deepEqual(next,['prepare:internal','prepare:external','save:external']);
});
test('internal commit with failed readback is not replayed and stops second lane',async()=>{
 const calls=[];const out=await saveTeamRosters([lane('internal',calls,{result:{ok:false,committed:true,message:'Readback failed'}}),lane('external',calls)]);assert.equal(out.ok,false);assert.deepEqual(out.saved,['internal']);assert.equal(out.failed,'internal');assert.ok(!calls.includes('save:external'));
});
test('missing dirty handle fails closed; unchanged unavailable lane does not block valid external save',async()=>{
 const calls=[];assert.equal((await saveTeamRosters([{key:'internal',dirty:true,handle:null},lane('external',calls)])).ok,false);assert.deepEqual(calls,[]);
 const next=[];assert.equal((await saveTeamRosters([{key:'internal',dirty:false,handle:null},lane('external',next)])).ok,true);assert.deepEqual(next,['prepare:external','save:external']);
});
test('read-only or unchanged lanes never issue requests',async()=>{
 const calls=[];assert.deepEqual(await saveTeamRosters([lane('internal',calls,{dirty:false}),lane('external',calls,{dirty:false})]),{ok:true,saved:[]});assert.ok(calls.every(c=>c.startsWith('prepare:')));
});
test('summary keeps saved member names and independent states without leaking external addresses as labels',()=>{
 const a={status:'ready',members:[{key:'123',name:'Internal Person'}]},b={status:'ready',members:[{key:'qa@example.test',name:'External Person'}]};
 assert.deepEqual(teamSummary(true,a,b).members.map(x=>[x.lane,x.name]),[['internal','Internal Person'],['external','External Person']]);
 assert.deepEqual(teamSummary(false,a,b).members.map(x=>x.name),['External Person']);assert.equal(teamSummary(true,null,b).loading,true);assert.equal(teamSummary(true,{status:'review'},b).review,true);assert.equal(teamSummary(true,a,{status:'unavailable'}).unavailable,true);
});
test('building layout distinguishes known empty, loaded rows, unavailable and readonly',()=>{
 assert.deepEqual(projectBuildingLayout([],true),{showBuildings:false,canAddBuildings:true,unavailable:false});
 assert.deepEqual(projectBuildingLayout([],false),{showBuildings:false,canAddBuildings:false,unavailable:false});
 assert.deepEqual(projectBuildingLayout(null,true),{showBuildings:false,canAddBuildings:false,unavailable:true});
 assert.deepEqual(projectBuildingLayout([{id:null,name:''}],true),{showBuildings:true,canAddBuildings:false,unavailable:false});
});
test('adding first building edits only ordered rows, rejects an empty name and never writes a direct count',()=>{
 const fields=[{key:'buildingNames',kind:'rows',editable:true,value:[]}];
 assert.throws(()=>buildJisChanges({fields},{buildingNames:[{id:null,name:''}]}));
 assert.deepEqual(buildJisChanges({fields},{buildingNames:[{id:null,name:'Building A'}]}),{buildingNames:[{id:null,name:'Building A'}]});
 assert.throws(()=>buildJisChanges({fields},{numberOfBuildings:1}));
});
test('both editors use shared layout and shared design cards; contact email/address are not direct editors',()=>{
 for(const f of ['ActiveProjectEditDrawer.jsx','UnnumberedProjectEditor.jsx']){const src=read(f);assert.match(src,/<ProjectQuantitiesLayout/);assert.match(src,/Contract & Financial Details/);assert.match(src,/<ProjectReferenceContactCard/);assert.match(src,/beginProjectBuildings\(buildingRows\)/);}
 const card=read('ProjectReferenceContactCard.jsx');assert.match(card,/DesignTeamContactDetails contact=\{contact\}/);assert.doesNotMatch(card,/<input|<textarea/);
 const n=read('ActiveProjectEditDrawer.jsx');assert.doesNotMatch(n,/\['architectLookupId','structuralEngineerLookupId','architectEmail'/);
 const layout=read('ProjectQuantitiesLayout.jsx');assert.match(layout,/\{metrics\}\s*\{commercial\}/);assert.match(layout,/\+ Add Buildings/);assert.match(layout,/layout.showBuildings&&buildings/);
 const css=read('styles/10-active-projects.css');assert.match(css,/grid-template-areas:"metrics metrics" "commercial buildings"/);assert.match(css,/grid-template-areas:"commercial metrics"/);
});
test('switching firm never shows previous firm address; clearing shows no previous data',()=>{
 const field={key:'architectLookupId',selectionId:'206-1',options:[{id:'206-1'},{id:'206-2'}]};const fields=new Map([['email',{value:'old@example.test'}],['address',{value:'old address'}]]);
 assert.deepEqual(selectedReferenceContact(field,'206-1',fields,'email',['address']),{email:'old@example.test',address:'old address'});
 assert.equal(selectedReferenceContact(field,'206-2',fields,'email',['address']),null);
 assert.deepEqual(selectedReferenceContact(field,'206-2',fields,'email',['address'],{architects:[{id:'206-2',email:'new@example.test',address:'new address'}]}),{email:'new@example.test',address:'new address'});
 assert.equal(selectedReferenceContact(field,null,fields,'email',['address']),null);
});
test('empty external list is valid for removing all QA contacts through ordinary save',()=>{assert.deepEqual(normalizeExternalContacts([]),[]);});
test('both panels expose prepareSave to the shared footer; no individual Save buttons',()=>{
 for(const f of ['ActiveProjectAdditionalMembers.jsx','ProjectExternalTeam.jsx']){const src=read(f);assert.match(src,/useImperativeHandle\(ref,/);assert.match(src,/coordinating/);assert.match(src,/onSummaryChange/);assert.doesNotMatch(src,/>Save (?:Members|External Team)</);}
 const popup=read('ProjectTeamPopup.jsx');assert.match(popup,/saveTeamRosters\(/);assert.match(popup,/Save Team/);assert.match(popup,/if\(result.ok\)\{closeDialog\(\);return;\}/);assert.match(popup,/setTab\(result.failed\)/);assert.doesNotMatch(popup,/Internal & external members/);
});
