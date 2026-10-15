import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {groupPresenceSessions} from '../src/administrationPresenceGrouping.mjs';

const at = (time, overrides={}) => ({
  appCode: 'BID_LOG', eid: 1658, displayName: 'Synthetic Person',
  currentPage: 'Projected Billings', appRole: 'VIEWER',
  status: 'RECENT_ACTIVITY', lastHeartbeatAtUTC: `2026-10-15T${time}Z`,
  lastActiveAtUTC: `2026-10-15T${time}Z`, startedAtUTC: '2026-10-15T19:30:00Z',
  ...overrides,
});

test('multiple browser sessions become one employee/app row', () => {
  const sessions = [at('20:01:00'), at('20:03:00'), at('20:02:00')];
  const groups = groupPresenceSessions(sessions);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sessions.length, 3);
  assert.equal(groups[0].eid, 1658);
  assert.equal(groups[0].latest.lastHeartbeatAtUTC, '2026-10-15T20:03:00Z');
});

test('same employee across apps remains separate and same name with another EID does not merge', () => {
  const groups = groupPresenceSessions([
    at('20:01:00'),
    at('20:02:00', {appCode:'ACCOUNTING'}),
    at('20:03:00', {eid:2021}),
  ]);
  assert.equal(groups.length, 3);
  assert.equal(new Set(groups.map(group=>group.key)).size, 3);
});

test('latest heartbeat wins even when an older session has a different status or page', () => {
  const groups = groupPresenceSessions([
    at('20:01:00', {currentPage:'Archived Bids',status:'IDLE_UNCONFIRMED'}),
    at('20:04:00', {currentPage:'Projected Billings',status:'RECENT_ACTIVITY'}),
  ]);
  assert.equal(groups[0].latest.currentPage, 'Projected Billings');
  assert.equal(groups[0].latest.status, 'RECENT_ACTIVITY');
  assert.equal(groups[0].sessions[1].currentPage, 'Archived Bids');
});

test('equal heartbeats use latest activity then start time to select representative', () => {
  const groups = groupPresenceSessions([
    at('20:03:00', {currentPage:'Older',lastActiveAtUTC:'2026-10-15T20:01:00Z'}),
    at('20:03:00', {currentPage:'Newer',lastActiveAtUTC:'2026-10-15T20:02:00Z'}),
  ]);
  assert.equal(groups[0].latest.currentPage, 'Newer');
});

test('employee rows order by most recent heartbeat independent of original SQL order', () => {
  const groups = groupPresenceSessions([
    at('20:00:00', {eid:10}),
    at('20:05:00', {eid:11}),
    at('20:03:00', {eid:10}),
    at('20:02:00', {eid:12}),
  ]);
  assert.deepEqual(groups.map(group=>group.eid),[11,10,12]);
});

test('grouping preserves SQL response array and objects, including privacy contract', () => {
  const original = [at('20:01:00'),at('20:02:00')];
  const originalOrder = [...original];
  const groups = groupPresenceSessions(Object.freeze(original));
  assert.deepEqual(original, originalOrder);
  assert.equal(groups[0].sessions[0], original[1]);
  assert.equal(groups[0].sessions[1], original[0]);
  assert.equal(Object.keys(groups[0]).includes('sessionId'), false);
  assert.deepEqual(groupPresenceSessions(null), []);
});

test('grouping UI offers expandable sessions without adding presence polling or writes', () => {
  const source = readFileSync(new URL('../src/AdministrationPresence.jsx',import.meta.url),'utf8');
  const dashboard = readFileSync(new URL('../src/AdministrationDashboard.jsx',import.meta.url),'utf8');
  assert.match(source, /groupPresenceSessions\(sessions\)/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /setExpanded\(value => !value\)/);
  assert.match(source, /Sessions shown/);
  assert.match(source, /selectedStatus === 'ALL' \|\| latest.status === selectedStatus/);
  assert.doesNotMatch(source, /setInterval\(|fetch\(/);
  assert.match(dashboard, /fetch\('\/api\/admin\/presence'/);
  assert.doesNotMatch(dashboard, /setInterval\(/);
});
