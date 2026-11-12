# AP4F3Q — Active Project Form 19 field restoration and next mapping register

**Evidence:** November 4 attached Data API `app/services/cognito_job_details.py` normalizer; November 4 Cognito Form 19 input/output schema audits; user-supplied current legacy formulas/defaults. Live Cognito form builder and real 8175 browser have **not** been inspected from this package. The public form URL did not yield a reliable interactive form snapshot in this environment. This is a read-display restoration only.

## What AP4F3P hid

The compact reference retained Architect/Engineer names and emails, building names, lender, LOI/Contract type, bond and parcel. It omitted the seven supplier/contract rows, mix designs, required submittals, detailing comments, operational dates/values and closeout contacts. The normalized source still returns those fields.

## Restored: source, display and next format review

| Cognito Form 19 field(s) | Normalized API key(s) | UI format now | Next edit/validation question |
|---|---|---|---|
| `AuthorizedSuppliers.PrimaryConcreteSupplier` / `SecondaryConcreteSupplier` | `authorizedSuppliers.primaryConcreteSupplier` / `.secondaryConcreteSupplier` | text | Are these free text, catalog choices or supplier IDs; who may edit? |
| `AuthorizedSuppliers.PrimaryAggregateSupplier` / `SecondaryAggregateSupplier` | `authorizedSuppliers.primaryAggregateSupplier` / `.secondaryAggregateSupplier` | text | Same; source selection/validation |
| `AuthorizedSuppliers.RebarSupplier`, `SiteSubcontractor`, `PatchingSubcontractor` | `authorizedSuppliers.rebarSupplier`, `.siteSubcontractor`, `.patchingSubcontractor` | text | Distinguish external company identity vs text |
| `AuthorizedSuppliers.PCSAmount`, `SCSAmount`, `PASAmount`, `SASAmount`, `RebarAmount`, `SiteAmount`, `PatchingAmount` | corresponding `authorizedSuppliers.*Amount` | currency, actual 0 preserved | Currency/precision and when zero is allowed |
| `AuthorizedSuppliers.PCSContract`, `SCSContract`, `PASContract`, `SASContract`, `RebarContract`, `SiteworkContract`, `PatchingContract` | corresponding `authorizedSuppliers.*Contract` | attachment **metadata only** | File uploads, document custody, allowed types/size, retry and permissions before edit |
| `Concrete.PrimarySupplier`, `SecondarySupplier` | `concrete.primarySupplier`, `.secondarySupplier` | text | Formulas from supplier choices; do **not** independently write if calculated |
| `Concrete.ApprovedMixDesignsPrimarySupplier`, `ApprovedMixDesignsSecondarySupplier` | `concrete.approvedMixDesignsPrimarySupplier`, `.approvedMixDesignsSecondarySupplier` | text | Are these text references, document IDs or attachments? |
| `Detailing.RequiredSubmittals[]` | `detailing.requiredSubmittals` | line-separated list | Array element schema/options, ordering, add/remove and conditional rules |
| `Detailing.CommentsForDetailing` | `detailing.commentsForDetailing` | multiline text | Permissions and length/empty-clears |
| `RiggsStartup.EstimatedDuration` | `riggsStartup.estimatedDuration` | integer months | Cognito operational authority; synchronize with existing changed-field writer |
| `RiggsStartup.Surveyor` | `riggsStartup.surveyor` | Form 21 lookup label | Established typed Form 21 identity; write gate separate |
| `RiggsStartup.TeamDistributionList`, `DropboxFolderName` | `riggsStartup.teamDistributionList`, `.dropboxFolderName` | text | Workflow-owned/projection vs independent edit |
| `RiggsStartup.DateProjectCompleted` | `riggsStartup.dateProjectCompleted` | source string (no timezone manipulation) | Required date format / closeout permissions |
| `RiggsStartup.WarrantyWork`, `RetentionCollected` | `riggsStartup.warrantyWork`, `.retentionCollected` | Yes / No / unknown | Are these employee-editable or automation-owned? |
| `Closeout.AdditionalEmail1`, `AdditionalEmail2` | `closeout.additionalEmail1`, `.additionalEmail2` | text | Email validation and ownership |
| `ArchitectOfRecord.AORName`, `AORAddress`, `AOREmail`; corresponding Structural Engineer | `architectOfRecord.*`, `structuralEngineerOfRecord.*` | text; referenced Form 206 | AOR/SEOR contact defaults are calculated from Form 206; no manual provider override assumed |
| `GeneralInformation.BuildingNames[]` and `NumberOfBuildings` | `generalInformation.buildingNames`, `numberOfBuildings` | names + count | New repeater item create vs existing row IDs; count is not a delete command |
| `LenderInformation.*`, `ContractsAndAdministration.ContractAmount`, `Retention`, `Bond`, `Parcel`, `OHP`; top-level `Contract` | matching `lenderInformation.*`, `contractsAndAdministration.*`, `contract` | reference; Contract boolean => LOI/Contract | Deferred Accounting ownership; `Contract` boolean false=LOI, true=Contract; JIS amount not Foundation revised total |

**Not restored to normal UI:** `Controls.*` formulas, `Entry.*` metadata, `JobNumber` generated identifier, `GeneralInformation.BuildingNames[].Id` create identity, `NotifyEveryone`, `AuthorizedSuppliers.SendToContracts` (could trigger a flow), `RiggsStartup.FolderCreated`, `LockTime`, `PublishUpdatedPreliminaryLeinInfoSheet`, and other system/automation flags. They remain in the provider when present, unchanged.

## Implementation boundary

All restored fields are **read-only references**. The existing `GET /api/active-projects/{id}/cognito-detail` and Data API normalizer supply them. No new writer, SQL grant, Form 19 POST, number assignment, worker restart or M365 sync is introduced.

## Next mapping order

1. Verify the current Cognito form-builder labels, display/required conditions and edit roles for **Authorized Suppliers & Contracts** (especially seven attachment arrays and `SendToContracts`).
2. Verify **Concrete / Mix Design** and **Detailing.RequiredSubmittals[]** element types and supported editing behavior.
3. Verify **Startup/Closeout** field ownership and formula/projection fields. Keep SQL plural staffing/Additional Members separate from scalar Cognito.
4. Implement typed, authorized write paths per confirmed field, with explicit clear vs omitted and actual source readback. Defer server draft completeness until the full form is certified.
