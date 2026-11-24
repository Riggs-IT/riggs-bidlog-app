import {requestSetup} from './projectSetupAuthoring.mjs';
import {validateJisList,validateJisDetail} from './unnumberedProjectEditor.mjs';
import {visibleProjects} from './projectVisibility.mjs';

export function unnumberedDirectoryRow(row, detail=null) {
  if(detail && (detail.setupId.toLowerCase()!==row.setupId.toLowerCase() || detail.cognitoEntryId!==row.cognitoEntryId || detail.revision!==row.revision)) throw Error('Project identity changed');
  const fields=new Map((detail?.fields||[]).map(field=>[field.key,field.value]));
  const get=key=>fields.get(key)??null;
  const start=get('anticipatedStartDate');
  const validStart=typeof start==='string'&&/^\d{4}-\d{2}-\d{2}/.test(start)&&Number.isFinite(Date.parse(start.slice(0,10)+'T12:00:00'))?start.slice(0,10):null;
  return {...row,jobName:detail?.jobName??row.jobName,jobListId:null,jobNumber:null,projectCompleted:false,
    projectType:get('jobType'),purpose:get('purpose'),streetAddress:get('streetAddress'),cityStateZip:get('cityStateZip'),
    generalContractors:get('gcName')||get('gcLookupId'),pm:get('pmITUserId'),apm:get('apmITUserId'),pe:get('peITUserId'),superintendent:get('superintendentEid'),
    effectiveStartDate:validStart,estimatedDurationMonths:get('estimatedDurationMonths'),
    projectedCompletionDate:null,totalContractAmount:null,operationalContractAmount:get('operationalContractAmount'),
    squareFootage:get('squareFootageSF'),cubicYards:get('cubicYardsCY')};
}
export async function readUnnumberedDirectory({signal,fresh=false,request=requestSetup}={}) {
  const rows=visibleProjects(validateJisList(await request('/api/project-setups/jis',{signal})));
  // Currently the server returns one authorized pilot. Limit supplemental
  // detail reads to that bounded case; a future portfolio needs a bulk summary.
  if(rows.length!==1)return {items:rows.map(row=>unnumberedDirectoryRow(row)),partial:rows.length>1};
  const row=rows[0];
  try {
    const detail=validateJisDetail(await request(`/api/project-setups/jis/${row.setupId}${fresh?'?fresh=true':''}`,{signal}),row.setupId);
    return {items:[unnumberedDirectoryRow(row,detail)],partial:false};
  }catch(error){
    if(signal?.aborted||error?.name==='AbortError')throw error;
    return {items:[unnumberedDirectoryRow(row)],partial:true};
  }
}
