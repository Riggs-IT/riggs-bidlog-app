# AP4F3U — GC company overrides, Owner SQL draft, and Form 19 mapping boundary

**Prepared:** 2026-11-12. **Scope:** existing revisioned Bid Log SQL Project Setup draft; no new SQL schema, no direct SQL from Cloud Run, no new Cognito/SharePoint/Accounting/Graph writes. This document is not a Form 19 create certification.

## Accepted underlying source evidence

- Existing `Jobs.ProjectSetupDraft` JSON schema and `Jobs.usp_SaveProjectSetupDraft` support `gcContactInfo` and `projectOwnerInfo` object roots; the Data API uses Pydantic `SetupValues`, `SetupChanges` and revision/idempotency SQL receipts. Existing API actor and SQL BID_ADMIN constraints continue. Existing schema contains all three GC company leaves and four Owner leaves.
- `Jobs.usp_GetProjectSetupIdentityDirectory` resolves the **real Form 140** GC identity (`140-N`); separately fetched Form140 reference data includes street, city/state/ZIP, and email. The client matches a **single exact** `cognitoLookupId`, never name similarity.
- The **installed** 2026-11-12 AP4F3R Form206 procedure returned 92 eligible design contacts (55 architects, 37 engineers), 38 with email, 92 with address, 0 invalid/duplicate IDs; the running Data API `release-0535fb0b2d03` parsed the exact live 92 rows. No reinstallation needed.
- User-provided Form19 formula register says `GeneralContractor.GCName`, `.GCStreetAddress`, `.GCCityStateZip`, `.GCEmail` are computed from `GeneralContractor.SelectGC` Form140 reference. API input schema alone does not prove that those formulas are safely overrideable during POST.

## Exact field-level draft contract

| SQL draft leaf | Form19 section/path noted in existing field register | Current editor behavior | Source / create-status |
|---|---|---|---|
| `gcLookupId` | `GeneralContractor.SelectGC` | Single verified `140-N` selector | SQL identity directory; exact Form19 POST lookup transport **not certified** |
| `gcContactInfo.streetAddress` | `GeneralContractor.GCStreetAddress` | Optional per-project override; null uses Form140 reference | Form19 field **calculated from Form140**; cannot claim override will propagate |
| `gcContactInfo.cityStateZip` | `GeneralContractor.GCCityStateZip` | Same | Form19 **calculated**, create override unresolved |
| `gcContactInfo.generalEmail` | `GeneralContractor.GCEmail` | Same | Form19 **calculated**, create override unresolved |
| `gcContactInfo.pm.name` | `GCProjectManagement.GCPMName` | Derived from explicitly selected **primary** GC PM roster entry | Full Form19 create-input, conditional requiredness **not yet certified** |
| `gcContactInfo.pm.office` | `GCProjectManagement.GCPMOffice` | Primary GC PM compatibility projection | Create-input not certified |
| `gcContactInfo.pm.mobile` | `GCProjectManagement.GCPMMobile` | Primary GC PM compatibility projection | Create-input not certified |
| `gcContactInfo.pm.email` | `GCProjectManagement.GCPMEmail` | Primary GC PM compatibility projection | Create-input not certified |
| `gcContactInfo.superintendent.name` | `GCSuperintendent.GCSuperName` | Derived from explicitly selected **primary** GC Superintendent | Create-input not certified |
| `gcContactInfo.superintendent.mobile` | `GCSuperintendent.GCSuperMobile` | Primary GC Superintendent compatibility projection | Create-input not certified |
| `gcContactInfo.superintendent.email` | `GCSuperintendent.GCSuperEmail` | Primary GC Superintendent compatibility projection | Create-input not certified |
| `gcContactInfo.superintendent.office` | **NO CONFIRMED FORM19 DESTINATION** | Retain in SQL roster and contact projection | Do **not** invent `GCSuperOffice` |
| `projectOwnerInfo.name` | `Owner.OwnerName` | Editable in SQL draft | Create-input requiredness/clear behavior not certified |
| `projectOwnerInfo.streetAddress` | `Owner.OwnerStreetAddress` | Editable in SQL draft | Create-input not certified |
| `projectOwnerInfo.cityStateZip` | `Owner.OwnerCityStateZip` | Editable in SQL draft | Create-input not certified |
| `projectOwnerInfo.email` | `Owner.OwnerEmail` | Editable in SQL draft | Create-input not certified |

**Null/blank semantics:** For GC company leaves, `null` means *no project override*, so the editor displays the current verified Form140 default. A nonempty string is a project override. The empty string `""` is an **intentional blank project override** (not the same as `null`); use the explicit **Use Form 140 default** action to remove the override. A Form140 reference is **not** silently copied into SQL; refreshing it never clobbers Ops edits. No Form140 master record is changed. The Owner fields continue to use existing null-clear behavior (empty input -> null) and nested patching preserves siblings.

**Existing GC role history:** `gcContactInfo.teamMembers[]` is project-specific; role, dateAdded, archived rows, and primary projection remain guarded in the Data API. A project with company overrides/legacy GC contacts/roster **cannot silently change to another Form140 GC**. AP4F3U adds an explicit server-side guard `GC_REASSIGNMENT_REQUIRES_CONTACT_REVIEW`, with matching client guard. This is not a new authorization level or a full contractor migration workflow. Unchanged GC IDs and empty-draft selections continue.

## Hard boundaries / next prerequisites

1. **Not Form19 ready:** The current UI checklist is advisory, `SetupState=PENDING_SETUP`. No Cognito create POST, no planned JobNumber, no invented JobListID, no Group or supplier/submittal side effects.
2. **GC calculated fields:** Do not overwrite Form140 master to make one project's GC details display differently. Resolve a supported Form19 project-specific override transport **or** an explicit separate reference-ownership policy before creation is allowed for a draft with overrides.
3. **Owner/GC create schema:** Certify actual Form19 `?input=true` shape, lookup IDs, required/conditional fields and nested clear behavior separately; current known field names are mapping evidence, not POST acceptance.
4. **Full JIS fields:** Existing 32 roots / 51 nested entries do not cover every newer read-only supplier, attachment, detailing, startup and closeout field that may have conditional Form19 creation rules. Do not certify `READY_FOR_JIS` from the 11-item UI checklist.
5. **Bid Award quantities:** Actual signed/awarded amount, SF and CY applicability/zero-versus-missing remains a separate source-contract gate. Never change bid lifecycle/history behavior in this stage.
6. **Deployment:** BarronLink's 19 tracked + 19 untracked worktree was **local only** as of this packet. Deploying all 38 unrelated changes requires separate release scope review and QA; AP4F3U package installs source for local testing without automatic Git staging, Git push or Cloud Run production promotion. The Data API security guard requires an API-only release; maintain separately pinned fast-path and watchdog worker images.
