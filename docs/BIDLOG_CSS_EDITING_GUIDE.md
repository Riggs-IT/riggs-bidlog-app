# Bid Log CSS editing guide

**Current editing map: C4 plus Balance Spacing Finish — October 28, 2026.**
**Starting release:** accepted C3. The installer binds its actual clean host SHA only after verifying the complete C3 source tree and its C2 parent.
C4 finishes notification, staffing and view-only notice ownership; it preserves the accepted OLED/light appearance and C1–C3 layout contracts.

## Start here

Open `frontend/src/styles.css` for the shared stylesheet's load-order map. Open
`frontend/src/theme.css` for the two theme imports. Neither entry point is a place
to append another override. Edit the owning module instead.

The two most useful files for routine visual edits are:

- **`frontend/src/styles/theme-tokens.css`** — light/OLED colors, shared font family,
  status colors, header-control colors, and ON/OFF track/thumb colors.
- **`frontend/src/styles/05-project-pivot.css`** — the monthly project table's base
  columns, name/metadata typography, value cells, and frozen-column geometry.

`docs/BIDLOG_CSS_SELECTOR_INDEX.md` lists the actual selectors, their owning files,
and responsive/print contexts. Use your editor's Find in Files when a property has
both a base rule and a later responsive or state-specific rule.

## File map

Paths below are under `frontend/src/`.

| File | What to edit here | Related files / cautions |
|---|---|---|
| `styles.css` | Ordered list of shared modules | Do not alphabetize or append overrides. |
| `theme.css` | Ordered theme entry point | Remains after `styles.css` in `main.jsx`. |
| `styles/theme-tokens.css` | Light/OLED surface and text colors, semantic colors, header colors, toggle tokens, font family | First root block is light/shared; second replaces values for dark. |
| `styles/theme-surfaces.css` | Shared microtypography and dark component color mapping | Shared font sizes stay outside dark-only selectors. |
| `styles/01-foundations.css` | App header/navigation, common buttons/inputs, base tables, login, shared page layout and accountability overview | Contains its own responsive rules. Notification-specific geometry is in 08. |
| `styles/02-billing-drawers.css` | Active/completed drawer shells, shared cards, label/value/source typography, curve help, source comparison and forecast detail grids | Includes the former 04/07 card refinements and their breakpoints. PM editor stays in 03; closeout-specific layout stays in 14. |
| `styles/03-pm-projections.css` | PM editor, history, print behavior, and ON/OFF policy-switch geometry | Toggle colors belong in theme tokens, not hardcoded here. |
| `styles/04-projected-workspace.css` | Landing table metadata, sorting, monthly-margin display and negative-money utility | Drawer cards/source comparison moved to 02. Detailed pivot columns remain in 05. |
| `styles/05-project-pivot.css` | Pivot columns/sticky offsets, project names and values, normal/floating controls, month navigation, header totals and shared metric tracks | C3 owns these together, including 760px and print variants. Shared row states stay in 12; flags in 13/15. |
| `styles/06-project-references.css` | Three reference cards, originating-bid finder/disclosure, change-order popovers and basic team metadata | The final reference-card grid and spacing now live here too. Curve-help geometry lives in 02. |
| `styles/07-detail-layout-and-filters.css` | Side-filter drawer and completed-directory filters, sorting and lifecycle cells | Filename retained to avoid import churn. It no longer owns billing-card or reference-card overrides. |
| `styles/08-notifications-and-inputs.css` | Complete bell/count/panel/action-card presentation; separate PM correction and potential-bid input sections | OLED counter ink/fill is in `theme-surfaces.css`; alert classification is not CSS. |
| `styles/09-bid-log.css` | Bid Log directory, summaries, table, notes, editor fields and GC picker | Lifecycle component polish stays in its existing separate file. |
| `styles/10-active-projects.css` | Active Projects directory, floating job editor, Form 19 read-only sections and Management notices/watermark | Does not control write permission or test-job eligibility; staffing is in 11a. |
| `styles/11-lifecycle-feedback.css` | Lifecycle navigation and refresh toasts | Renamed in C4; no staffing rules remain here. Month controls/header totals stay in 05. |
| `styles/11a-active-project-staffing.css` | Current Superintendent/Foremen, future Organizer plans, readouts, disabled states and 980px/760px variants | Loaded immediately after 11, at the original staffing position. Current assignments and scheduled plans are distinct. |
| `styles/12-table-teams-and-zebra.css` | Compact page heading, shared employee badges/title ellipsis, cross-workspace widths, zebra and hover/completed states | Pivot column geometry moved to 05. Keep row shading continuous on frozen identity cells. |
| `styles/13-financial-review-and-metrics.css` | Needs Rebalance/Pending Foundation and schedule flags, selection states, projection-jump highlighting | Metric lanes stay in 05; notification cards in 08; Management notices in 10. No classification, calculation or authorization is performed in CSS. |
| `styles/14-completed-closeout.css` | Completed contract ledger, progress chart, historical context and directory hints | Scoped to the completed report; do not turn it into a generic drawer reset. |
| `styles/15-balance-presentation.css` | Final right-aligned flag/whole-dollar amount stack and clickable balance card | Role-dependent click actions remain in the existing React components. |

### Existing component-owned styles stay where they are

`ViewControls.css` owns refresh/show controls. `ProjectionDisplay.css` owns PM/No PM
selection controls. `ReviewControls.css` owns its small review-control styles.
`ActiveProjectGeneralEditor.css` and `ActiveProjectSaveReview.css` remain scoped to
those components. Bid lifecycle, merge and CSV dialogs retain their own files.
The four Administration stylesheets are unchanged.

This is deliberate: moving these component imports would change their relationship
to the shared styles. The consolidation does not merge unrelated components into a global file.

## Common edits

### Change the dark background, not the status colors

In `styles/theme-tokens.css`, find `:root[data-theme="dark"]`:

```css
--bg: #0c0c0c;          /* page */
--surface: #191919;     /* cards and primary surfaces */
--surface-2: #202020;   /* secondary surfaces */
--surface-3: #292929;   /* raised surfaces */
```

These are the accepted OLED values, not proposed replacements. Change only the
needed token. Keep `--pending-foundation` blue and `--warning` amber; neither is
an ordinary navigation accent. Keep employee colors supplied by the existing
badge identity code rather than introducing employee-specific CSS.

### Make text larger in both themes

Edit the shared selector in its owning workspace module. For example, pivot
project names and monthly values are in 05. Bid Log directory typography is in
09; Active Projects directory typography is in 10. Shared tiny labels are mapped
in the opening section of `theme-surfaces.css` under `:root :is(...)`.

Do not add `font-size` inside a dark-only selector to fix readability. That was
the cause of the earlier light/dark mismatch. Preserve the accepted badge sizing,
table widths and header heights unless intentionally changing their geometry.

### Change PM/No PM selected styling

Edit `.projection-source-count-toggle.active` in `ProjectionDisplay.css`.
It intentionally uses the neutral `--accent`/`--text` tokens. It is not a financial
status flag. Both selected means both sources are included; styling must not
imply that the two toggles are a single-choice radio group.

### Change the notification number

Edit `.notification-count` in 08 for dimensions/font sizing. The accepted shared
size is 22px high with 12px bold digits. Its OLED foreground and background are in
`theme-surfaces.css` under the exact dark `.notification-count` selector. Test
one-digit, two-digit, and `99+` display, plus keyboard focus on the bell.

### Change a policy switch

Edit `--toggle-on-*` and `--toggle-off-*` in `theme-tokens.css` for colors. Edit
`.pm-policy-switch*` in 03 for geometry/focus. The accepted dark ON state has a
light track and dark thumb; OFF has a dark track and light thumb. Keep ON/OFF text,
thumb position, `aria-checked`, disabled gating and keyboard focus intact.

### Change balance display layout

Edit 15 for the table status/amount stack and compact detail card. Edit 13 for
semantic flag colors and selection states. Whole-dollar table amounts, exact
hover/drawer values, deferred cold-start classification, verified-cohort retention,
and PM/Admin actions are existing JavaScript behavior, not formatting to rebuild
inside CSS.

### Change sticky table sizing

Start in **05** and review `ProjectBillingPivot.jsx` / `useStickyTableHeader.js`
when changing geometry. Source-dependent frozen offsets, metric-lane compaction,
column widths and the floating header form one layout contract. The shared table
module 12 still owns zebra/hover colors, but not pivot column widths. Do not
change a visible header's width without checking body cells and the cloned
header at both sides of 760px. C3 deliberately changes none of these values.

## Drawer editing recipes — C2

All paths in this table are relative to `frontend/src/styles/`.

| You want to change… | File and selector / section |
|---|---|
| Active drawer width or internal scrolling | `02-billing-drawers.css`: `.billing-drawer`, `.billing-drawer-body` |
| Completed drawer scrolling/padding | `02-billing-drawers.css`: `.completed-drawer-scroll`; closeout-specific refinements remain in 14 |
| PM/GC/location card spacing | `02-billing-drawers.css`: PROJECT IDENTITY GRID and SHARED CARD RHYTHM |
| Card label, value or source-note typography | `02-billing-drawers.css`: CARD LABELS / CARD VALUES / shared supporting text |
| Curve-help size, anchor or stacking | `02-billing-drawers.css`: `.billing-curve-help-popover` — one base definition |
| Source comparison disclosure | `02-billing-drawers.css`: SOURCE COMPARISON DISCLOSURE |
| Forecast start/duration/history grid | `02-billing-drawers.css`: `.projection-detail-grid` plus its existing media queries |
| Three Curve / Original Bid / Change Order cards | `06-project-references.css`: REFERENCE CARDS, `.project-setup-flags`, direct-child rules |
| The side-filter panel | `07-detail-layout-and-filters.css`: SIDE FILTER DRAWER |
| Completed-directory advanced filters | `07-detail-layout-and-filters.css`: COMPLETED PROJECT ADVANCED FILTERS |

Do not copy a normal desktop grid rule below its narrow-screen variants. For
example, `.projection-detail-grid` has five desktop columns and its existing
1050px/700px variants. Moving the desktop declaration below those rules would
change the layout even without changing a number.

## Pivot editing recipes — C3

The following layout selectors now all live in `styles/05-project-pivot.css`.
The same pivot is reused for Completed Billings history; test that view too.

| You want to change… | Find this section / selector |
|---|---|
| Source / Job / Project widths | Base column rules at the top; preserve matching sticky offsets |
| Active-only vs potential-only left offsets | SOURCE-AWARE IDENTITIES |
| Probability width and frozen left position | PROBABILITY LANE, including the 760px variants |
| Team / GC / Contract-SF-CY column widths | AUXILIARY COLUMNS and PROJECT VALUES |
| Project name, clipping, or team/context spacing | Project / Bid identity; shared employee badge geometry remains in 12 |
| All / Projected / Actual / Variance control geometry | `.project-pivot-toolbar`, `.project-pivot-metric-toggle` |
| Horizontal month slider and disabled state | COMPACT MONTH NAVIGATION |
| Floating control reveal and coverage chips | `.floating-table-controls` and `.project-pivot-sticky-coverage` |
| Month label, totals and activity count alignment | HEADER TOTALS |
| Shared P/A/Variance/Margin lane and pinning | Values All — sticky shared metric labels |
| Three tracks without margin / two tracks for completed history | `.pivot-no-margin` / `.pivot-history-only` |
| Small comparable-variance indicator | `.pivot-variance-mode-indicator` |

**Do not flatten the remaining contexts.** The desktop and 760px rules are
intentional. The late project-column `background-clip` rule must remain after
the shared `th` background shorthand; combining them changes header painting.
There is a nearby comment describing that dependency. Source count controls in
`ProjectionDisplay.css` still own their selected color; C3 only owns their
floating-toolbar geometry. Semantic status/amount styles remain in 13/15.

## Notification and staffing editing recipes — C4

| You want to change… | File / section |
|---|---|
| Bell, counter position, panel size or list scrolling | `08-notifications-and-inputs.css`: TOPBAR NOTIFICATIONS |
| Full-card notification action, heading, supporting copy or context | Same file: NOTIFICATION ACTION CARDS; keep the basic item rules before their refinements |
| Management preview notice, watermark or Cognito guide | `10-active-projects.css`: MANAGEMENT VIEW-ONLY PRESENTATION |
| Current Superintendent/Foreman readouts and select controls | `11a-active-project-staffing.css`: current assignment and Project Team sections |
| Future Organizer row fields, notes and effective date/status | Same file: Project Team staffing editor and Organizer grid |
| Staffing narrow layout | Same file: 980px and 760px media queries, retaining their order |
| Lifecycle navigation or refresh feedback | `11-lifecycle-feedback.css` |

The old `11-lifecycle-feedback-and-staffing.css` is removed, not left as a second
copy. The new staffing import directly follows the lifecycle/feedback import;
this preserves the original global position of the extracted block.

## What has actually been consolidated

**C1, accepted:** removed 255 earlier declarations, 54 resulting empty rule blocks
and 2 empty media wrappers; split the old monolith into 15 ordered modules and
separated palette tokens from theme mappings. Those are historical C1 counts, not
claims about future edits or measured runtime speed.

**C2:** shared drawer cards, source comparison, forecast detail grids and their
responsive variants now have one owning module. The three project-reference
cards own their final geometry in module 06. Nine split top-level definitions
were merged, and seven superseded selector-specific declarations were removed.
Splitting one shared selector list adds one physical declaration, so the net
shared stylesheet reduction is six declarations and ten rule blocks. Useful
comments intentionally offset most of the byte reduction.

The remaining responsive, print, child-versus-descendant and closeout-specific
rules are intentional. C2 is not a global flattening of all CSS and does not
change palette, fonts, financial calculations, roles, PM actions or API behavior.
Use the regenerated selector index to find these relationships.

**C3:** pivot layout fragments formerly in 06, 08, 11, 12 and 13 now belong
with the base pivot in 05. Twelve split base definitions are consolidated.
All per-selector/property/context contracts are retained, with zero removed
selector-specific declarations. Physical rule blocks decrease from 1,622 to
1,613; physical declarations increase from 5,311 to 5,324 because shared selector
lists are separated to give each component a single editable definition. This
is a maintainability change, not a performance or payload-reduction claim.

**C4:** action-card notification styles move from 13 into 08; Management notices
move from 13 into 10; the contiguous staffing/Organizer block is extracted from
11 into 11a at the same cascade position. The remaining 11 file is renamed to
match its purpose. No selector-specific declarations are deleted or changed;
this final pass is ownership cleanup, not a size/performance improvement.

## CSS workstream closeout

After C4 full QA, local acceptance and production verification, close this CSS
consolidation workstream and proceed to read-only Active Projects exploration.
Do not create another generic cleanup stage solely because selectors repeat.
Base/state/responsive/print selectors, theme mappings, shared badges, shared row
states, completed closeout refinements and documented sticky dependencies are
intentional. Dead-CSS removal cannot be justified by a literal text search alone.

Keep the two user-created Git checkpoint tags: `backup-pre-css-consolidation-2026-10-27`
(accepted OLED before structural consolidation) and `backup-pre-oled-theme-2026-10-27`
(accepted balance UI before the theme experiments). Do not move those tags.
They preserve tracked application source, not SQL data, secrets or cloud configuration.

Before a future edit, find the owner here or in `BIDLOG_CSS_SELECTOR_INDEX.md`,
inspect the winning rule, and change that rule. Do not add overrides to the entry
points. Revalidate your actual change rather than reusing a historical QA marker.

## Balance spacing finish — October 28, 2026

This is a small appearance correction after C4, not another consolidation pass.

- `05-project-pivot.css` owns the identity grid. The name and initials occupy the
  left column. `.pivot-project-statuses` spans both rows on the right, preserving
  the balance-before-schedule order. An extra amount line must not stretch the
  title row. Team badges may still wrap naturally; do not force a fixed row height.
- The status group in `ProjectBillingPivot.jsx` is a presentation wrapper only.
  Existing visibility conditions, financial values and callbacks are unchanged.
  Empty/deferred groups do not reserve a phantom column or row.
- `15-balance-presentation.css` owns the flag/amount colors and alignment. Its pivot
  selector now targets `.pivot-project-statuses`, not the old title flex row.
- `.pm-forecast-jump-target > .balance-review-detail` has **12px above**, matching
  `.projection-detail-grid` tile spacing, and the existing **16px below**. Only
  an actual card receives the top margin; no-card projects are unaffected.

Check normal, over, short, Pending Foundation and deferred rows together. Check
long names, three/four initials, simultaneous schedule flags, horizontal scroll,
light/OLED, and narrow widths. Preserve badge dimensions and exact drawer cents.

## How to add or adjust a rule

Edit an existing rule where that property belongs. Add a nearby comment describing
what the rule controls and a related selector when the relationship matters. Use
semantic tokens for colors. Keep responsive/print rules near the behavior they
modify when this does not change their existing cascade position.

Do not add CSS to the two entry points. Do not introduce `!important`, a higher-
specificity selector, `@layer`, or a page-wide reset to overpower an unexplained
existing rule. Inspect the actual winning selector first. Do not delete an old
selector solely because a text search finds no literal class: React and sticky
header clones construct some class names dynamically.

## Validation and release

The C4 package has a separate local apply/QA/rebuild gate and optional commit/push
gates. Its source hashes certify this exact refactor; do not reuse that QA marker
for your own subsequent edits.

The three existing structural tests now expect 16 imports instead of 15 and the renamed module; their semantic assertions remain intact.

Normal source tests live in `frontend/tests`. The existing `helpers/readSource.mjs`
resolves the real CSS imports for the existing source-contract assertions; it does
not keep a duplicate legacy stylesheet or disable those assertions.

A complete C4 host QA run includes the per-selector/conditional declaration contract, focused and full
frontend tests (minimum 683), the Vite production build, the backend suite (minimum 352), and both Docker
image targets. Tests run against sanitized source, without production credentials
or SQL writes. The build proof checks that local CSS imports have been inlined.

Review light and OLED: Projected Billings By Month/By Project, table horizontal and
vertical scrolling, both billing drawers, PM/Admin controls, Bid Log, Active
Projects/Form 19, notifications, refresh feedback, and completed closeout. Test
at a narrow width and check print preview. The supplied offline browser evidence
uses representative markup fixtures, not authenticated end-to-end application
sessions; local and production visual review remain separate acceptance gates.

After an approved push, verify Cloud Build and the actual Cloud Run revision and
traffic in the Console. For a production regression, return traffic to the previous
known-good revision first. Use a reviewed normal `git revert` for source rollback;
never a force-push or a reset to an old patch base.
