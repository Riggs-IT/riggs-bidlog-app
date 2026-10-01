import useGcReference from './useGcReference.js';
import { gcReference, contractorTokens, contractorFilterMatch } from './gcReference.js';
export { MULTIPLE_GCS, generalContractorNames, contractorFilterOptions } from './gcReference.js';

export function generalContractorDisplayText(value, fallback = '—', directory = gcReference.getSnapshot().directory) {
  const tokens = contractorTokens(value, directory);
  return tokens.length ? tokens.map(token => token.name).join(' · ') : fallback;
}

export function generalContractorFilterMatch(value, filterValue, allValue, directory = gcReference.getSnapshot().directory) {
  return contractorFilterMatch(value, filterValue, allValue, directory);
}

export function GeneralContractorDisplay({ value, fallback = '—', compact = false }) {
  const { directory } = useGcReference();
  const tokens = contractorTokens(value, directory);
  if (!tokens.length) return <span className="gc-empty">{fallback}</span>;
  const visible = compact ? tokens.slice(0, 2) : tokens;
  return (
    <div className={compact ? 'gc-display compact' : 'gc-display'} title={tokens.map(token => token.name).join(' · ')}>
      {visible.map(token => <span className="gc-chip" key={token.key}
        title={token.status === 'AMBIGUOUS' ? `${token.raw} — directory identity unresolved` : token.raw === token.name ? token.name : `${token.name} (source: ${token.raw})`}>
        {token.name}
      </span>)}
      {tokens.length > visible.length && <span className="gc-chip gc-chip-more">+{tokens.length - visible.length}</span>}
    </div>
  );
}
