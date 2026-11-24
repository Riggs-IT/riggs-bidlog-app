// Retain provider choice ordering, like the old native multiple select.
// Historical values may be removed, but never selected as a new choice.
export function toggleSubmittal(choices, current, choice) {
  const allowed=Array.isArray(choices)?choices:[];
  const selected=Array.isArray(current)?current:[];
  if(!selected.includes(choice)&&!allowed.includes(choice))return selected;
  const next=new Set(selected);
  if(next.has(choice))next.delete(choice);else next.add(choice);
  return [...new Set([...allowed,...selected])].filter(value=>next.has(value));
}
