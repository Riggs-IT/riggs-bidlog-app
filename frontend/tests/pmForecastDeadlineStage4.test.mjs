import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePrimaryProjection} from '../src/primaryProjection.js';
const src = name => readFileSync(new URL('../src/'+name, import.meta.url), 'utf8');
test('Admin deadline exception is scoped to Administration, not every navigation view', ()=> {
  const dashboard=src('AdministrationDashboard.jsx');
  const admin=src('AdministrationForecastDeadline.jsx');
  assert.match(dashboard,/AdministrationForecastDeadline/);
  assert.match(admin,/api\/admin\/pm-forecast-deadline/);
  assert.match(admin,/window\.crypto\.randomUUID/);
  assert.match(admin,/window\.confirm/);
  assert.match(admin,/expectedRevision/);
});
test('deadline ends 20th; exception not openable during normal window', ()=> {
  const admin=src('AdministrationForecastDeadline.jsx');
  assert.match(admin,/Normal deadline: end of the 20th/);
  assert.match(admin,/canOpenException/);
  assert.match(admin,/Reopen exception/);
  assert.match(admin,/One point per project\/PM\/month/i);
});
test('assigned project manager receives point; fallback provenance visible', ()=> {
  const admin=src('AdministrationForecastDeadline.jsx');
  assert.match(admin,/Assigned PM/);
  assert.match(admin,/Submitter fallback/);
  assert.match(admin,/submittedByEid/);
  const forecast=src('PMForecastPanel.jsx');
  assert.match(forecast,/EDITABLE_EXCEPTION/);
  assert.match(forecast,/Late exception/);
});

test('primary projection contract accepts a live edited month during late exception', () => {
  const payload = {
    contractVersion: 1, readCompletedAtUTC: '2026-11-22T07:00:00Z',
    projects: [{jobListId: 123, hasPmForecast: true, latestForecastVersionId: 789,
      latestForecastVersionNumber: 1, latestForecastVersionType: 'PM_SUBMISSION',
      latestForecastMonthCount: 1, primaryProjectionSource: 'PM_FORECAST'}],
    items: [{jobListId: 123, monthStart: '2026-11-01', latestForecastVersionId: 789,
      primaryProjectionSource: 'PM_FORECAST', primaryProjectedAmount: 250,
      pmForecastAmount: 250, systemBaselineAmount: 200, foundationActualAmount: 100,
      monthEditState: 'EDITABLE_EXCEPTION', isEditable: true}],
  };
  const result = validatePrimaryProjection(payload);
  assert.equal(result.months.size, 1);
});
