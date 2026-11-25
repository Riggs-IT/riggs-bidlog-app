import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectedReferenceContact,projectFieldAffix} from '../src/projectEditorLayout.mjs';
import {buildJisChanges} from '../src/unnumberedProjectEditor.mjs';
const source=readFileSync(new URL('../src/UnnumberedProjectEditor.jsx',import.meta.url),'utf8');
const field=(key,selectionId,next)=>({key,selectionId,options:[{id:selectionId},{id:next}]});
const byKey=new Map([['email',{value:'old@example.test'}],['address',{value:'Old address'}]]);
const dirs={gcs:[{cognitoLookupId:'140-2',name:'Same name',email:'new@example.test',streetAddress:'New street',cityStateZip:'Mesa AZ'}],architects:[{id:'206-2',email:'architect@example.test',address:'Architect address'}],engineers:[{id:'206-3',email:null,address:'Engineer address'}]};
test('live GC preview uses exact Form140 ID and no stale contact fallback',()=>{
 const f=field('gcLookupId','140-1','140-2');
 assert.deepEqual(selectedReferenceContact(f,'140-2',byKey,'email',['address'],dirs),{email:'new@example.test',address:'New street\nMesa AZ'});
 assert.deepEqual(selectedReferenceContact(f,'140-1',byKey,'email',['address'],dirs),{email:'old@example.test',address:'Old address'});
 assert.equal(selectedReferenceContact(f,'140-2',byKey,'email',['address'],{}),null);
 assert.equal(selectedReferenceContact(f,'140-2',byKey,'email',['address'],{gcs:[...dirs.gcs,...dirs.gcs]}),null);
 assert.equal(selectedReferenceContact(f,'Same name',byKey,'email',['address'],dirs),null);
});
test('Form206 previews are role-specific, exact-ID matched and clearable',()=>{
 const a=field('architectLookupId','206-1','206-2'),e=field('structuralEngineerLookupId','206-1','206-3');
 assert.deepEqual(selectedReferenceContact(a,'206-2',byKey,'email',['address'],dirs),{email:'architect@example.test',address:'Architect address'});
 assert.deepEqual(selectedReferenceContact(e,'206-3',byKey,'email',['address'],dirs),{email:null,address:'Engineer address'});
 assert.equal(selectedReferenceContact(a,null,byKey,'email',['address'],dirs),null);
 assert.equal(selectedReferenceContact({...a,options:[{id:'206-3'}]},'206-3',byKey,'email',['address'],dirs),null);
});
test('currency and percent are UI-only affixes, not quantities or arbitrary numbers',()=>{
 assert.equal(projectFieldAffix({kind:'moneyText'}),'$');
 assert.equal(projectFieldAffix({kind:'percentText'}),'%');
 assert.equal(projectFieldAffix({kind:'number',section:'suppliers',key:'primaryConcreteAmount'}),'$');
 assert.equal(projectFieldAffix({kind:'number',key:'foundationContractAmount'}),'$');
 assert.equal(projectFieldAffix({kind:'integer',key:'squareFootageSF'}),null);
 const detail={fields:[{kind:'moneyText',key:'operationalContractAmount',editable:true,value:'10'},{kind:'percentText',key:'retention',editable:true,value:'5%'},{kind:'number',key:'primaryConcreteAmount',editable:true,value:9}]};
 assert.deepEqual(buildJisChanges(detail,{operationalContractAmount:'1250',retention:'7',primaryConcreteAmount:'0'}),{operationalContractAmount:'1250',retention:'7',primaryConcreteAmount:0});
});
test('save notifications reuse ActionToast and retain receipt/uncertain guards',()=>{
 assert.match(source,/<ActionToast message=\{notice\?\.message\} type=\{notice\?\.type\}/);
 assert.match(source,/setNotice\(\{type:'success'/);
 assert.match(source,/setUncertain\(true\);fieldsError=/);
 assert.match(source,/result.saved.includes\('metrics'\)/);
 assert.doesNotMatch(source,/notice&&<p/);
 assert.match(source,/expectedVersion:detail.entryVersion/);
 assert.match(source,/accepted.entryVersion!==/);
 assert.match(source,/useGcReference\(inspector\)/);
 assert.match(source,/requestSetup\('\/api\/project-setups\/authoring\/form206'/);
});
