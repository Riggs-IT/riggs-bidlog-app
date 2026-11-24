import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectMetricsEditor} from '../src/projectMetricsEditor.mjs';
const sid='b83c8aa6-558b-545e-8bf8-7779236745f8';
const response=body=>({ok:true,status:200,json:async()=>structuredClone(body)});
function setup(t,{canEdit=true,afterError=false,wrongIdentity=false,wrongReadback=false}={}){
  const state={setupId:sid,projectMetricId:1,revision:2,canEdit:true,squareFootage:'5000.0000',cubicYards:'50.0000'};
  const calls=[];let writes=0;
  const editor=createProjectMetricsEditor({setupId:sid,canEdit,newId:()=> 'ad76a88e-a605-4ef9-b069-cacc75bfc423',fetcher:async(url,o)=>{
    calls.push({url,method:o.method,headers:o.headers,body:o.body?JSON.parse(o.body):null});
    if(o.method==='GET'){
      if(writes&&afterError)throw Error('network lost');
      return response(wrongIdentity?{...state,setupId:'wrong'}:writes&&wrongReadback?{...state,cubicYards:'51'}:state);
    }
    writes++;const p=JSON.parse(o.body);
    if(p.setSquareFootage)state.squareFootage=p.squareFootage;
    if(p.setCubicYards)state.cubicYards=p.cubicYards;
    state.revision++;return response({...state,result:'UPDATED'});
  }});
  t.after(()=>editor.dispose());return {editor,state,calls,writes:()=>writes};
}
test('setup route writes SQL-only and verifies fresh readback with zero',async t=>{
  const h=setup(t);await h.editor.start();h.editor.edit('squareFootage','0');assert.equal(await h.editor.save(),true);
  assert.equal(h.writes(),1);assert.ok(h.calls.every(c=>c.url===`/api/project-setups/jis/${sid}/metrics`));
  const p=h.calls.find(c=>c.method==='PATCH');assert.equal(p.headers['X-Riggs-Setup-Write'],'1');assert.equal(p.body.squareFootage,'0');assert.equal(p.body.setCubicYards,false);assert.equal(p.body.expectedRevision,2);
  assert.equal(h.editor.getSnapshot().draft.cubicYards,'50');assert.equal(h.editor.getSnapshot().snapshot.revision,3);
});
test('stale revision blocks SQL PATCH',async t=>{const h=setup(t);await h.editor.start();h.editor.edit('squareFootage','6000');h.state.revision++;assert.equal(await h.editor.save(),false);assert.equal(h.writes(),0);});
test('Rodney cannot mutate even with unexpected canEdit response',async t=>{const h=setup(t,{canEdit:false});await h.editor.start();h.editor.edit('squareFootage','6000');assert.equal(await h.editor.save(),false);assert.equal(h.writes(),0);});
test('no replay after accepted save with unavailable readback',async t=>{const h=setup(t,{afterError:true});await h.editor.start();h.editor.edit('squareFootage','6000');assert.equal(await h.editor.save(),false);assert.equal(h.editor.getSnapshot().unresolved,true);assert.equal(await h.editor.save(),false);assert.equal(h.writes(),1);});
test('unrelated metric drift is not accepted',async t=>{const h=setup(t,{wrongReadback:true});await h.editor.start();h.editor.edit('squareFootage','6000');assert.equal(await h.editor.save(),false);assert.equal(h.editor.getSnapshot().unresolved,true);assert.equal(h.writes(),1);});
test('wrong SetupID is rejected before save',async t=>{const h=setup(t,{wrongIdentity:true});await h.editor.start();assert.equal(h.editor.getSnapshot().snapshot,null);assert.equal(await h.editor.save(),false);assert.equal(h.writes(),0);});
