# Bid Log CSS consolidation C1 — source and validation report

**Prepared:** October 27, 2026 (Arizona).
**Accepted baseline:** `6cee03078f9d99b0525927bc6f34045c113d2901`.
**Input archive:** `riggs-bid-log-app.zip`, archive comment exactly matches that commit.
**Archive SHA-256:** `91d96cac95bccfe7f19aa7db85461db72e8d64f16671c46da3c3bedce209d7de`.

The user reported the OLED release pushed and visually checked in production.
This audit independently verifies the uploaded source archive, not Cloud Run's
serving revision ID, traffic allocation, or the host's current worktree.

## Purpose and scope

Make the accepted styling maintainable without another color, font, layout or
behavior redesign. Replace the large historical stylesheet with commented owner
modules; remove declarations that no longer affect the cascade; keep a simple
palette editing location and an explicit load-order map.

No React runtime file, application backend, Data API, SQL definition, financial
calculation, authorization condition, refresh coordinator, worker, or deployment
configuration changes. Existing component-specific CSS files remain unchanged.

## Changes

| Item | Before | After |
|---|---:|---:|
| `frontend/src/styles.css` | 15,089 lines | 54-line ordered import map |
| Shared declaration count | 5,572 | 5,317 |
| Shared qualified rule blocks | 1,686 | 1,632 |
| Shared modules | One large file | 15 commented modules |
| Theme organization | 721-line combined file | 6-line entry + 166-line tokens + 509-line mappings |
| Total shared module lines | Included in the old entry | 11,376, including comments |
| All application CSS source bytes | 315,067 | 299,817 |

Removed **255 superseded declarations**, **54 resulting empty rule blocks**, and
**2 resulting empty media wrappers**. The line/byte changes include ordinary
formatting and comment changes. No browser performance claim is made from these
source counts.

The removed declarations have explicit witnesses: a later declaration with the
same property, importance, exact normalized selector branch, and identical enclosing
conditional context. For a selector list, every branch must have a witness. The
remaining selectors, declarations, media/print contexts, values, and order are
preserved. Compatibility/structural state rules are not deleted merely because a
selector repeats.

The complete removal ledger is included in the patch's `proof/removed-declarations.json`.
The package's independent `proof/semantic_check.cjs` checks the witnesses against
its baseline CSS, then compares the actual expanded new cascade with the expected
remaining syntax tree. Theme tokens and mappings compare unchanged, apart from
formatting/comments. It also checks that a built asset has no remaining CSS imports.

## Maintainability

Each shared module states what it controls and related modules. `styles.css` retains
an explicit cascade order rather than introducing CSS layers, changing selector
specificity, or letting filenames silently determine precedence.

`docs/BIDLOG_CSS_EDITING_GUIDE.md` has the complete file map and recipes for palettes,
typography, PM source controls, notifications, policy switches, balance cards, and
sticky tables. `docs/BIDLOG_CSS_SELECTOR_INDEX.md` lists 2,521 selector occurrences
across the shared and existing component styles with their files and conditions.

This is real declaration cleanup plus organization, not just splitting a file.
It is also deliberately not a claim that every repeated selector can safely become
one rule. Some base, shared-card, responsive, print, sticky, and state fragments
continue to cooperate across the ordered modules. The index exposes those cases.
A later deeper merge should prove that moving declarations cannot change competing
selectors, rather than deleting working states to achieve a smaller file count.

## Existing tests preserved

Twenty frontend test files now use `tests/helpers/readSource.mjs` instead of reading
the stylesheet entry literally. It expands the real local imports in order and
returns ordinary non-CSS source unchanged. Existing assertions were retained, not
removed or redirected to a copy of the legacy CSS.

Eight new tests protect import-only entry points, module order and documentation,
theme organization, print/focus/sticky behavior, and safe test-source import reading.
The helper is test-only; the production application does not import it.

## Completed validation in the preparation environment

- Accepted ZIP comment and SHA-256 recorded.
- CSS syntax parsed; witnessed-removal/cascade-order proof passed.
- Theme syntax-tree equivalence passed: values, selectors and order unchanged.
- All 149 unique replacement property/value pairs were supported by the installed
  Chromium parser.
- **586 existing dependency-free source/behavior tests passed**, with zero failures
  or skips in that selected suite.
- **8 new consolidation tests passed** (594 total across those two runs).
- **24 browser fixture comparisons passed**: four representative views, light/OLED,
  and 1440px, 900px and 390px viewports. Compared pixels, selected computed styles,
  tested hover/focus states, and print styles at the wide viewport.
- Representative views: Projected Billings, directory tables, PM billing drawer,
  and completed closeout. These are synthetic test records using the current
  component class structures, not an authenticated live application session.
- Browser fixture font: identical system fallback on both sides; the locked Public
  Sans dependency was unavailable in the offline preparation runtime.
- Runner syntax checked against Python 3.11 grammar. The runner avoids the previous
  f-string/backslash compatibility bug and makes its sanitized QA mount readable
  to the production image's non-root user.

## Installer and release-control checks

The installer passed 23 checks in isolated Git fixtures: baseline/hash verification,
idempotent apply, exact restore, rejection of unrelated/post-apply edits, explicit
visual approval, missing-QA denial, insufficient-test-count denial, remote drift
denial, approved-scope commit, normal push and repeat-push verification. QA command
orchestration was exercised with simulated Docker results only; those simulations
are not a claim that Docker or the full application suites ran here.

## Required host acceptance, not claimed complete here

The locked npm dependencies could not be fetched in the preparation environment,
and a Docker engine is not available here. Therefore the complete React/Vite suite,
backend suite, both Docker targets, and the built-CSS import-inlining check remain
mandatory BarronLink gates in `run.py qa`. No failing or skipped tests are converted
into a pass.

The release runner requires at least 643 complete frontend tests (the prior 635
minimum plus 8 new tests), 352 backend tests, the focused suite, the cascade proof,
and both image builds. It verifies exact source hashes again after QA and before
commit. Local visual review is a separate requirement (`--visual-approved`).

## Local rollout and release boundaries

Use the existing `~/docker/riggs-bid-log-app` checkout and local port 8175. The
installer requires clean `main` at the accepted baseline, an approved GitHub remote,
matching remote `main`, and exact exported source hashes. It refuses drift instead
of resetting anything.

Apply, QA, local rebuild, commit, push, and Cloud Run acceptance remain separate.
The local block performs no commit or push. SQL Bridge and its six workers/tunnel
are not involved. A later push must be verified in Cloud Build and Cloud Run's
revision/traffic Console views under the real Entra-enabled application.

Before commit, guarded restore returns the exact OLED baseline and refuses to
overwrite unrelated edits. After production promotion, restore traffic to the
previous known-good revision first; a source rollback is a reviewed normal revert,
not a force-reset or replay of older stage installers.

## Deferred work retained

Active Projects/Form 19 completion remains next functional work. Administration and
Power Automate optimization, historic outbox investigation, and completed-project
historical data-quality review stay parked. The accepted balance classification,
cohort retention, financial meanings and Arizona day-15 policies are unchanged.
