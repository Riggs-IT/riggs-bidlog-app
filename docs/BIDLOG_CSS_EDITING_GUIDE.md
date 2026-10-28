# Bid Log CSS editing guide

**Current editing map: C2 — October 27, 2026.**
**Starting release:** accepted C1 `cf021ce296595b9871a5c04940ffcf38068ec6df`.
C2 changes ownership of existing drawer CSS, not the accepted light/OLED design.

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
| `styles/05-project-pivot.css` | Pivot columns, financial cells, project names/metadata, metric selection | Final compact header and shared metric lanes are in 11–13. |
| `styles/06-project-references.css` | Three reference cards, originating-bid finder/disclosure, change-order popovers and basic team metadata | The final reference-card grid and spacing now live here too. Curve-help geometry lives in 02. |
| `styles/07-detail-layout-and-filters.css` | Side-filter drawer and completed-directory filters, sorting and lifecycle cells | Filename retained to avoid import churn. It no longer owns billing-card or reference-card overrides. |
| `styles/08-notifications-and-inputs.css` | Bell/count geometry, notification panel, PM correction fields, probability/GC controls and potential-bid drawer | OLED counter ink/fill is in `theme-surfaces.css`. |
| `styles/09-bid-log.css` | Bid Log directory, summaries, table, notes, editor fields and GC picker | Lifecycle component polish stays in its existing separate file. |
| `styles/10-active-projects.css` | Active Projects directory, floating job editor and Form 19 read-only sections | This file does not control write permission or test-job eligibility. |
| `styles/11-lifecycle-feedback-and-staffing.css` | Lifecycle navigation, refresh toasts, compact month controls/header totals, Organizer | Sticky cloned controls must remain compatible with the existing hook. |
| `styles/12-table-teams-and-zebra.css` | Compact table headers, employee badge geometry, table widths, zebra and hover/completed states | Keep alternating backgrounds on frozen identity cells too. |
| `styles/13-financial-review-and-metrics.css` | Needs Rebalance/Pending Foundation flags, selection states, shared metric lanes and coverage notes | No classification or financial calculation is performed in CSS. |
| `styles/14-completed-closeout.css` | Completed contract ledger, progress chart, historical context and directory hints | Scoped to the completed report; do not turn it into a generic drawer reset. |
| `styles/15-balance-presentation.css` | Final right-aligned flag/whole-dollar amount stack and clickable balance card | Role-dependent click actions remain in the existing React components. |

### Existing component-owned styles stay where they are

`ViewControls.css` owns refresh/show controls. `ProjectionDisplay.css` owns PM/No PM
selection controls. `ReviewControls.css` owns its small review-control styles.
`ActiveProjectGeneralEditor.css` and `ActiveProjectSaveReview.css` remain scoped to
those components. Bid lifecycle, merge and CSV dialogs retain their own files.
The four Administration stylesheets are unchanged.

This is deliberate: moving these component imports would change their relationship
to the shared styles. C1 does not merge unrelated components into a global file.

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

Review 05, 11–13 and `useStickyTableHeader.js` together. Frozen left offsets, metric
lanes, column widths and floating-header clones form one layout contract. Do not
change a visible header's width without testing its body cells and clone during
horizontal scrolling. The consolidation intentionally preserves these contracts.

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

The C2 package has a separate local apply/QA/rebuild gate and optional commit/push
gates. Its source hashes certify this exact refactor; do not reuse that QA marker
for your own subsequent edits.

Normal source tests live in `frontend/tests`. The existing `helpers/readSource.mjs`
resolves the real CSS imports for the existing source-contract assertions; it does
not keep a duplicate legacy stylesheet or disable those assertions.

A complete C2 host QA run includes the per-selector/conditional declaration contract, focused and full
frontend tests, the Vite production build, the backend test suite, and both Docker
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
