# Active Projects / Form 19 — read-only exploration plan

**Next workstream after C4 is accepted. No new editor or write enablement is part of C4.**
This plan is based on the existing frontend source and the October 27 source audit.
The CSS changes have not certified live Cognito behavior, installed runtime flags,
SharePoint field metadata, write permission, synchronization or business data.

## First run: observe before changing

Use the existing local app for ordinary layout and navigation. Use the deployed
Microsoft-authenticated app for identity-dependent behavior; local dev login is
not Entra authorization evidence. Choose a normal active project with a populated
team, a normal active project with missing information, and the established
controlled test project JobListID 24 / JobNumber 11111. A completed project can be
observed separately to understand the existing view-only/correction boundary.
Do not save, assign, unassign, schedule, clear a value or change a runtime flag.

For each project, note what the directory, detail drawer, Form 19 sections and
Organizer show; what is editable, disabled, absent, loading, unavailable or in
error; and whether opening/reopening loses information. Record a screenshot or
sanitized summary only. Never share tokens, cookies, private OIDs, environment
contents, raw HTTP headers, full logs or raw Cognito payloads.

## Existing reads to trace, not new endpoints to build

The Bid Log backend already has `GET /api/active-projects`,
`GET /api/active-projects/{JobListID}`,
`GET /api/active-projects/{JobListID}/cognito-detail`, the controlled
`GET /api/active-projects/{JobListID}/cognito-general`, and
`GET /api/active-projects/{JobListID}/resource-schedule`.
Treat availability and access denials as observations; do not bypass a gate.
Confirm the current route definitions and sanitized runtime capability values
before preparing any diagnostic command that connects to the live services.

The existing project details read is SQL-backed; broad Form 19 details are typed
live Cognito reads through the Data API. Not every Form 19 field has a SQL mirror.
JobListID is the SQL/SharePoint project identity, not the business JobNumber or
Cognito entry ID. Keep employee EID, internal IT-user lookup ID, Cognito lookup ID,
SharePoint Person ID and private Entra identity separate.

## Observation worksheet

| Area | What to inspect without saving | What is not yet proved by the UI |
|---|---|---|
| Project details | Name/type/purpose/address/GC and the 15-field editor | Visible controls do not prove bridge write eligibility or atomic concurrency |
| General Information | Scope, LEED, NDA, building count/names; normal job versus Job 24 | Controlled test-only editor is not approval for broad writes |
| Form 19 reference sections | Startup, contacts, operational contract, duration, documents/workflow metadata | Read-only values do not imply dedicated write contracts or downloadable files |
| Project team | PM/APM/PE; current Superintendent/Foremen | Current assignment differs from future resource scheduling |
| Organizer | Current rows, future rows, dates/status, missing people | Schedule creation does not itself change current staffing |
| Authority | Ops facts versus Foundation financial measures | Operational contract is not Foundation revised contract or approved CO income |
| Access | Owner ADMIN and an existing authorized view-only account | MANAGEMENT_ADMIN Administration access does not grant project editing |
| Save Review | Existing component and conflict behavior can be inspected in source | No-op, forward/readback/restore need an explicitly approved later canary |

## Output of exploration

Build a field-level findings list: UI location, field/API name, current value state,
source/authority, read/edit eligibility, clear versus omitted semantics, and evidence
of any gap. Classify findings as working, intentionally read-only, test-only,
runtime-gated, mapping gap, synchronization uncertainty or reproducible error.
Do not widen a gate merely to remove a disabled control.

Only after that inventory should a bounded functional slice be selected. Preserve
Management view-only access, saved-version behavior, the distinction between omitted
and explicit null, protected workflow/file fields, and forward/readback/restore
requirements. A SQL outbox item queued is not proof of downstream delivery; a verified
Cognito PATCH is not proof SharePoint and SQL converged. No bulk repairs are implied.

Administration/Power Automate optimization and completed-history data quality remain
parked. No new bridge process, broad SQL grant, monitoring app, generic CRUD endpoint,
worker restart or SQL migration is part of this exploratory pass.
