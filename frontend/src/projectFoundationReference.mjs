// The project list is the existing Foundation commercial read model. Its
// total may fall back to Cognito, a bid or a projection; never label those
// fallback amounts as Foundation. The SQL job-detail ContractAmount is JIS.
export function foundationContractReference(project, jobListId) {
  const missing = {label:'Foundation Amount',amount:null};
  if (!project || jobListId == null || Number(project.jobListId) !== Number(jobListId)) return missing;
  const value = project.totalContractAmount;
  if (typeof value !== 'number' || !Number.isFinite(value)) return missing;
  switch (project.totalContractSource) {
    case 'FOUNDATION_REVISED_CONTRACT':
    case 'FOUNDATION_REVISED': // completed-project summary contract
      return {label:'Foundation Amount',amount:value};
    case 'FOUNDATION_ORIGINAL_CONTRACT':
      return {label:'Foundation Amount',amount:value};
    default:
      return missing;
  }
}
