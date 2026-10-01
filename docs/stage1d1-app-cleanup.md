# Stage 1D1 — app-only General Contractor and PM-detail cleanup

Built on exact Stage 1B3 + Stage 1B4 source at Bid Log HEAD 2b3cf5a.
This stage is independent of the failed SQL foundation installers.

## Delivered

- Existing submitted PM detail hides System Baseline initially. "Compare with
  System Baseline" restores the column; no-PM projects retain the baseline.
  All-zero submissions still count as submissions. Controls are per opened
  project and reset on project switch. They do not change saved data.
- Running totals are an explicit display option. Variance is named "Variance vs
  PM" (the existing Actual minus PM arithmetic). Draft/version, save, policy,
  locking and numeric behavior are unchanged.
- One shared in-memory General Contractor directory response, with a 60-second
  reuse window and coalesced reads. New editor mounts and picker opens recheck
  freshness. Retry forces a new read, supersedes old responses, and publishes to
  subscribers. No new periodic polling and no persistent browser storage.
- Existing full-directory GET, credentials and server permissions are unchanged.
  It remains editor-only. VIEWER-only sessions do not request the directory;
  they keep source-row labels. This is not a new read-only directory permission.
- Picker option/selection identity uses the numeric record ID returned in the
  compatibility `sharePointItemId` field (currently PotentialGCID). Search includes
  name, city, address, email and phone. Same-name records show addresses and IDs.
  Keyboard arrows/Enter select an existing option; free text never creates one.
  Results show 60 at a time and "Show more" exposes additional matches.
- Bid persistence remains names, including the established multi-GC delimiter.
  Two directory records with the identical name cannot be persisted distinctly by
  that contract. Explicit choice is distinguished in the open editor only; an
  ambiguous name on reopening is marked "record unclear", not assigned a guessed
  ID. Choosing another same-name record replaces the in-editor choice instead of
  pretending two identical names retain distinct identities. This does not write
  or backfill project GCCognitoEntryID.
- Existing noncanonical/inactive text is preserved for unrelated saves and marked
  as existing in the picker. Selecting a new option emits only its canonical
  name. Refreshing the directory never calls onChange or edits a draft.
- Canonical options and matching are shared by portfolio and completed-project
  filters. The Bid Log workspace now also has a GC filter. Filters contain only
  represented contractors; a selected missing option is retained visibly rather
  than silently clearing the filter. Multiple-GC filtering still uses the original
  multi-GC population.
- Matching is exact name/case or a unique punctuation/spacing match. Company words,
  suffixes, and accents are not stripped. The only explicit shortened-name alias
  is the requested A.R. Mays -> A.R. Mays Construction mapping, conditional on a
  unique target and no exact competing record. No general fuzzy matching.
- Full-directory duplicate IDs and invalid responses fail closed. Distinct IDs
  sharing a name remain separate records; PEs own directory deduplication.
- The existing BillingDisplay currency formatter is reused rather than created
  per cell. Precision/null/invalid-value handling is unchanged.

## Intentionally not included

- Main portfolio PM-first amount selection / activation of the Stage 1C1 bridge
  GET. The overview still uses its existing baseline-oriented amount path.
- Changing the PM save policy, baseline seeding, or the NeedsRebalance view.
- Contract-versus-billing review and its confirmed reporting cutoff.
- Freezing baseline history or redistributing future baseline on contract changes.
- Any SQL installer, migration, trigger, grant, snapshot, data write, or SQL test.
- Any bridge/worker restart, Git staging/commit/push, or Cloud Run deployment.
- Permission changes for viewer-only GC reference access.

Those tasks must not be presented as complete because this UI patch passes.
Frozen-baseline work must be tested on an isolated SQL Server instance, not by
embedding fixtures inside a production installation transaction.

## Validation and release boundary

New JS tests are in frontend/tests/gcReference.test.mjs. Existing frontend and
Python suites are retained unchanged. The package records built-frontend mocked
Chromium scenarios separately from actual live browser acceptance. No mock result
is a SQL, Microsoft, container, or production deployment PASS.

The installer defaults to read-only verification. Explicit --apply --local-deploy
updates only the existing local Bid Log service on port 8175 after running the
full Python suite and frontend tests. It preserves Stage 1B3/B4 and rejects newer
or unrelated changes before building. Rollback restores the immediately preceding
local app source/image; it does not undo the earlier cache work.
