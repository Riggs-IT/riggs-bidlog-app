# Bid Log CSS consolidation C2 — drawer ownership

**Date:** October 27, 2026 (Arizona).
**Required clean Git baseline:** `cf021ce296595b9871a5c04940ffcf38068ec6df`.

## Source basis and release status

The user reported C1 committed, pushed and visually accepted on the production
website. The available source ZIP is the preceding OLED commit `6cee030`; its
verified contents plus the exact released C1 payload produce the C1 file tree.
C2 was prepared from that tree, not from an earlier experimental palette.
The installer verifies all 291 baseline tracked file hashes and the live host's
exact clean commit, approved remote and remote main before editing. Any newer
or unexpected source stops the installer; nothing is reset to satisfy a guard.

No new Cloud Run revision, live host inspection or production change was performed
in the preparation environment. Local apply, QA, visual review, commit, push and
Console acceptance remain separate gates.

## What changes

C1 organized the monolithic stylesheet. C2 brings the shared billing drawer's
remaining component fragments together instead of appending another override.

| Owner | C2 responsibility |
|---|---|
| `02-billing-drawers.css` | Active/completed drawer shell, identity cards, labels/values/source notes, curve help, source comparison, forecast detail grids and their responsive variants |
| `04-projected-workspace.css` | Landing-table metadata, sorting, monthly margin display and the negative-money utility; no longer a second owner of drawer cards |
| `06-project-references.css` | Reference-card grid and spacing alongside the existing originating-bid and change-order components |
| `07-detail-layout-and-filters.css` | Side filters and completed-directory filters/sorting/lifecycle; no billing-card or reference-card overrides |

The 15-module import order is unchanged. The import map's descriptions, editing
guide and selector index are updated. New nearby comments identify card typography,
curve-help placement, source comparison, scrolling and responsive dependencies.

Nine split top-level definitions now have one definition each:
`billing-drawer-meta`, `completed-drawer-meta`, `completed-drawer-scroll`,
`completed-drawer-section`, `billing-curve-summary`, `billing-curve-help-popover`,
`projection-attention-message`, `projection-detail-grid`, and `project-setup-flags`.
State-specific, child-selector and responsive rules are not counted as unwanted
duplicates and remain distinct.

Seven superseded selector-specific declarations were removed after locating their
later covering declarations. One shared selector list needed a split to give each
component its proper owner. Consequently the physical shared declaration count is
**5,317 → 5,311** (net six fewer), and rule blocks are **1,632 → 1,622** (ten fewer).
This is a maintainability change, not a claimed runtime performance improvement.

## What does not change

No runtime React, backend, Data API, SQL, worker, dependency, Docker/deployment or
business-rule changes. Palette tokens and theme mappings are unchanged. Financial
values, Foundation/Ops authority, versioned PM edits, Arizona day-15 policies,
Balance Review certification, accepted badge/color/amount placement, notification
counter, gray PM filters and toggle behavior remain untouched.

The completed closeout module, PM editor module, pivot/sticky-table modules and
component-specific stylesheets are not absorbed into a new generic framework.

## Verification performed during preparation

- C1 tree reconstructed from verified source/patch hashes; exact host SHA guard is
  `cf021ce296595b9871a5c04940ffcf38068ec6df`.
- All affected styles parse. The independent contract checker verifies every
  selector/conditional-context declaration and related-property ordering against
  C1, except the seven witnessed removals. Theme contracts remain unchanged.
- **608 selected dependency-free Node tests passed**, zero failures/skips,
  including ten new C2 ownership/regression tests. Existing tests were not weakened
  or modified.
- An attempted full local Node run could not load 20 React-dependent test files
  because the locked React dependencies are unavailable here. Those tests are not
  counted as passing; the complete suite remains a mandatory Docker host gate.
- Chromium compared six representative views in light/OLED at eight widths:
  1440, 1280, 1050, 900, 760, 700, 640 and 390px. All **96 computed-style/geometry
  comparisons matched**. First-pass screenshots were pixel-identical in 95/96;
  the other screenshot differed only in a 2×3px antialiased corner with no computed
  style difference. Three settled-frame repeats of that exact case all matched.
- Another **30 hover, keyboard-focus and print comparisons matched** in both
  computed styles and pixels. Thus 33/33 extra state/repeat checks passed.
- Fixtures cover active drawer, completed closeout, preserved legacy completed
  metadata layout, reference-card disclosures/finder, directory/filter drawer,
  and potential-project base drawer. They use synthetic records and the same
  available fallback font on both sides, not authenticated production data or the
  locked Public Sans font. They do not certify every possible DOM composition.
- **27 installer/release simulations passed** using real isolated local Git
  repositories: exact source guards, apply/restore/idempotence, unrelated edit
  refusal, remote-drift refusal, QA-record/count checks, commit and normal push.
  Docker calls in this orchestration test were simulated; this is not a claim
  that production image builds or full application tests ran here.
- Four independent contract checks passed: accepted source succeeds, a changed
  drawer font value is rejected, a changed OLED token is rejected, and restored
  source succeeds again.
- Runner parsed using Python 3.11 grammar, avoiding the earlier f-string syntax bug.
  Sanitized QA copies are readable by the production image's non-root user;
  checkout and credential permissions are not loosened.

The per-selector checker is not advertised as a universal proof of all inter-selector
cascade interactions. That is why the multi-width browser comparisons and actual
local visual review are separate required acceptance steps.

## Required host gates

Run focused and complete frontend tests, a Vite production build, backend tests,
frontend and production Docker builds, and the declaration/import-bundling check.
Minimum counts: **653 complete frontend, 352 backend**; focused minimum is in the
package manifest. No skipped or failed full-suite result becomes a pass.

Docker and the exact locked full React environment were not available during
preparation. The runner must complete these checks on BarronLink before commit.
Inspect both themes, active/completed drawers, reference popovers, narrow layouts,
and unchanged financial/sticky-table controls. Do not save financial edits merely
to check CSS.

## Rollout and recovery

Use the existing BarronLink checkout and port 8175. Apply/QA/rebuild does not commit
or push. Source/hash checks are repeated after QA and before release. Commit needs
`--visual-approved`. Push uses normal Git and requires remote main to remain at
this base or the package's recorded release commit.

Before commit, guarded restore returns exactly to C1 and refuses unrelated edits.
After production promotion, restore traffic to the prior known-good Cloud Run
revision first; any source rollback is a reviewed normal revert, never a force
reset or replay of older stage installers.

Administration/Power Automate optimization, Active Projects/Form 19 functionality
and the independent historical data-quality backlog remain unchanged.
