# Bid Log — balance spacing finish and refreshed C4 review

**Prepared:** October 28, 2026. **Required clean base:** `8619df5a1350c0777b4f1fc8423d6e4080fc6a90`.
**Input:** refreshed `riggs-bid-log-app.zip`; archive SHA-256 `7dbc3b8cd6208eaf34aaf1d69f83e2b3b9acd14c175d7e5dbf28a982019be21c`.

## Refreshed source review

The ZIP comment identifies the above commit. All 299 source files match the
expected C4 tree (C4 baseline plus its exact payload), with no missing, extra or
mismatched files. This review reads the fresh ZIP; it does not reconstruct an old
patch tree in place of that ZIP. Archive identity is not a fresh host or serving
Cloud Run revision check.

The import map has 16 shared modules; the named staffing module is present and
the retired combined lifecycle/staffing filename is absent. Theme tokens remain
separate, with the accepted light/OLED values. The C4 ownership tests still pass.
The map, comments and selector index provide the editing locations requested by
the user. This is a bounded structure/source-contract review, not a claim that
all CSS is unused-code-free or that every runtime feature has been certified.
No further broad consolidation is proposed.

## Two observed spacing problems

1. In the By Project pivot, the flag and its amount lived inside the title's flex
   row. The taller stack vertically centered the name and pushed the initials
   below the whole stack. In the desktop browser fixture, text-to-initials gap was
   5px normally, about 14.64px with an amount, and about 6.56px with Pending
   Foundation. These measurements are fixture observations, not inferred screenshot
   pixel counts or universal production measurements.
2. The preceding `.projection-detail-grid` uses 12px tile gaps but zero outside
   margin. The balance card had only a 16px bottom margin. Its top gap was 0px.

## Changes

- `ProjectBillingPivot.jsx`: move the unchanged balance and schedule branches into
  a presentation-only `.pivot-project-statuses` group beside the title/team rows.
  Keep their original balance-before-schedule order, eligibility, values and callbacks.
- `05-project-pivot.css`: the right-hand status group spans the title and initials
  rows. Both the 3px grid gap and 2px compact badge margin are retained. Empty or
  deferred groups occupy no column/row. Context text spans the available width.
  Use normal flow, not absolute positioning or negative margins. Long teams may
  still wrap naturally beside simultaneous warnings; no fixed row height is added.
- `15-balance-presentation.css`: target the new pivot group for existing right
  alignment and colors; add a scoped 12px top margin only to an actual balance card.
  Retain the 16px gap below the card. Other table variants keep their markup.
- Add ten regression tests; update editing guide and selector index.

Only three runtime presentation files change: one JSX file and two CSS files.
The remaining four changed/new paths are one test and three documentation files.
No financial calculation, status classification, PM/Admin authorization, drawer
click logic, API, backend, dependency, SQL or worker changes. Existing tests remain
unchanged; no assertion is removed to accommodate the patch.

## Validation completed during preparation

- **648 selected dependency-free Node tests passed**, zero failures/skips, including
  all ten new spacing checks. React-dependent complete-suite testing remains a host gate.
- **160 Chromium layout cases passed**: light/OLED at 1440, 1100, 761, 760 and
  390px, active/combined tables, no/three/four people, long names, large amounts,
  empty/deferred flags and simultaneous schedule flags; normal, hover, horizontal
  scroll and print states. The focused-card keyboard outline was also checked.
- The original title-to-initials gap is now 5px in all tested normal/over/short/
  pending/deferred cases. For the standard team cases, row height and space above
  and below the identity match the no-amount row. Badge dimensions, flag/amount
  colors and project column widths remain unchanged. No amount/team overlap was
  detected. The top drawer gap is 12px and the bottom gap remains 16px.
- Browser fixtures use synthetic records and source-derived classes, not live
  application data or an authenticated React session. They use the same available
  fallback font on both sides, not the unavailable locked Public Sans package.
- The independent declaration checker admits only 13 explicit selector deltas.
  It checks unchanged theme contracts. The JSX checker removes the unchanged
  review branches and presentation wrapper and confirms the rest of the entire
  pivot source is unchanged (ignoring whitespace).
- Six positive/negative contract checks passed: approved source accepted; unapproved
  drawer gap, grid-span, theme-token and callback changes rejected; restored source
  accepted again.
- **24 real isolated Git fixture checks passed** for apply/idempotence/restore,
  manual-edit preservation, dirty/non-main refusal, missing/stale/incomplete QA
  refusal, approved commit and normal/repeated push. The fixture substituted its
  own local identities and synthetic QA records solely to test release guards;
  those records are not claimed as full application/Docker QA.
- JSX syntax validation and Python 3.11-compatible runner syntax passed.

Full React/Vite, backend, Docker and production acceptance were not performed in
this environment. No SQL reads/writes, credential use, bridge restart or deployment
was performed. This patch changes appearance only in the two requested areas;
it is not an appearance-preserving C4 refactor.

## Required host gates and recovery

The runner requires clean main at the exact refreshed base and matching approved
GitHub origin/main; all 299 baseline file hashes must match. It never resets new
work to satisfy that guard. Apply/restore are exact-path and hash guarded.

Full QA: focused + complete frontend tests (minimum 693 complete), backend tests
(minimum 352), frontend and production Docker builds, and scoped CSS/JSX/bundled-
import proof. Source-only mounts exclude ignored runtime files and are readable
by the non-root container. QA must match the exact source before commit.

Review the actual app locally on existing BarronLink port 8175 in both themes,
including no-amount, short, over, pending and simultaneous-warning rows; the drawer
with/without a balance card; narrow layouts; and unchanged sticky scrolling.
No project or projection save is required. Commit requires --visual-approved;
push is separate. Check the exact build and Cloud Run serving revision/traffic in
the Console after promotion. Before commit, restore returns to the accepted C4
source. After release, restore traffic to the prior revision first; use a reviewed
normal git revert for any source rollback. Do not move the existing backup tags.

After acceptance, CSS is closed out. Next work remains exploratory, read-only
Active Projects/Form 19 checks, without opening write gates or changing staffing.
