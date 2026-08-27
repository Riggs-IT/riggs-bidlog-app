# Riggs Bid Log

Internal Riggs Companies Bid Log, forecasting, projected-billings, and project-accountability web application.

> **Repository:** `Riggs-IT/riggs-bidlog-app`  
> **Local development URL:** `http://localhost:8175`  
> **Status:** Local application baseline is working and verified. GitHub / Cloud Run production deployment is the next infrastructure milestone.

---

## Table of Contents

1. [Purpose](#purpose)
2. [Current Application Status](#current-application-status)
3. [Architecture](#architecture)
4. [Core Source-of-Truth Rules](#core-source-of-truth-rules)
5. [Application Areas](#application-areas)
6. [Projected Billings](#projected-billings)
7. [Project Accountability](#project-accountability)
8. [Forecasting Data Model](#forecasting-data-model)
9. [Foundation Billing Integration](#foundation-billing-integration)
10. [Estimated Duration Flow](#estimated-duration-flow)
11. [Technology Stack](#technology-stack)
12. [Repository Structure](#repository-structure)
13. [Authentication and Authorization](#authentication-and-authorization)
14. [Environment Configuration](#environment-configuration)
15. [Local Development](#local-development)
16. [Application API Routes](#application-api-routes)
17. [Riggs Data API Dependencies](#riggs-data-api-dependencies)
18. [Important SQL Dependencies](#important-sql-dependencies)
19. [Write Architecture and Future Editing](#write-architecture-and-future-editing)
20. [Cloud Run Deployment Direction](#cloud-run-deployment-direction)
21. [Verification Commands](#verification-commands)
22. [Security Rules](#security-rules)
23. [Troubleshooting](#troubleshooting)
24. [Development Rules](#development-rules)
25. [Roadmap](#roadmap)

---

# Purpose

The Riggs Bid Log application is the replacement web application for Riggs Companies' existing Bid Log / forecasting workflows.

The application is intended to become the central user experience for:

- active bid projected billings;
- current project projected billings;
- projected-vs-actual billing visibility;
- estimating and operations forecast maintenance;
- project lifecycle accountability;
- future bid / project field editing;
- future controlled synchronization to SharePoint and Cognito;
- future replacement of selected Power Apps / Power Automate user-facing workflows.

The application is deliberately built on the same platform pattern as other Riggs internal applications.

It is **not** a standalone database application and it must not bypass the Riggs Data API.

---

# Current Application Status

As of the current baseline, the application has two top-level functional areas:

```text
Riggs Bid Log
├── Projected Billings
└── Project Accountability
```

The current verified local runtime includes:

- FastAPI backend;
- React + Vite frontend;
- local Docker runtime on port `8175`;
- Microsoft Entra authentication support;
- safe local development authentication mode;
- Riggs Bid Log human authorization through the Riggs Data API;
- Current Project Projected Billings;
- Active Bid Projected Billings;
- combined projected-billings experience;
- monthly detail drill-down;
- PM and timeframe filtering;
- CSV-oriented read experience;
- Project Accountability;
- Operations data-health indicators;
- billing follow-up visibility;
- Foundation close backlog visibility;
- historical Foundation batch-close visibility.

The application is still primarily **read-oriented**.

The next major product phase is to add controlled editing from the Projected Billings experience.

The next major infrastructure phase is:

```text
GitHub baseline
    ↓
Google Cloud project / Cloud Run service
    ↓
Production Microsoft Entra configuration
    ↓
Secret Manager configuration
    ↓
Production Data API connectivity
    ↓
Verified production baseline
```

---

# Architecture

## Application architecture

```text
Browser
    ↓
Riggs Bid Log FastAPI Backend
    ↓
Riggs Data API
    ↓
Cloudflare Access
    ↓
RiggsDataHub SQL Server / Microsoft Graph integrations
```

The browser never receives:

- SQL credentials;
- SQL connectivity;
- Riggs Data API machine credentials;
- Cloudflare Access machine credentials;
- Microsoft Graph application credentials.

The frontend calls only same-origin `/api/...` routes exposed by the Bid Log FastAPI backend.

The backend owns the machine-to-machine call to the Riggs Data API.

---

## Platform architecture

The long-term architecture is:

```text
User
    ↓
React UI
    ↓
Bid Log FastAPI
    ↓
Riggs Data API
    ├── SQL read/write contracts
    ├── Microsoft Graph read contracts
    ├── integration/outbox contracts
    └── authorization resolution
         ↓
RiggsDataHub / Integration Workers
         ↓
SharePoint / Cognito / Foundation / other systems
```

Cloud applications should never connect directly to RiggsDataHub.

---

# Core Source-of-Truth Rules

These rules are critical. Do not redesign the application in ways that violate them.

## Active bids

Live active bids are authoritative in the SharePoint list:

```text
Bid Log
```

Active bids are read through Microsoft Graph via the Riggs Data API.

Do **not** treat `Jobs.BidLog` as the live source for active bids.

Do **not** mirror active bids into SQL merely to support forecasting.

---

## Historical / decided bids

Historical bids and bid outcomes may exist in:

```text
Jobs.BidLog
```

The permanent forecasting / award relationship identity is:

```text
OriginalBidLogID
```

For historical records:

```text
Jobs.BidLog.BidLogID = OriginalBidLogID
```

---

## Current projects

Current project identity is:

```text
JobListID
=
Jobs.CognitoJobList.SharepointID
```

`JobNumber` is the human/business-facing number.

It is **not** the relational identity used by project forecast settings.

---

## Forecast settings

There is one generalized forecast settings table:

```text
Jobs.ProjectForecastSettings
```

A forecast settings row belongs to exactly one subject:

```text
Bid:
    OriginalBidLogID

or

Current Project:
    JobListID
```

Do not create a separate current-project forecast settings table.

---

## Forecast engine

There is one resolver / monthly allocation foundation:

```text
Jobs.vw_ProjectForecastResolved
Jobs.vw_ProjectForecastMonthlyAllocation
Jobs.fn_ProjectForecastMonthlyAllocation
```

Do not duplicate forecast readiness or allocation logic in the application.

The application should consume the server-side result.

---

# Application Areas

# Projected Billings

Projected Billings is the primary forecasting experience.

The UI combines two intentionally separate source models:

```text
ACTIVE BIDS
    +
CURRENT PROJECTS
    ↓
ONE comparison-oriented Projected Billings page
```

The application can present them together, but their underlying authority remains separate.

Current source modes include:

```text
COMBINED
ACTIVE BIDS ONLY
CURRENT PROJECTS ONLY
```

The UI should support common filtering and comparison without collapsing the underlying data contracts.

---

# Active Bid Projected Billings

## Authority

Active bid data comes from the live SharePoint `Bid Log` list through Microsoft Graph / Riggs Data API.

Forecast configuration is stored separately in SQL forecast settings.

A live bid does not need a historical `Jobs.BidLog` row to have forecast settings.

## Identity

```text
OriginalBidLogID
```

## Current Data API contracts

```text
GET /v1/bid-log/projected-billings
GET /v1/bid-log/projected-billings/{sharepoint_item_id}/monthly
```

The Bid Log application proxies these through:

```text
GET /api/projected-billings/active-bids
GET /api/projected-billings/active-bids/{sharepoint_item_id}/monthly
```

## Bid readiness

Server-side forecast states include:

```text
NOT_CONFIGURED
EXCLUDED
MISSING_AMOUNT
MISSING_START_DATE
MISSING_DURATION_OR_END
INVALID_DATE_RANGE
READY
```

The frontend must not independently recreate readiness rules.

## Bid projected billing logic

Bid projected billings use server-resolved values such as:

- estimated amount / amount override;
- probability;
- anticipated start;
- estimated duration;
- forecast inclusion;
- straight-line monthly allocation.

The forecast is probabilistic for active bids.

---

# Current Project Projected Billings

## Authority

Current project data is SQL-backed through:

```text
Jobs.CognitoJobList
Jobs.JobSchedule
Jobs.ProjectForecastSettings
Foundation billing mirrors
```

## Identity

```text
JobListID = Jobs.CognitoJobList.SharepointID
```

## Current Data API contracts

```text
GET /v1/bid-log/current-projects
GET /v1/bid-log/current-projects/{job_list_id}/monthly
```

The Bid Log application proxies these through:

```text
GET /api/projected-billings/current-projects
GET /api/projected-billings/current-projects/{job_list_id}/monthly
```

## Current Project SQL read models

```text
Jobs.vw_CurrentProjectProjectedBillingsSummary
Jobs.vw_CurrentProjectProjectedBillingsMonthly
```

## Current project behavior

The current project model compares:

```text
baseline projected billing
vs
actual Foundation billing
```

Important fields include:

- EffectiveAmount
- EffectiveStartDate
- ProjectedCompletionDate
- ProjectedTotal
- ProjectedToDate
- ActualToDate
- VarianceToDate
- RemainingAmount
- FutureProjectedAmount

The current model is intentionally a **baseline-vs-actual model**.

It is not currently an automatic rolling reforecast after actual billings diverge from the baseline.

---

## Remaining amount

Current behavior:

```text
RemainingAmount
=
EffectiveAmount - ActualToDate
```

This value is intentionally not clamped at zero.

Actuals can exceed the current forecast / contract source.

That condition should remain visible rather than silently hidden.

---

## Monthly variance

Monthly rows can exist when there is:

- projected activity;
- actual activity;
- or both.

`MonthlyVariance` is calculated only when both projected and actual values exist.

A future month with no actual billing is `NULL`, not zero.

---

# Project Accountability

Project Accountability is a separate read experience intended to expose lifecycle data quality and process lag without incorrectly assigning causation.

The lifecycle model is:

```text
OPERATIONS COMPLETE
Cognito ProjectCompleted / DateCompleted
        ↓
LAST BILLING ACTIVITY
Foundation posted non-zero invoice activity
        ↓
FOUNDATION CLOSED
Foundation job_status / completion_date
```

These are three different business clocks.

Do not combine them into one generic "completion date."

---

## Operations Data Health

The accountability experience can expose independent Operations data-quality flags such as:

```text
OpsMissingStart
OpsMissingDuration
OpsMissingCompletionDate
OpsStartAfterCompletion
```

Important context:

`EstimatedDurationMonths` is a newer field.

Historical missing duration should initially be treated as adoption / data coverage, not automatically as historical employee failure.

---

## Billing Follow-Up

Billing follow-up measures the relationship between:

```text
OperationsCompletionDate
        ↓
LastBillingActivityDate
```

Examples of states include:

```text
BILLING_ENDED_BEFORE_OPS_COMPLETION
BILLING_ENDED_WITHIN_30_DAYS
BILLING_CONTINUED_31_60_DAYS
BILLING_CONTINUED_61_90_DAYS
BILLING_CONTINUED_91_180_DAYS
BILLING_CONTINUED_180_PLUS_DAYS
```

Billing continuing after Operations completion is not automatically an Accounting error.

Possible legitimate causes include:

- retainage;
- late change orders;
- delayed billing cycles;
- contract closeout requirements;
- owner / GC billing requirements.

The UI should show the factual timing first.

---

## Foundation Close Backlog

The strongest current Accounting / administrative close signal is:

```text
Operations says complete
AND
Foundation job is still open
AND
billing has been inactive for an extended period
```

Current follow-up thresholds include:

```text
> 90 days inactive  -> follow-up
> 180 days inactive -> critical
```

Current verified live counts at the baseline were approximately:

```text
Completed projects                     410
Ops complete / Foundation open          19
90+ day close follow-up                  9
180+ day critical close follow-up        6
```

These counts are runtime data and will change over time.

---

## Historical Foundation close behavior

Historical Foundation close dates show a strong batch-close pattern.

Observed during development:

```text
444 Foundation-closed jobs
20 distinct close dates
315 jobs closed on the top 5 dates
433 jobs closed on the top 10 dates
```

This indicates that `FoundationJobs.completion_date` is not a reliable proxy for physical work completion or final billing date.

It behaves much more like an administrative / financial job-close milestone.

---

## Accountability API

Riggs Data API:

```text
GET /v1/bid-log/project-close-accountability
```

Bid Log same-origin proxy:

```text
GET /api/project-accountability
```

Primary SQL read model:

```text
Jobs.vw_ProjectCloseAccountability
```

---

# Forecasting Data Model

## Settings table

```text
Jobs.ProjectForecastSettings
```

Important columns include:

```text
ProjectionID
OriginalBidLogID
JobListID
IncludeInForecast
StartDateOverride
AmountOverride
EstimatedDurationMonths
DistributionMethod
ProjectionNotes
CreatedAt
CreatedByEID
UpdatedAt
UpdatedByEID
RowVersion
```

A row belongs to one subject only.

---

## Save procedure

Forecast settings are managed by:

```text
Jobs.usp_SaveProjectForecastSettings
```

Current contract includes:

```text
@OriginalBidLogID
@JobListID
@IncludeInForecast
@StartDateOverride
@AmountOverride
@EstimatedDurationMonths
@ProjectionNotes
@ExpectedRowVersion
@ActorEID
```

The procedure uses optimistic concurrency through `RowVersion`.

Future UI editing should preserve this concurrency behavior.

A stale page must not silently overwrite newer forecast settings.

---

## Distribution method

Current distribution method:

```text
STRAIGHT_LINE
```

The allocation engine distributes projected dollars across active calendar days and reconciles pennies.

Do not create frontend allocation math.

---

## Current project amount precedence

For a current project:

```text
1. ProjectForecastSettings.AmountOverride
2. Jobs.CognitoJobList.ContractAmount
3. historical bid estimate fallback when award history exists
```

---

## Current project start precedence

```text
1. ProjectForecastSettings.StartDateOverride
2. Jobs.JobSchedule.PlannedStartDate
3. Jobs.CognitoJobList.AnticipatedStartDate
4. historical bid start fallback when available
```

---

## Current project end precedence

```text
1. Jobs.JobSchedule.PlannedEndDate
2. derived from EstimatedDurationMonths
```

Derived end:

```text
DATEADD(
    DAY,
    -1,
    DATEADD(
        MONTH,
        EstimatedDurationMonths,
        EffectiveStartDate
    )
)
```

Do not invent a duration when none exists.

---

# Foundation Billing Integration

Foundation actual billings are mirrored to RiggsDataHub.

The old mutable reporting view approach is no longer authoritative.

## Authoritative billing source

```text
Foundation dbo.ar_invoice
    ↓
Integration.FoundationBillingsMirror
```

Durable source identity:

```text
company_no + row_unique_id
```

Incremental watermark:

```text
row_modified_on
```

Billing dollars come from the invoice source and are exposed to forecasting through the monthly billing view.

---

## AR history

A separate mirror exists:

```text
Foundation dbo.ar_history
    ↓
Integration.FoundationARHistoryMirror
```

This source is useful for future payment, retainage, cash, and accounting analysis.

It is **not** the source used for Projected Billings actual billed dollars.

---

## Monthly billing view

Current projected-billing actuals use:

```text
Jobs.vw_FoundationMonthlyBillings
```

The view joins Foundation numeric job identity to the Cognito Job List and groups posted billings by calendar month.

Important identity:

```text
Jobs.vw_FoundationMonthlyBillings.JobCognitoID
=
Jobs.CognitoJobList.SharepointID
=
forecast JobListID
```

---

## Contract-value caution

During accountability analysis, Foundation contract sources were found to be unreliable for a simple "remaining to bill" calculation.

Observed issues:

- `FoundationJobs.total_change_orders` was zero across the inspected current mirror;
- `FoundationJobChangeBudgets.income_adj` was also zero;
- many jobs had actual billed totals above the available Foundation original-contract value;
- Cognito `ContractAmount` also disagreed with Foundation on many projects.

Therefore:

> Do not use a guessed "current contract" denominator for Accounting accountability until a truly authoritative revised-contract / schedule-of-values source is identified.

The Project Accountability page intentionally focuses on lifecycle timing and data health rather than unsupported "unbilled contract balance" accusations.

---

# Estimated Duration Flow

`EstimatedDurationMonths` is one business concept shared across estimating and operations.

## Active bid

For an active bid:

```text
SharePoint Bid Log
    +
ProjectForecastSettings.EstimatedDurationMonths
```

---

## Current project

Current-project duration flow is:

```text
Cognito Job Information Sheet
        ↓
SharePoint Cognito Job List
        ↓
normal SharePoint → SQL synchronization
        ↓
Jobs.CognitoJobList.EstimatedDurationMonths
        ↓
Jobs.ProjectForecastSettings.EstimatedDurationMonths
```

The Riggs Data API should not poll Cognito merely to obtain duration.

The existing upstream Cognito → SharePoint → SQL flow owns normal project synchronization.

---

## Duration synchronization semantics

Positive whole-number duration:

```text
1..120 months
```

A positive duration:

- updates `Jobs.CognitoJobList.EstimatedDurationMonths`;
- creates job forecast settings when appropriate;
- or updates only the settings duration when settings already exist.

A zero, null, or missing value is treated as **no signal**.

It does not erase an existing duration.

If forecast settings are excluded:

```text
IncludeInForecast = 0
```

a duration update must not re-enable the forecast.

---

# Technology Stack

## Frontend

```text
React 19
Vite 8
JavaScript / JSX
CSS
```

Frontend package:

```text
riggs-bid-log-frontend
```

---

## Backend

```text
Python 3.12
FastAPI
Uvicorn
Pydantic Settings
Authlib
HTTPX
```

---

## Runtime

```text
Docker
Docker Compose
Google Cloud Run - planned production runtime
```

---

## External / platform dependencies

```text
Microsoft Entra ID
Riggs Data API
Cloudflare Access
RiggsDataHub SQL Server
Microsoft Graph / SharePoint
Foundation accounting integration
Cognito / SharePoint synchronization
```

---

# Repository Structure

Current important structure:

```text
riggs-bidlog-app/
│
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── README.md
│
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py
│       ├── auth.py
│       ├── config.py
│       ├── data_api.py
│       └── main.py
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── package-lock.json
    └── src/
        ├── App.jsx
        ├── ProjectAccountability.jsx
        ├── main.jsx
        └── styles.css
```

The production Docker image builds the frontend in a Node build stage and copies the resulting static assets into the FastAPI runtime image.

---

# Authentication and Authorization

## Production authentication

Production uses:

```text
AUTH_MODE=entra
```

Microsoft Entra ID provides human authentication.

The application resolves the authenticated Microsoft identity into Riggs authorization through the Riggs Data API.

---

## Local development authentication

Local development can use:

```text
AUTH_MODE=dev
DEV_AUTH_ENTRA_OBJECT_ID=<Entra Object ID GUID>
```

The object ID is server-side configuration.

Do not expose it to the browser unnecessarily.

---

## Production safety guard

`AUTH_MODE=dev` is intentionally blocked in a production / Cloud Run runtime.

Production should fail startup rather than silently run with development authentication.

---

## Human authorization

Bid Log access resolution uses:

```text
POST /v1/access/bid-log/resolve
```

The application maintains human authorization separately from machine/service authentication.

---

## Roles

The backend recognizes Riggs application roles returned by the authorization resolver.

Administrative platform status requires:

```text
ADMIN
```

Do not rely on hidden UI controls as authorization.

Backend routes must enforce authorization where necessary.

---

## Sessions

Current session behavior includes:

```text
SESSION_MAX_AGE_SECONDS=28800
SESSION_IDLE_TIMEOUT_SECONDS=3600
```

The current idle timeout is one hour.

Production cookies must be secure.

---

# Environment Configuration

Use `.env.example` as the reference.

Never commit a real `.env`.

Important variables:

```text
APP_NAME
APP_VERSION
APP_ENV

AUTH_MODE
DEV_AUTH_ENTRA_OBJECT_ID

ENTRA_TENANT_ID
ENTRA_CLIENT_ID
ENTRA_CLIENT_SECRET
ENTRA_REDIRECT_URI

SESSION_SECRET
SESSION_COOKIE_SECURE
SESSION_MAX_AGE_SECONDS
SESSION_IDLE_TIMEOUT_SECONDS

DATA_API_BASE_URL
DATA_API_CLIENT_TOKEN
DATA_API_CF_ACCESS_CLIENT_ID
DATA_API_CF_ACCESS_CLIENT_SECRET
DATA_API_CONNECT_TIMEOUT_SECONDS
DATA_API_READ_TIMEOUT_SECONDS
```

---

## Example local environment

Create:

```text
.env
```

from:

```text
.env.example
```

Typical local settings include:

```text
APP_ENV=development
AUTH_MODE=dev
SESSION_COOKIE_SECURE=false
DATA_API_BASE_URL=https://api.riggsdata.net
```

Set all secrets only in the local `.env` or runtime secret system.

Do not place secret values in documentation.

---

# Local Development

## Prerequisites

Recommended:

```text
Docker
Docker Compose
Git
```

Node and Python do not need to be installed directly if the application is built entirely through Docker.

---

## Build and start

From the repository root:

```bash
docker compose up -d --build
```

The application is exposed on:

```text
http://localhost:8175
```

---

## Rebuild after source changes

The current Compose configuration does not bind-mount source code.

After source changes:

```bash
docker compose up -d \
  --build \
  --force-recreate
```

---

## Check runtime

```bash
docker compose ps
```

Health endpoint:

```bash
curl -sS \
  http://127.0.0.1:8175/api/health
```

Expected HTTP:

```text
200
```

---

## Backend compile check

```bash
python3 -m py_compile \
  backend/app/main.py \
  backend/app/data_api.py \
  backend/app/auth.py \
  backend/app/config.py
```

---

## Frontend production build

Docker normally performs this automatically.

Direct frontend build:

```bash
cd frontend

npm ci
npm run build
```

---

# Application API Routes

The browser communicates with the Bid Log FastAPI backend.

## Health

```text
GET /api/health
```

---

## Authentication

```text
GET  /api/auth/login
GET  /api/auth/callback
GET  /api/auth/me
POST /api/auth/logout
```

---

## Administrative platform status

```text
GET /api/platform/status
```

Requires an ADMIN user.

---

## Current Project Projected Billings

```text
GET /api/projected-billings/current-projects

GET /api/projected-billings/current-projects/{job_list_id}/monthly
```

---

## Active Bid Projected Billings

```text
GET /api/projected-billings/active-bids

GET /api/projected-billings/active-bids/{sharepoint_item_id}/monthly
```

---

## Project Accountability

```text
GET /api/project-accountability
```

---

# Riggs Data API Dependencies

The Bid Log backend currently depends on these Riggs Data API contracts.

## Access

```text
POST /v1/access/bid-log/resolve
```

---

## Current projects

```text
GET /v1/bid-log/current-projects

GET /v1/bid-log/current-projects/{job_list_id}/monthly
```

---

## Active bids

```text
GET /v1/bid-log/projected-billings

GET /v1/bid-log/projected-billings/{sharepoint_item_id}/monthly
```

---

## Project accountability

```text
GET /v1/bid-log/project-close-accountability
```

---

## Machine authentication

The Bid Log backend authenticates to the Riggs Data API using server-side configuration.

Current machine-edge requirements can include:

```text
X-Riggs-Client-Token
Cloudflare Access client ID
Cloudflare Access client secret
```

These must never be rendered into frontend JavaScript or returned to the browser.

---

# Important SQL Dependencies

The Bid Log app does not query these directly.

They are listed here because the Data API contracts depend on them.

## Forecast settings

```text
Jobs.ProjectForecastSettings
Jobs.usp_SaveProjectForecastSettings
```

---

## Forecast resolver / allocation

```text
Jobs.vw_ProjectForecastResolved
Jobs.vw_ProjectForecastMonthlyAllocation
Jobs.fn_ProjectForecastMonthlyAllocation
```

---

## Current Project Projected Billings

```text
Jobs.vw_CurrentProjectProjectedBillingsSummary
Jobs.vw_CurrentProjectProjectedBillingsMonthly
```

---

## Foundation monthly billing

```text
Jobs.vw_FoundationMonthlyBillings
Integration.FoundationBillingsMirror
```

---

## Project lifecycle accountability

```text
Jobs.vw_ProjectDurationCalibration
Jobs.vw_ProjectLifecycleAccountability
Jobs.vw_ProjectCloseAccountability
```

`Jobs.vw_ProjectCloseAccountability` is the current read model used by the Project Accountability page.

---

## Project identity

```text
Jobs.CognitoJobList
Jobs.JobSchedule
```

---

## Award history

```text
Jobs.BidAwardConversion
Jobs.BidAwardJob
Jobs.BidLog
```

One bid can create multiple jobs.

This is uncommon but supported by the data model.

The UI should optimize for the normal one-bid-to-one-job case without breaking the one-to-many failsafe.

---

# Write Architecture and Future Editing

This section is especially important for the next development phase.

The Projected Billings page is expected to become an editing surface.

The user should eventually be able to maintain information that results in updates across SQL, SharePoint, and Cognito-related workflows.

However:

> The React page must not independently write directly to SQL, SharePoint, and Cognito.

One UI action can result in multiple systems being updated, but orchestration belongs to trusted backend / integration layers.

---

## Desired user experience

Example:

```text
PROJECTED BILLINGS

Current Project
    Start Date
    Estimated Duration
    Forecast Amount
    Include in Forecast
    Notes

                        [ Save ]
```

From the user's perspective, this is one transaction.

---

## Desired backend pattern

```text
React
    ↓
Bid Log FastAPI
    ↓
Riggs Data API domain command
    ↓
authoritative transaction
    ↓
durable synchronization / outbox
    ↓
external systems
```

---

## SQL-authoritative forecast values

Forecast-specific values such as these naturally belong to the forecast settings model:

```text
IncludeInForecast
StartDateOverride
AmountOverride
EstimatedDurationMonths
ProjectionNotes
```

Future saves should use:

```text
Jobs.usp_SaveProjectForecastSettings
```

and preserve `RowVersion` optimistic concurrency.

---

## Active-bid SharePoint values

Active bid business fields remain SharePoint-authoritative.

If Projected Billings becomes an editor for active bid properties, those writes should use a dedicated Bid Log Data API domain contract.

The frontend should not call Microsoft Graph directly.

---

## Current-project Cognito / SharePoint values

Current project operational fields normally flow:

```text
Cognito
    ↓
SharePoint Cognito Job List
    ↓
SQL synchronization
```

Future writes from this web application need an explicit domain decision per field:

- which system is authoritative;
- whether the app updates SQL first;
- whether SharePoint is updated through a durable worker;
- whether Cognito is updated directly by a worker;
- whether the existing Cognito → SharePoint → SQL path remains authoritative.

Do not build a generic "write anything anywhere" endpoint.

Use narrow domain commands.

---

## Durable synchronization

The established Riggs pattern is:

```text
Authoritative SQL transaction
    ↓
Integration outbox
    ↓
leased/retried worker
    ↓
external system
```

This pattern already exists elsewhere in the Riggs platform and should be reused where appropriate.

Important properties:

- idempotency;
- durable retries;
- status tracking;
- failure visibility;
- credentials isolated to the worker;
- no user-facing browser dependency on external system latency;
- ability to recover after temporary SharePoint / Cognito failures.

---

# Cloud Run Deployment Direction

The current repository baseline should be deployed before major write functionality is added.

This creates a known-good production checkpoint.

## Recommended sequence

```text
1. Commit clean local baseline
2. Push to GitHub
3. Create / confirm GCP project
4. Create Cloud Run service
5. Create runtime service account
6. Create Secret Manager secrets
7. Configure production Entra redirect URI
8. Deploy application
9. Verify production authentication
10. Verify Data API connectivity
11. Verify projected billings
12. Verify project accountability
13. Tag / record production baseline
14. Begin write functionality
```

---

## Production requirements

Production must use:

```text
APP_ENV=production
AUTH_MODE=entra
SESSION_COOKIE_SECURE=true
```

Production also requires:

```text
ENTRA_TENANT_ID
ENTRA_CLIENT_ID
ENTRA_CLIENT_SECRET
ENTRA_REDIRECT_URI

SESSION_SECRET

DATA_API_BASE_URL
DATA_API_CLIENT_TOKEN
DATA_API_CF_ACCESS_CLIENT_ID
DATA_API_CF_ACCESS_CLIENT_SECRET
```

Prefer Secret Manager for sensitive values.

Do not bake secrets into the Docker image.

---

## Cloud Run container port

The container listens on:

```text
${PORT:-8080}
```

This is compatible with Cloud Run.

---

# Verification Commands

The project prefers detailed verification locally with a concise final PASS / FAIL summary.

## Local app

```bash
cd ~/docker/riggs-bid-log-app

docker compose up -d \
  --build \
  --force-recreate

HTTP="$(
  curl -sS \
    -o /tmp/riggs-bid-log-health.json \
    -w '%{http_code}' \
    http://127.0.0.1:8175/api/health
)"

echo "HealthHTTP=$HTTP"

if test "$HTTP" = "200"; then
    echo "Overall=PASS"
else
    echo "Overall=FAIL"
fi
```

---

## Accountability proxy

```bash
HTTP="$(
  curl -sS \
    -o /tmp/riggs-bid-log-accountability.json \
    -w '%{http_code}' \
    http://127.0.0.1:8175/api/project-accountability
)"

echo "AccountabilityHTTP=$HTTP"

if test "$HTTP" = "200"; then
    echo "AccountabilityProxy=PASS"
else
    echo "AccountabilityProxy=FAIL"
fi
```

---

## Git cleanliness

```bash
git diff --check
git status --short
```

---

# Security Rules

## Never commit

Do not commit:

```text
.env
real access tokens
Cloudflare Access secrets
Microsoft Entra client secrets
session secrets
private SSH keys
deploy-key private material
database passwords
certificate private keys
```

---

## Never expose to browser

Never expose:

```text
DATA_API_CLIENT_TOKEN
DATA_API_CF_ACCESS_CLIENT_SECRET
ENTRA_CLIENT_SECRET
SESSION_SECRET
SQL credentials
Graph application credentials
```

---

## No direct browser SQL

The browser must never query SQL directly.

---

## No direct cloud-app SQL

The Cloud Run application must not open direct SQL Server connectivity.

All SQL access is mediated through the Riggs Data API.

---

## No direct Graph writes from React

Microsoft Graph credentials and write orchestration belong to backend / integration infrastructure.

---

## Production auth guard

Do not weaken the `AUTH_MODE=dev` production guard.

If production auth is broken, fix Entra configuration.

Do not bypass it.

---

# Troubleshooting

## `/api/health` returns 200 but data routes fail

Likely causes:

- Data API token incorrect;
- Cloudflare Access credentials incorrect;
- Riggs Data API unavailable;
- SQL unavailable;
- Data API route not deployed;
- SQL permission missing.

Check application logs and Data API logs separately.

---

## 404 from a new Riggs Data API route

A 404 generally means the request reached FastAPI but the new route is not loaded in the running image.

Verify:

```bash
grep -Rni \
  'route-fragment-here' \
  app
```

Then rebuild / recreate the correct service.

Also verify that files copied with WinSCP were merged into the existing repository paths rather than placed under an extra directory.

---

## Source exists on host but route is missing in container

Compare:

```text
host source
vs
container source
vs
registered FastAPI routes
```

A stale image or wrong Docker build context can produce this condition.

---

## Frontend source changed but browser still shows old UI

The current Compose setup has no source bind mounts.

Rebuild:

```bash
docker compose up -d \
  --build \
  --force-recreate
```

Then refresh the browser.

---

## Entra redirect problems

Production redirect URI must point to:

```text
/api/auth/callback
```

The redirect URI configured in Entra must exactly match the runtime application URL and callback path.

---

## `AUTH_MODE=dev` fails in Cloud Run

This is expected.

Development authentication is intentionally blocked in production.

---

## Data API response appears malformed

The Bid Log backend converts unexpected Data API payloads into application errors.

Do not silently accept malformed server contracts.

Fix the upstream contract or adapter.

---

# Development Rules

These are project conventions and architectural guardrails.

## 1. Prefer authoritative live sources

If a handoff document disagrees with current SQL, SharePoint, Data API, or repository behavior, verify the live system.

Do not preserve stale assumptions simply because they exist in documentation.

---

## 2. One stage at a time

For infrastructure and data migrations:

```text
inventory
→ change
→ verify
→ continue
```

Do not stack unrelated production mutations before verifying the previous stage.

---

## 3. Stop on mutation failure

If a write/migration stage fails:

- stop;
- inspect;
- identify the exact failure;
- do not blindly continue.

---

## 4. Use rollback smoke tests for risky SQL changes

Where practical:

```text
BEGIN TRAN
    test mutation
    verify result
ROLLBACK
```

Production data should not be used casually for experimentation.

---

## 5. Preserve SQL alias conventions

Use bracketed aliases:

```sql
AS [Alias]
```

Avoid unbracketed aliases in project SQL.

---

## 6. Do not duplicate server business logic in React

The UI may format and filter data.

It should not recreate:

- forecast readiness;
- authoritative amount precedence;
- authoritative start precedence;
- duration validation;
- monthly allocation;
- financial reconciliation.

---

## 7. Use optimistic concurrency for editing

When forecast editing is added, preserve `RowVersion`.

The page should detect stale edits rather than silently overwrite another user's change.

---

## 8. Separate factual signal from blame

Accountability metrics should describe observable state.

Examples:

Good:

```text
Foundation open 219 days after last billing
```

Avoid unsupported automatic conclusions such as:

```text
Accounting failed to close the job
```

The UI may create follow-up queues without pretending to know causation.

---

## 9. Keep active-bid and current-project authority separate

One UI does not mean one source of truth.

Active bids remain Graph / SharePoint-backed.

Current projects remain SQL / project integration-backed.

---

## 10. Do not activate external write paths casually

SharePoint / Cognito write activation should happen only after:

- contract definition;
- authentication;
- authorization;
- retry/idempotency design;
- test job / bid;
- verification;
- rollback/recovery plan.

---

# Roadmap

## Completed baseline

```text
Historical award relationship work
Forecast identity refactor
Unified forecast settings model
Current Project projected-vs-actual SQL
Current Project Data API
Active Bid Projected Billings Data API
Weighted monthly reconciliation
Bid Log human authorization
Local FastAPI / React application
Unified Projected Billings read experience
Foundation invoice-source repair
Project duration plumbing
Project lifecycle calibration
Project accountability SQL
Project Accountability API
Project Accountability frontend
Local end-to-end verification
```

---

## Next infrastructure milestone

```text
GitHub repository baseline
    ↓
Cloud Run production deployment
    ↓
Production Entra authentication
    ↓
Production Data API verification
```

Repository:

```text
Riggs-IT/riggs-bidlog-app
```

---

## Next product milestone

Change Projected Billings from a primarily read-only experience into a controlled editing experience.

Likely first editing targets:

```text
Include In Forecast
Start Date / Start Override
Estimated Duration
Forecast Amount / Amount Override
Forecast Notes
```

The exact field ownership should be reviewed before implementation.

---

## Future synchronization milestone

The Projected Billings page should eventually be able to initiate changes that affect:

```text
SQL
SharePoint
Cognito-related project workflows
```

but those changes must travel through explicit backend domain contracts and durable integration paths.

The UI should not become a generic multi-system writer.

---

# Summary

The Riggs Bid Log application is becoming the shared forecasting and project-lifecycle interface for Estimating, Operations, and Accounting visibility.

The most important architectural principles are:

```text
Active Bid authority       = SharePoint / Graph
Current Project identity   = CognitoJobList.SharepointID / JobListID
Forecast settings          = Jobs.ProjectForecastSettings
Forecast allocation        = one SQL allocation engine
Actual billing             = Foundation ar_invoice mirror
Project lifecycle          = Operations completion
                             → billing activity
                             → Foundation close

Browser writes             = same-origin application API only
Cloud application SQL      = never direct
External synchronization   = controlled backend / durable worker
```

Keep those boundaries intact as the application grows.

---

## Internal Use

This repository contains internal Riggs Companies application code and is intended for authorized Riggs use only.
