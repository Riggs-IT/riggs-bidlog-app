// Advisory checklist only: NOT a Form 19-required-fields rule or a dispatch gate.
const FIELDS = [
  ['jobName','Project name','setup-section-basics'],['jobType','Project type','setup-section-basics'],['purpose','Purpose','setup-section-basics'],
  ['streetAddress','Street address','setup-section-location'],['city','City','setup-section-location'],['state','State','setup-section-location'],
  ['contractAmount','Starting contract amount','setup-section-contract'],['anticipatedStartDate','Anticipated start','setup-section-location'],
  ['gcLookupId','Verified GC','setup-section-parties'],['pmITUserId','Riggs PM','setup-section-riggs'],
  ['superintendentEid','Superintendent','setup-section-riggs'],
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
  const items=FIELDS.map(([field,label,sectionId])=>({field,label,sectionId,filled:populated(values[field]),
    unverified:unverified.includes(label) || (field==='gcLookupId' && unverified.includes('General contractor'))}));
  return {total:FIELDS.length,filled:FIELDS.length-missing.length,missing,unverified,items,
    advisory:true,dispatchReady:false};
}
