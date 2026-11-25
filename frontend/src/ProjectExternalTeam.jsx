import {useCallback,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {createSetupOperationId,requestSetup} from './projectSetupAuthoring.mjs';
import {externalTeamScope,normalizeExternalContacts,validExternalTeam} from './projectExternalTeam.mjs';
import './ProjectExternalTeam.css';

export default function ProjectExternalTeam({setupId,jobListId,canEdit,blocked=false,reloadKey=0,onDirtyChange,onSavingChange,ref,coordinating=false,onSummaryChange}){
  const scope=useMemo(()=>externalTeamScope(setupId,jobListId),[setupId,jobListId]);
  const [data,setData]=useState(null),[rows,setRows]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[review,setReview]=useState(false);
  const inFlight=useRef(false),mounted=useRef(false),loadEpoch=useRef(0);
  const editable=canEdit&&data?.canEdit===true;
  const dirty=!!data&&JSON.stringify(rows)!==JSON.stringify(data.contacts);
  const disabled=!editable||blocked||loading||saving||review;
  const inputsDisabled=disabled||coordinating;
  useEffect(()=>{onSummaryChange?.({status:review?'review':loading?'loading':data?'ready':'unavailable',members:(data?.contacts||[]).map(c=>({key:c.email,name:c.name}))});},[data,loading,review,onSummaryChange]);
  useEffect(()=>{onDirtyChange?.(dirty||review);},[dirty,review,onDirtyChange]);
  useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange]);
  useEffect(()=>()=>onSavingChange?.(false),[onSavingChange]);
  useEffect(()=>{if(!dirty&&!review&&!saving)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,review,saving]);
  const load=useCallback(async(signal)=>{
    if(!scope)return;
    const epoch=++loadEpoch.current;
    setLoading(true);setError('');setNotice('');
    try{
      const value=await requestSetup(scope.url,{signal});
      if(!mounted.current||signal?.aborted||epoch!==loadEpoch.current)return;
      if(!validExternalTeam(value,scope))throw Error('Invalid contact-list response.');
      setData(value);setRows(value.contacts);setReview(false);
    }catch(e){if(mounted.current&&!signal?.aborted&&epoch===loadEpoch.current){setError('Unable to load external team.');}}
    finally{if(mounted.current&&!signal?.aborted&&epoch===loadEpoch.current)setLoading(false);}
  },[scope]);
  useEffect(()=>{
    mounted.current=true;const controller=new AbortController();setData(null);setRows([]);setReview(false);void load(controller.signal);
    return()=>{mounted.current=false;controller.abort();++loadEpoch.current;};
  },[load,reloadKey]);
  function edit(i,key,value){if(inputsDisabled)return;setRows(old=>old.map((r,j)=>j===i?{...r,[key]:value}:r));setError('');setNotice('');}
  function remove(i){if(inputsDisabled)return;setRows(old=>old.filter((_,j)=>j!==i));setError('');setNotice('');}
  function prepareSave(){
    if(!dirty&&!review)return {state:'unchanged'};
    if(disabled||!data||inFlight.current||!scope)return {state:'blocked',message:'Reload or resolve the external contact list before saving.'};
    let body;
    try{body={operationId:createSetupOperationId(),expectedRevision:data.revision,contacts:normalizeExternalContacts(rows)};}
    catch(e){setError(e.message);return {state:'blocked',message:e.message};}
    return {state:'ready',run:()=>save(body)};
  }
  useImperativeHandle(ref,()=>({prepareSave}));
  async function save(body){
    if(disabled||!dirty||inFlight.current||!scope)return {ok:false,committed:false};
    inFlight.current=true;setSaving(true);onSavingChange?.(true);setError('');setNotice('');
    try{
      const value=await requestSetup(scope.url,{method:'PUT',body});
      if(!mounted.current)return {ok:false,committed:false};
      if(!validExternalTeam(value,scope,body)||value.currentRevision!==value.revision)throw Error('Receipt not current.');
      setData(value);setRows(value.contacts);setReview(false);setNotice('External team saved.');return {ok:true,committed:true};
    }catch(e){if(mounted.current){setReview(true);setError(e.status===409?'The contact list changed. Reload before editing again.':'Save not verified. Reload to review the stored list before making another edit.');}return {ok:false,committed:false,message:'External team save not verified. Reload to review.'};}
    finally{inFlight.current=false;if(mounted.current){setSaving(false);onSavingChange?.(false);}}
  }
  if(!scope)return null;
  return <div className="external-team-list">
    <p className="external-team-description">Recipients for future weekly wrap-ups. Not added to the internal project email group.</p>
    {loading&&<small role="status">Loading external team…</small>}
    {error&&<p className="bid-edit-message error" role="alert">{error}</p>}
    {notice&&<small role="status">{notice}</small>}
    {data&&<>
      {rows.length===0&&<small>No external contacts.</small>}
      {rows.length>0&&<div className="external-team-table">
        <div className="external-team-row external-team-heading"><span>Name</span><span>Email</span><span/></div>
        {rows.map((row,i)=><div className="external-team-row" key={i}>
          {editable?<><label className="bid-edit-field"><input aria-label={`Contact ${i+1} name`} maxLength={200} placeholder="Name" value={row.name} disabled={inputsDisabled} onChange={e=>edit(i,'name',e.target.value)}/></label><label className="bid-edit-field"><input aria-label={`Contact ${i+1} email`} type="email" maxLength={254} placeholder="Email address" value={row.email} disabled={inputsDisabled} onChange={e=>edit(i,'email',e.target.value)}/></label><button type="button" className="secondary-button" aria-label={`Remove contact ${i+1}`} disabled={inputsDisabled} onClick={()=>remove(i)}>Remove</button></>:<><span>{row.name}</span><span>{row.email}</span><span/></>}
        </div>)}
      </div>}
      {editable&&<div className="external-team-actions">
        <button type="button" className="secondary-button" disabled={inputsDisabled||rows.length>=100} onClick={()=>{setRows(old=>[...old,{name:'',email:''}]);setNotice('');setError('');}}>+ Add Contact</button>
        <button type="button" className="secondary-button" disabled={inputsDisabled||!dirty} onClick={()=>{setRows(data.contacts);setError('');setNotice('');}}>Discard</button>
      </div>}
    </>}
    {(!data||review)&&!loading&&<button type="button" className="secondary-button" disabled={saving||blocked||coordinating} onClick={()=>{if(!dirty&&!review||window.confirm('Reload the saved external contact list? Unsaved entries will be discarded.'))void load();}}>Reload External Team</button>}
  </div>;
}
