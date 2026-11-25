// The footer is a UI coordinator, not a transaction across SQL and Cognito.
// Each lane retains its own revision and operation receipt.
export async function saveProjectEditLanes({metricsDirty,fieldsDirty,saveMetrics,saveFields}) {
  const saved=[];
  for(const [key,dirty,save] of [['metrics',metricsDirty,saveMetrics],['fields',fieldsDirty,saveFields]]) {
    if(!dirty)continue;
    try {
      if(!await save())return {ok:false,saved,failed:key};
    } catch {return {ok:false,saved,failed:key};}
    saved.push(key);
  }
  return {ok:true,saved};
}
