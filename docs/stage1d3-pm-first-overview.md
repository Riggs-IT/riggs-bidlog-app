# Stage 1D3 — PM-first overview

## Selection and aggregation
Active projects use the Stage 1C1 / Stage 1D2 read contract: latest submitted PM
version if one exists, otherwise System Estimate. This is per PROJECT; blank
months in a submitted version do not fall back to baseline. Zero remains zero.
Completed/historical source rows retain their original read data and scope.
Potential-bid forecast/probability selection is unchanged.

The browser performs four bulk GETs rather than the preceding three. Summary,
legacy monthly actual/margin and primary-projection responses publish together
under the existing latest-read owner. No per-project PM fan-out or new cache
framework is introduced. Different snapshot actual amounts cause a visible
read error and retain the preceding display; manual Refresh bypasses all caches.

The new app GET is /api/projected-billings/current-projects/primary-projection.
It uses the existing service transport, DashboardReadCache, TTL setting, fresh
query option, role/redaction functions, and passive-read allowlist. Project-data
write invalidation now also includes this explicit read representation. No
existing baseline GET has been silently repurposed for other callers.

Both main views and range/monthly CSVs use the same normalized monthly dataset.
Raw null remains a dash or empty CSV cell. Totals sum known amounts and disclose
blank PM comparison-month coverage; variance is unavailable for a partial PM
projection comparison. Those blank months are observations in the returned
baseline/PM/actual calendar, not a new requirement that PMs fill every month.
Historical actuals/credits and weighted historical margin are not recalculated
from PM projections. Source labels and version IDs accompany exports. Non-admin
exports retain the existing margin boundary.

Projected-to-date uses the Arizona month of the primary response read timestamp,
not the editing lock. It includes that whole month and is NOT a contract-review
reporting cutoff. Existing actual-to-date and commercial summary fields stay
unchanged; a cross-response actual mismatch hides to-date variance. No contract
reconciliation or month-lock business rule is implemented by this UI adapter.

## Boundaries
PM detail display controls and all GC pickers/reference/filter code from Stage
1D1 stay in place. Only the PM detail fallback maps explicit baseline/PM fields
correctly when the main monthly rows now carry a primary projection.
All forecast edit/default/save/conflict logic, permissions, approved amounts,
SQL objects, Foundation imports, baseline locking history and the old total-match
policy are unchanged. The frozen-baseline SQL installers must not be rerun.

## Release
Run local checks and review on BarronLink :8175. No Git commit/push or Cloud Run
rollout occurs in the installer. Bridge Stage 1D2 is already active and is only
read. A local test or deployment is not confirmation of production Cloud Run.
Rollback unwinds Stage 1D3 only, retaining Stage 1D1/B4/B3.
