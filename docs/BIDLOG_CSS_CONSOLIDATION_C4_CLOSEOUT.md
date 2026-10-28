# Bid Log CSS consolidation C4 — component ownership and closeout

**Date:** October 27, 2026 (Arizona). **Status:** prepared for local QA/review; not deployed by the preparation environment.

## Source identity

The accepted C3 tree is reconstructed from `riggs-bid-log-app.zip` at OLED commit
`6cee03078f9d99b0525927bc6f34045c113d2901`, plus the exact released C1, C2 and C3
payloads. Their baseline and payload hashes were verified. The ZIP itself is NOT
represented as containing the later C3 commit. The user reported C3 pushed and
accepted on the live site, and the two historical backup tags published.

The C3 commit SHA was not pasted. Rather than guessing it, the C4 installer binds
only a clean local `main` whose entire **295-file** tracked source matches the
accepted C3 tree, whose single parent is C2
`8e477a9f80e01c67c719e0b10d03d797ebf89a36`, whose commit path scope matches the
released C3 patch, and whose HEAD equals the approved remote's `main`. It records
that exact SHA in its apply/QA/commit state. Newer or unexpected work stops the
installer. There is no reset, checkout to an old tag, or force-push.

## Final scope

- Notification action cards move from `13-financial-review-and-metrics.css` to
  `08-notifications-and-inputs.css`, after the basic notification item rules.
- Management notices, passive watermark and Cognito guidance move from 13 to
  `10-active-projects.css`, including their existing 760px override.
- The original contiguous staffing/Organizer block is extracted into
  `11a-active-project-staffing.css`, loaded immediately after
  `11-lifecycle-feedback.css`. That is its original global cascade position.
- The old `11-lifecycle-feedback-and-staffing.css` is removed, not left as another
  source of overrides. Its lifecycle/navigation/refresh rules remain in renamed 11.
- Module headers, editing guide and selector index reflect the final ownership.
  `ACTIVE_PROJECTS_READ_ONLY_EXPLORATION.md` records the next investigation, not
  permission to write or open runtime gates.

This is a **15-path** patch: seven CSS paths (including one removed and two new),
four test paths (one new, three structural expectations adjusted), and four docs.
The existing tests now expect 16 imports and the renamed module. Their semantic
assertions remain intact. Sixteen new C4 tests check ownership, disabled states,
responsive/print/focus rules, passive Management notices and retained palette.

## What is preserved

Shared CSS remains **1,613 rule blocks / 5,324 physical declarations / 1,975
selector occurrences**. There are **zero removed selector-specific declarations**
in C4. This pass consolidates file ownership; it is not a minification or runtime
performance claim. The full selector index still has 2,495 occurrences including
component and theme styles.

Theme tokens and theme mappings are byte-for-byte unchanged. No new palette,
font size, table width, sticky offset, semantic status color, badge geometry,
notification counter, gray selection treatment or ON/OFF switch change is intended.

No runtime React/JavaScript, backend, dependencies, build/deployment configuration,
Data API, SQL or worker source changes. Financial cohort retention, status
classification, Foundation/Ops authority, PM versions/day-15 locks, Management
view-only boundaries, editor eligibility and save behavior are unchanged.

## Preparation evidence

- The strict per-selector/conditional/property-family contract checker accepts
  the imported C4 styles against C3. The staffing block is a direct extraction at
  its original position; notification and notice moves preserve their per-selector
  declaration order. This is not a universal cross-selector cascade theorem.
- **638 selected dependency-free Node tests passed**, zero failures/cancellations/
  skips, including sixteen new C4 checks. All tests selected in the C3 preparation
  evidence were rerun. Full React-dependent testing remains a host gate.
- Chromium 144.0.7559.96 compared notification cards, editable and disabled
  staffing/Organizer fixtures, and Management notices/watermark in light/OLED at
  1440, 981, 980, 761, 760, 700 and 390px. Normal views and additional focus/hover/
  print cases produced **92/92 matching computed-style/geometry comparisons**.
- Initial screenshots matched **91/92** byte-for-byte. The other case differed at
  eight edge pixels despite matching inspected styles and geometry. Three settled
  repeats of that case matched; the initial observation is retained in the evidence.
- Fixtures are synthetic markup derived from current components, not authenticated
  app sessions. They use the same available fallback font on both sides, not the
  locked Public Sans dependency. They do not execute the actual save/assignment
  hooks or certify authorization.
- Six positive/negative declaration checks passed: approved source accepted;
  notification padding, staffing grid, watermark behavior and OLED token drift
  rejected; restored approved source accepted.
- **38 installer/release checks passed** using isolated Git repositories, recorded in
  `proof/runner-simulation-results.json`. Synthetic QA records exercise release
  guards only; they are NOT counted as real full-suite or Docker passes.
- Runner is checked with Python 3.11 grammar. Source-only QA mounts are readable
  by the production container's non-root user without exposing host credentials.

Docker and the complete locked React/Vite dependencies are unavailable in the
preparation environment. No full application build, backend suite, live SQL read,
external write, cloud deployment or authenticated user acceptance is claimed here.

## Host QA and release

Use the existing BarronLink checkout/port 8175. The mandatory QA gate runs focused
and complete frontend tests (minimum **683** complete), backend tests (minimum
**352**), frontend and production Docker builds, the declaration contract and built
CSS import check. Source hashes are checked again after QA and before commit.

Review notifications (including 99+ count, full-card hover/focus and scrolling),
Active Projects read-only notices, staffing current/future rows and disabled
controls in both themes and narrow layouts. Do not save or change staffing merely
to inspect CSS. Spot-check the previously accepted financial and completed views.

Commit requires matching full QA and `--visual-approved`. Push is separate and
normal, with no force option. Record the current known-good C3 Cloud Run revision,
verify the exact new commit/build in Cloud Build, then the serving revision and
traffic in the Cloud Run Console. Production appearance should be unchanged.

Before commit, guarded restore returns to the exact accepted C3 source and refuses
unrelated edits. After promotion, restore Cloud Run traffic first; source rollback
uses a separately reviewed normal revert. Do not move the backup tags or replay
older stage installers over a committed release.

## Closeout boundary and next work

After successful host QA, local review and production acceptance, close the CSS
consolidation workstream. The original goals are met at this boundary: named owners,
commented sections, preserved visual design, documented theme controls, selector
navigation and removal/consolidation of the proven redundant or fragmented rules.

This does not claim all repeated selectors are errors or that all unused CSS has
been proven absent. Retain legitimate theme/state/responsive/print variants,
shared team badges/row shading, scoped closeout styling and documented sticky
ordering. Future changes should be driven by a real feature or reproduced issue,
not another indiscriminate cleanup pass.

Next: exploratory, read-only Active Projects/Form 19 runs. Inventory normal active
projects and controlled JobListID 24 without saving, enabling gates or changing
assignments. Separate working reads, intentional read-only fields, test-only
editors, runtime gates, mapping gaps and synchronization uncertainty. Only then
choose the next functional slice and an explicitly approved forward/restore canary.
Administration/Power Automate and historical financial data quality remain parked.
