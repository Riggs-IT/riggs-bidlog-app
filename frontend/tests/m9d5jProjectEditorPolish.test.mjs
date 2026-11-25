import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {foundationContractReference} from '../src/projectFoundationReference.mjs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const ref=(source,amount=150000)=>foundationContractReference({jobListId:55,totalContractSource:source,totalContractAmount:amount},55);

test('Foundation comparison accepts only Foundation-originated amounts',()=>{
 for(const source of ['FOUNDATION_REVISED_CONTRACT','FOUNDATION_REVISED'])assert.deepEqual(ref(source),{label:'Foundation Amount',amount:150000});
 assert.deepEqual(ref('FOUNDATION_ORIGINAL_CONTRACT'),{label:'Foundation Amount',amount:150000});
 assert.equal(ref('FOUNDATION_REVISED_CONTRACT',0).amount,0);
 for(const source of ['COGNITO_FALLBACK','COGNITO_CONTRACT','BID_ESTIMATE','PROJECTION','MISSING',null])assert.equal(ref(source).amount,null);
});
test('Foundation comparison never uses mismatched or missing identity or invalid amounts',()=>{
 for(const value of [null,undefined,'1500',NaN,Infinity])assert.equal(foundationContractReference({jobListId:55,totalContractSource:'FOUNDATION_REVISED_CONTRACT',totalContractAmount:value},55).amount,null);
 assert.equal(foundationContractReference({jobListId:54,totalContractSource:'FOUNDATION_REVISED_CONTRACT',totalContractAmount:1500},55).amount,null);
 assert.equal(foundationContractReference(null,55).amount,null);
});
test('numbered comparison follows the JIS field within one cell; pending projects omit it',()=>{
 const n=read('ActiveProjectEditDrawer.jsx'),u=read('UnnumberedProjectEditor.jsx');
 const comparison=n.split('className="project-contract-comparison"')[1].split('</div>')[0];
 assert.ok(comparison.indexOf('jf("operationalContractAmount"')>=0);
 assert.ok(comparison.indexOf('jf("operationalContractAmount"')<comparison.indexOf('className="project-foundation-reference"'));
 assert.match(n,/foundationContractReference\(projectSummary, jobListId\)/);
 assert.doesNotMatch(n,/<ReadField label="Foundation contract amount"/);
 assert.doesNotMatch(u,/project-foundation-reference/);
});
test('service links preserve destinations and use theme colors even after visiting',()=>{
 const component=read('ProjectServiceBindings.jsx'),css=read('styles/10-active-projects.css');
 assert.match(component,/project-service-bindings/);
 assert.match(component,/href=\{data.email.href\}/);
 assert.match(component,/href=\{data.folder.href\} target="_blank" rel="noopener noreferrer"/);
 assert.doesNotMatch(component,/Verified SQL binding|Last verified path|Legacy recorded|Binding unavailable|<small>/);
 assert.match(css,/\.project-service-bindings \.project-information-item a:visited\s*\{\s*color:var\(--accent\)/);
 assert.match(css,/\.project-service-bindings \.project-information-item a:focus-visible\s*\{outline:2px solid var\(--accent\)/);
});
test('each project editor mounts one organizer with both original independent roster editors',()=>{
 for(const file of ['UnnumberedProjectEditor.jsx','ActiveProjectEditDrawer.jsx']){
  const src=read(file);
  assert.equal((src.match(/<ProjectTeamPopup\b/g)||[]).length,1);
  assert.equal((src.match(/<ActiveProjectAdditionalMembers\b/g)||[]).length,1);
  assert.equal((src.match(/<ProjectExternalTeam\b/g)||[]).length,1);
  assert.doesNotMatch(src,/sectionId="externalTeam"/);
  assert.match(src,/onDirtyChange=\{setAdditionalDirty\} onSavingChange=\{setAdditionalSaving\}/);
  assert.match(src,/onDirtyChange=\{setExternalDirty\} onSavingChange=\{setExternalSaving\}/);
 }
});
test('popup retains both mounted panels and suppresses parent Escape, closing during saves and browser unload',()=>{
 const popup=read('ProjectTeamPopup.jsx'),css=read('ProjectTeamPopup.css');
 assert.match(popup,/dialog.current\?\.showModal\(\)/);
 assert.match(popup,/hidden=\{tab!=='internal'\}/);
 assert.match(popup,/hidden=\{tab!=='external'\}/);
 assert.match(popup,/\{internalAvailable\?cloneElement\(internal,/);
 assert.match(popup,/hidden=\{tab!=='external'\}>\{cloneElement\(external,/);
 assert.match(css,/\.project-team-panel\[hidden\] \{display:none!important;\}/);
 assert.match(popup,/if\(saving\|\|inFlight.current\)return;\s*closeDialog\(\)/);
 assert.match(popup,/event.stopPropagation\(\);if\(!event.defaultPrevented\)/);
 assert.match(popup,/onCancel=\{event=>\{event.preventDefault\(\);close\(\);\}\}/);
 assert.match(popup,/beforeunload/);
});
test('numbered internal roster remains admin-only and pending roster retains pilot gates',()=>{
 const n=read('ActiveProjectEditDrawer.jsx'),u=read('UnnumberedProjectEditor.jsx');
 assert.match(n,/internalAvailable=\{role==='ADMIN'&&canEdit\}/);
 assert.match(n,/<ActiveProjectAdditionalMembers jobListId=\{jobListId\} canEdit=\{role==='ADMIN'&&canEdit\}/);
 assert.match(u,/internalAvailable=\{inspector\}/);
 assert.match(u,/<ActiveProjectAdditionalMembers setupId=\{setupId\} canEdit=\{author\} canInspect=\{inspector\}/);
 assert.match(n,/const saving = [^;]*additionalSaving/);
});
