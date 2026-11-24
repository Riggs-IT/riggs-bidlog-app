import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordedProjectValue} from '../src/projectEditorLayout.mjs';
import {buildJisChanges} from '../src/unnumberedProjectEditor.mjs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
test('recorded status distinguishes false, true and unknown; no coercion',()=>{
  assert.equal(recordedProjectValue(true,'boolean'),'Yes');
  assert.equal(recordedProjectValue(false,'boolean'),'No');
  for(const v of [null,undefined,'false','true',0,1,{},[]])assert.equal(recordedProjectValue(v,'boolean'),'Not recorded');
  for(const v of [null,undefined,'','  ',false,0])assert.equal(recordedProjectValue(v,'text'),'Not recorded');
  assert.equal(recordedProjectValue('2027-02-03','date'),'2027-02-03');
  assert.equal(recordedProjectValue('PENDING - 4970','text'),'PENDING - 4970');
});
test('both compact editors show closeout and recorded folder state as readouts',()=>{
  const pending=read('UnnumberedProjectEditor.jsx'),numbered=read('ActiveProjectCognitoSections.jsx');
  for(const source of [pending,numbered]){
    assert.match(source,/Recorded closeout status · read-only/);
    assert.match(source,/Folder created \(recorded\)/);
    assert.match(source,/recordedProjectValue\(value,/);
  }
  assert.match(pending,/field.lane==='workflow'\|\|field.lane==='accountingReview'\)return <div className="project-information-item"/);
  assert.match(pending,/OH&P and lender details · read-only/);
  assert.match(pending,/f.key!=='foundationContractAmount'/);
  assert.match(pending,/filter\(f=>f.lane==='workflow'\).map\(renderField\)/);
});
test('read-only workflow/accounting fields cannot be serialized by the ordinary save path',()=>{
  const fields=[['projectCompleted','boolean',false],['dateProjectCompleted','date',null],['retentionCollected','boolean',false],['warrantyWork','boolean',false],['folderCreated','boolean',false],['teamDistributionList','email',null],['ohp','text',null],['lender','text',null],['lenderStreet','text',null],['lenderCityStateZip','text',null]].map(([key,kind,value])=>({key,kind,value,editable:false}));
  fields.push({key:'scope',kind:'textarea',value:'Old',editable:true});
  assert.deepEqual(buildJisChanges({fields},{projectCompleted:true,dateProjectCompleted:'2027-02-03',retentionCollected:true,warrantyWork:true,folderCreated:true,teamDistributionList:'x@example.test',ohp:'5%',lender:'L',lenderStreet:'S',lenderCityStateZip:'Z',scope:'New'}),{scope:'New'});
});
