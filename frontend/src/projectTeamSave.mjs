// One UI save action, two independent SQL transactions. Validate every dirty
// roster before the first write, and never replay a successful lane when the
// other lane fails. Each child still owns its revision and operation receipt.
export async function saveTeamRosters(lanes) {
  const plans=[];
  const saved=[];
  for(const {key,dirty,handle} of lanes){
    let plan;
    try{
      plan=handle?.prepareSave?.() ?? (dirty?{state:'blocked',message:'Roster unavailable. Reopen or reload before saving.'}:{state:'unchanged'});
    }catch{
      plan={state:'blocked',message:'Unable to prepare this roster. Reload before saving.'};
    }
    if(plan.state==='unchanged')continue;
    if(plan.state!=='ready'||typeof plan.run!=='function')return {ok:false,saved,failed:key,message:plan.message||'Roster not ready to save.'};
    plans.push({key,run:plan.run});
  }
  for(const {key,run} of plans){
    let result;
    try{result=await run();}catch{result={ok:false,message:'Save outcome not verified. Review the roster before retrying.'};}
    if(result?.committed===true)saved.push(key);
    if(result?.ok!==true||result?.committed!==true)return {ok:false,saved,failed:key,message:result?.message||'Roster save not verified.'};
  }
  return {ok:true,saved};
}

// Summaries are derived only from server-read/accepted receipt data, never
// from unsaved local draft selections. Keep unknown/loading states explicit.
export function teamSummary(internalAvailable,internal,external){
  const lanes=[...(internalAvailable?[['internal',internal]]:[]),['external',external]];
  return {
    members:lanes.flatMap(([lane,value])=>value?.status==='ready'?(value.members||[]).map(m=>({...m,lane})):[]),
    loading:lanes.some(([,value])=>!value||value.status==='loading'),
    unavailable:lanes.some(([,value])=>value?.status==='unavailable'),
    review:lanes.some(([,value])=>value?.status==='review'),
  };
}
