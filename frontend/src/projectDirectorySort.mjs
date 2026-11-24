// Pending jobs have no numeric identifier. Blank is lower than any assigned number.
export function compareBlankJobNumbers(a,b,direction) {
  const blank=v=>v==null||String(v).trim()==='';
  const left=blank(a), right=blank(b);
  if(!left&&!right)return null;
  if(left&&right)return 0;
  return (left?-1:1)*(direction==='desc'?-1:1);
}

// Unnumbered projects are actionable and stay above numbered rows regardless of sort.
export function comparePendingProjects(a,b) {
  const pending=row=>Boolean(row?.setupId)&&row.jobListId==null&&row.jobNumber==null;
  return Number(pending(b))-Number(pending(a));
}
