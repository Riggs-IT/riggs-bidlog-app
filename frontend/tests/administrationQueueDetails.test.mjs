import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const src = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('queue drilldown is explicit owner-only passive GET, never auto polling or POST', () => {
  const component = src('../src/AdministrationQueueDetails.jsx');
  const dashboard = src('../src/AdministrationDashboard.jsx');
  const app = src('../src/App.jsx');
  const auth = src('../../backend/app/auth.py');
  const api = src('../../backend/app/main.py');
  assert.match(component, /fetch\(`\/api\/admin\/queue-events\?\$\{params\}`/);
  assert.match(component, /'X-Riggs-Passive-Read': '1'/);
  assert.match(component, /method: 'GET'/);
  assert.doesNotMatch(component, /setInterval|setTimeout|POST|worker.restart|retry-event/);
  assert.match(component, /No automatic retry scheduled/);
  assert.match(component, /phase: 'PAUSED'/);
  assert.match(component, /Queue read was paused while the tab was hidden/);
  assert.match(component, /earliest recorded claim time/);
  assert.match(dashboard, /onQueueInspect\(item\.laneKey, 'FAILED'\)/);
  assert.match(dashboard, /onQueueInspect\(item\.laneKey, 'PENDING'\)/);
  assert.match(app, /const canViewAdministration = user\?\.canViewAdministration === true/);
  assert.doesNotMatch(app, /adminPreview|administration-preview/);
  assert.match(auth, /"\/api\/admin\/queue-events"/);
  assert.match(api, /@app\.get\("\/api\/admin\/queue-events"\)/);
  assert.match(api, /current_user: CurrentUser = Depends\(require_administration_owner\)/);
  assert.doesNotMatch(api, /@app\.post\("\/api\/admin\/queue-events"\)/);
});

test('queue-view does not expose raw error, token, payload, or SQL execution', () => {
  const component = src('../src/AdministrationQueueDetails.jsx');
  const bff = src('../../backend/app/administration.py');
  const client = src('../../backend/app/data_api.py');
  assert.doesNotMatch(component, /event\.lastError|event\.payload|event\.lockToken|event\.lockedBy/);
  assert.match(component, /CATEGORIES\[event\.errorCategory\]/);
  assert.match(bff, /_sanitize_queue_events/);
  assert.match(client, /include_service_auth=True/);
  assert.match(client, /\/v1\/bid-log\/admin\/queue-events/);
});

import {validQueueDetail} from '../src/administrationQueueDetailContract.mjs';
const example = () => ({
  readOnly:true, availability:'AVAILABLE', source:'RIGGSDATAHUB_OUTBOX', observedAtUTC:'2026-10-23T16:00:00+00:00',
  laneKey:'project_forecast', status:'FAILED', limit:20, hasMore:false,
  events:[{eventId:33, identityType:'JOB_LIST_ID', jobListId:527, ticketKey:null,
    jobNumber:'26583', retryCount:5, createdAtUTC:'2026-10-23T15:59:00+00:00',
    eligibleAfterUTC:null, errorCategory:'TIMEOUT'}],
});
test('valid event contract distinguishes genuine empty and terminal failure', () => {
  assert.equal(validQueueDetail(example(),'project_forecast','FAILED'),true);
  const empty=example(); empty.events=[];
  assert.equal(validQueueDetail(empty,'project_forecast','FAILED'),true);
  const pending=example(); pending.status='PENDING'; pending.events[0].eligibleAfterUTC='2026-10-23T16:05:00+00:00';
  assert.equal(validQueueDetail(pending,'project_forecast','PENDING'),true);
});
test('identity mismatch, extra secrets, bad category, and unsafe retry time fail closed', () => {
  for (const change of [
    d => {d.events[0].lastError='SECRET'},
    d => {d.events[0].errorCategory='DATABASE PASSWORD'},
    d => {d.events[0].jobListId=null},
    d => {d.events[0].eligibleAfterUTC='2026-10-24T10:00:00+00:00'},
    d => {d.hasMore=true},
    d => {d.events[0].createdAtUTC='yesterday'},
    d => {d.events[0].retryCount=-1},
    d => {d.laneKey='accounting_tickets'},
  ]) {
    const d=example(); change(d);
    assert.equal(validQueueDetail(d,'project_forecast','FAILED'),false);
  }
});

// Regression: the app backend adds availability:'AVAILABLE' after it has
// validated the restricted shared API result. This exact field must be
// accepted, while missing/unavailable or extra fields remain rejected.
test('backend-shaped accounting queue details pass the strict browser contract', () => {
  const observed = {
    readOnly: true,
    availability: 'AVAILABLE',
    source: 'RIGGSDATAHUB_OUTBOX',
    observedAtUTC: '2026-10-23T17:18:44+00:00',
    laneKey: 'accounting_tickets',
    status: 'FAILED',
    limit: 20,
    hasMore: true,
    events: Array.from({length: 20}, (_, index) => ({
      eventId: 67 - index,
      identityType: 'TICKET_KEY',
      jobListId: null,
      ticketKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      jobNumber: null,
      retryCount: index,
      createdAtUTC: `2026-10-23T${String(17 - Math.floor(index / 10)).padStart(2, '0')}:${String(59 - index).padStart(2, '0')}:00+00:00`,
      eligibleAfterUTC: null,
      errorCategory: 'UNCLASSIFIED',
    })),
  };
  assert.equal(validQueueDetail(observed, 'accounting_tickets', 'FAILED'), true);
  for (const mutation of [
    data => {delete data.availability;},
    data => {data.availability = 'UNAVAILABLE';},
    data => {data.debug = 'raw error';},
    data => {data.events[0].lastError = 'do not expose';},
  ]) {
    const invalid = structuredClone(observed);
    mutation(invalid);
    assert.equal(validQueueDetail(invalid, 'accounting_tickets', 'FAILED'), false);
  }
});
