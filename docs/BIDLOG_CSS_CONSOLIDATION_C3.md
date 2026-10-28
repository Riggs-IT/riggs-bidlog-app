# Bid Log CSS consolidation C3 — project pivot ownership

**Date:** October 27, 2026 (Arizona).
**Required clean baseline:** `8e477a9f80e01c67c719e0b10d03d797ebf89a36`.

## Scope and provenance

The user reported C2 committed, pushed and visually accepted on the website.
C3 uses the verified `6cee030` source ZIP plus the exact C1 and C2 payloads to
reproduce that accepted file tree. It does not claim that the older ZIP itself
contains commit `8e477a9f`. The host installer requires the exact clean C2 commit,
all 293 baseline file hashes, the approved repository path and remote, and remote
main still at that baseline. It never resets or force-pushes to satisfy a guard.

This patch modifies seven CSS files, adds one regression-test file, updates the
editing guide/selector index, and adds this report: **11 changed/new paths**.
Existing tests, runtime JavaScript, backend code, dependencies, build configuration,
SQL, Data API and bridge workers are unchanged.

## What C3 improves

The project pivot was still spread across the base table plus reference, input,
lifecycle, shared table-finish, and financial-review modules. The layout can now
be edited in **`frontend/src/styles/05-project-pivot.css`**:

- Source/Job/Project/Probability/Team/GC/value-column widths and frozen offsets.
- Project identity, clipping and context text; shared badge geometry stays in 12.
- Normal/floating Values controls, month navigation and sticky coverage controls.
- Month/Total headers and activity counts.
- All metric labels/values, compact pinned lane, no-margin and completed-history
  track arrangements, and the small comparable-variance marker.

Twelve fragmented base definitions now have one editable definition each, including
project names, toolbar, header totals/activity, and shared non-pivot title lines.
The shared title selectors remain in 12; their pivot counterparts live in 05.

The import order remains unchanged. Shared table zebra/hover states stay in 12;
semantic Needs Rebalance, Pending Foundation and schedule flags stay in 13;
the accepted amount stack and balance card stay in 15. Theme files are unchanged.

**This is not a minification/performance claim.** Physical shared rule blocks
change **1,622 → 1,613**. Physical declarations change **5,311 → 5,324** because
separating some shared selector lists allows single component definitions.
Every selector-specific declaration/value/importance/conditional contract remains
present; zero selector-specific declarations are deleted in C3.

## Deliberately retained dependencies

Desktop and 760px variants, print rules and state selectors are not redundant.
The late Project-column `background-clip` rule must remain after the shared `th`
background shorthand. An early candidate merge failed the contract checker
because it moved clipping before that reset; the final source keeps the ordering
and documents why. No width, offset, color, font size or z-index is changed.

CSS does not decide financial certification, PM/Admin editing, margin permission
or day-15 behavior. The existing runtime and access rules remain untouched.

## Preparation validation

- **622 selected dependency-free Node tests passed**, with zero failures/skips.
  This includes all previously selected C2 tests plus 14 new C3 ownership checks.
  Existing tests were not edited or weakened.
- Strict declaration contract comparison passed for the expanded real styles:
  same selector/context/property families, values and importance; unchanged
  theme contract. Five positive/negative contract checks confirmed that font,
  sticky-offset and OLED-token drift are rejected, and restored source passes.
- Chromium: **120 normal-view comparisons** across 12 source/metric configurations,
  two themes, and widths 1440, 1100, 761, 760 and 390px. Pixels and inspected
  computed styles/geometry match.
- Chromium: **140 additional comparisons** for horizontal scroll, row hover,
  control focus, a representative cloned floating header, and print, across
  active/combined/potential/completed configurations at 1440/760px in both themes.
  Pixels and inspected computed styles/geometry match in all 140.
- Total: **260 matching browser fixture comparisons**. These use representative
  markup derived from the component and synthetic records, not an authenticated
  app session. The clone is constructed for the fixture; this is not a complete
  end-to-end execution of the sticky-header React hook. Both sides use the same
  available fallback font, not the unavailable locked Public Sans dependency.
- Browser batches that exceeded the preparation command timeout were rerun in
  smaller batches. Only completed, unique comparison records are counted.
- **30 installer/release checks passed** in an isolated real Git repository and
  bare remote: package/whole-tree guards, dirty/non-main/remote-drift rejection,
  apply/idempotence/restore, preservation of manual edits, incomplete/stale QA
  refusal, commit scope, normal push/repeat push, and rejection of local restore
  after commit. The fixture substituted its own baseline/remote and used synthetic
  QA records to exercise release orchestration; it did not run Docker or count
  those records as full application test results.
- Python runner syntax is checked using Python 3.11 grammar. The source-only
  Docker mounts preserve non-root read/traverse permissions without changing
  the checkout or credential-file permissions.

Docker and the complete locked React/Vite installation were unavailable during
preparation. No full application build, backend suite, production deployment,
SQL canary or live Entra test is claimed here. Those remain host/Console gates.

## Host gates and acceptance

Use BarronLink's existing checkout and local port 8175. Full QA requires the
focused suite, full frontend suite (minimum **667**), backend suite (minimum
**352**), frontend and production Docker builds, and the declaration/bundled-import
checks. A short isolated test run does not bypass these gates.

Review the actual local app in both themes: Active only, Potential only, combined;
By Project/By Month; All/Projected/Actual/Variance/Margin where authorized;
horizontal scroll, frozen Probability and compact metric lane; floating controls;
and Completed Billings history. Check a narrow width and print preview. Nothing
should look different. Do not save a projection merely to review CSS.

Commit requires matching full QA and `--visual-approved`. Push is a separate
normal Git operation. Record the known-good C2 Cloud Run revision before promotion,
then verify the new exact commit in Cloud Build and the serving revision/traffic
in the Console. No bridge, SQL or worker deployment is required.

Before commit, guarded restore returns to C2 and refuses unrelated or subsequent
edits. After production promotion, restore Cloud Run traffic first; any source
rollback is a separately reviewed normal revert, not a reset or old installer.

Administration/Power Automate optimization and Active Projects/Form 19 editing
remain separate backlogs. C3 does not widen write eligibility or alter either.
