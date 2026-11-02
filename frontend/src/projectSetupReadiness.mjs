// Advisory checklist only: NOT a Form 19-required-fields rule or a dispatch gate.
const FIELDS = [
  ['jobName','Project name'],['jobType','Project type'],['purpose','Purpose'],
  ['streetAddress','Street address'],['city','City'],['state','State'],
  ['contractAmount','Starting contract amount'],['anticipatedStartDate','Anticipated start'],
  ['gcLookupId','Verified GC'],['pmITUserId','Riggs PM'],
  ['superintendentEid','Superintendent'],
];
const populated=value=>value!==null && value!==undefined &&
  (typeof value!=='string' || value.trim()!=='') &&
  (!Array.isArray(value) || value.length>0);
export function setupReadiness(values={}, directory=null) {
  const missing=FIELDS.filter(([key])=>!populated(values[key])).map(([,label])=>label);
  const unverified=[];
  if (directory) {
    for(const [field,group,label] of [
      ['gcLookupId','gcs','General contractor'],
      ['pmITUserId','itUsers','Riggs PM'],
      ['superintendentEid','employees','Superintendent']
    ]) {
      const id=values[field];
      if (populated(id) && !directory[group].some(item=>String(item.id)===String(id)))
        unverified.push(label);
    }
  }
  return {total:FIELDS.length,filled:FIELDS.length-missing.length,missing,unverified,
    advisory:true,dispatchReady:false};
}
