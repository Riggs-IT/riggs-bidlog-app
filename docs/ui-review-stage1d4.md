# Stage 1D4 — review controls and contextual filters

Applies after the working Stage 1D3 PM-first overview. No SQL migration.

## Behavior
- One refresh icon beside the notification bell on Projected Billings; the same
  icon in existing manual notification, Projects, and Bid Log refresh controls.
- PM panel refresh is automatic after writes and on its existing visible read
  cadence. The redundant normal button is removed; a read-only retry remains
  only when a fetch fails. No write replay and no dirty-draft reset.
- Show: Baseline / Running totals are pressed buttons using the existing theme.
- * means a System Baseline-derived amount, never missing PM coverage. PM amounts
  remain primary. Blank months are dashes; entered zeros remain zeros.
- Repeated partial-subtotal header wording removed. Coverage is disclosed once
  in expandable About blank months and in amount/header titles, without inventing
  values, changing stored amounts, or removing CSV coverage information.
- All overview filters derive from the chosen source, date range, search and
  other active filters. A filter retains its own represented alternatives.
  No-money-in-range projects/bids do not create choices (entered zero counts).
  Unavailable selections are cleared; raw GC selections upgrade to a canonical
  identity when the directory arrives, rather than silently selecting All.
- Project source count says projects in range, not every historical summary row.
- /api/active-projects explicitly excludes projectCompleted=true. Projects also
  filters older cached responses and de-duplicates the optional Completed rows.
  Completion is not inferred from schedule dates. The existing overview's
  completed-project actual-history behavior and Completed Billings remain intact.
- Project directory now has a contextual canonical GC filter. Bid Log honors its
  due-date/quick/search/PM/type scope; Completed Billings honors completion year
  and its other filters. These directories do not inherit a hidden overview date.
- No fuzzy company merging: directory IDs, duplicate-name records, all selected
  bid GCs, legacy writes and unmatched persisted text stay intact. Case/typography
  and the previously approved A.R. Mays alias are resolved only unambiguously.
  Full contact-directory access remains editor-only; viewers use source names.

## SQL work remains unfinished
The Stage 1C3 installers reported rollback/no preparation committed. They are
not a dependency of this patch and must not be rerun. Protected baseline storage,
forward-only redistribution after locks, reporting-cutoff configuration and the
contract-review replacement for the baseline-total save rule still require
isolated SQL-engine testing and a separate controlled rollout. This stage neither
installs those objects nor changes RequireBaselineTotalMatch or attention logic.

## Deployment
Only the local Bid Log container on BarronLink port 8175 is rebuilt/recreated.
No bridge, Accounting resilience code, SQL, workers, .env, dependency versions,
Git staging/commits/pushes, or Cloud Run deployment is changed. Rollback restores
Stage 1D3 source and the recorded preceding local image, preserving older work.
