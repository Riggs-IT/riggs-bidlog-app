import {useEffect,useRef,useState} from 'react';
import {cancelEmptyBuildingDraft} from './projectEditorLayout.mjs';
import {requestSetup,createSetupOperationId} from './projectSetupAuthoring.mjs';
import {validateNumberedJisDetail,buildJisChanges,referenceValue} from './unnumberedProjectEditor.mjs';

export default function useNumberedProjectJis(jobListId,enabled,onSaved){
  const [detail,setDetail]=useState(null),[values,setValues]=useState({}),[loading,setLoading]=useState(true),[error,setError]=useState(null),[busy,setBusy]=useState(false),[review,setReview]=useState(false),[cycle,setCycle]=useState(0);
  const active=useRef(false),saving=useRef(false);
  const path=`/api/project-setups/jis/numbered/${jobListId}`;
  useEffect(()=>{active.current=true;const abort=new AbortController();setLoading(true);setError(null);
    requestSetup(path+(cycle?'?fresh=true':''),{signal:abort.signal}).then(body=>{if(abort.signal.aborted)return;setDetail(validateNumberedJisDetail(body,jobListId));setReview(false);setValues({});})
      .catch(e=>{if(!abort.signal.aborted){setDetail(null);setError(e.message||'Additional project information unavailable.');}}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>{active.current=false;abort.abort();};},[path,cycle,jobListId]);
  const dirty=!!detail&&Object.keys(values).some(k=>JSON.stringify(values[k])!==JSON.stringify(referenceValue(detail.fields.find(f=>f.key===k))));
  useEffect(()=>{if(!dirty&&!review)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,review]);
  const canEdit=enabled&&detail?.writeEnabled===true&&!loading&&!busy&&!review;
  function change(field,value){if(canEdit&&field.editable)setValues(old=>({...old,[field.key]:value}));}
  function cancelBuildingEdit(field){if(canEdit&&field.editable)setValues(old=>cancelEmptyBuildingDraft(old,field));}
  function discard(){if(!busy&&!review)setValues({});}
  function reload(){if(!busy)setCycle(c=>c+1);}
  async function save(){if(!dirty||!canEdit||saving.current)return false;let changes;
    try{changes=buildJisChanges(detail,values);}catch(e){setError(e.message);return false;}
    if(!Object.keys(changes).length){setValues({});return true;}
    saving.current=true;setBusy(true);setError(null);
    try{const body=await requestSetup(path,{method:'PATCH',body:{operationId:createSetupOperationId(),expectedRevision:detail.revision,expectedEntryId:detail.cognitoEntryId,expectedVersion:detail.entryVersion,changes}});
      const accepted=validateNumberedJisDetail(body.detail,jobListId);
      if(!['VERIFIED','NO_CHANGE'].includes(body.result)||accepted.cognitoEntryId!==detail.cognitoEntryId||accepted.jobNumber!==detail.jobNumber||accepted.entryVersion!==detail.entryVersion+(body.result==='VERIFIED'?1:0))throw Error('Receipt mismatch');
      if(active.current){setDetail(accepted);setValues({});onSaved?.();}return true;
    }catch(e){if(active.current){setReview(true);setError('Save not verified. Reload details before another save.');}return false;}
    finally{saving.current=false;if(active.current)setBusy(false);}
  }
  return {detail,values,loading,error,busy,review,dirty,canEdit,change,cancelBuildingEdit,discard,reload,save};
}
