import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectEditor, PROJECT_FIELDS, projectDraft, projectBody, changedFields, mergeDraft, projectRequestError } from '../src/activeProjectSave.js';

const copy = value => structuredClone(value);
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => copy(body) });
function fixture(id = 24) {
  const job = Object.fromEntries(Object.keys(PROJECT_FIELDS).map(key => [key, null]));
  Object.assign(job, { jobListId: id, jobNumber: '11111', title: '966', jobName: 'TEST - Automation',
    jobType: 'OTH', purpose: 'RET', retention: '10%', pmITUserId: 926, apmITUserId: 1015, peITUserId: 873,
    streetAddress: 'Original address', cityStateZip: '85387', gc: 'Construction', gcpm: 'Riggs' });
  return { project: { job, lookups: { people: [], jobTypes: ['OTH'], purposes: ['RET'] } },
    general: { jobListId: id, jobNumber: '11111', cognitoEntryId: 966, entryVersion: 298, writeEnabled: true, contractRaw: false,
      values: { scope: 'Original scope', leed: false, ndaRequired: false, numberOfBuildings: 2,
        buildingNames: [{ id: 'b1', name: 'A' }] } } };
}
async function setup(t, { id = 24, canEdit = true } = {}) {
  const server = fixture(id);
  const calls = [];
  const h = { server, calls, intercept: null };
  const fetcher = async (url, options) => {
    const section = url.endsWith('/cognito-general') ? 'general' : 'project';
    const call = { section, method: options.method, body: options.body ? JSON.parse(options.body) : null, options };
    calls.push(call);
    const overridden = await h.intercept?.(call);
    if (overridden) return overridden;
    if (call.method === 'GET') return response(server[section]);
    if (section === 'general') {
      assert.equal(call.body.expectedVersion, server.general.entryVersion);
      Object.assign(server.general.values, copy(call.body.changes));
      server.general.values.buildingNames.forEach((row, index) => { if (!row.id) row.id = `new-${index}`; });
      server.general.entryVersion++;
      return response({ result: 'VERIFIED', changedFields: Object.keys(call.body.changes), detail: server.general, downstreamVerified: false });
    }
    assert.deepEqual(Object.keys(call.body).sort(), Object.keys(PROJECT_FIELDS).sort());
    Object.assign(server.project.job, copy(call.body));
    return response({ status: 'ok', action: 'updated', jobListId: id, queuedSync: ['SHAREPOINT', 'COGNITO'] });
  };
  h.editor = createProjectEditor({ jobListId: id, canEdit, fetcher, timeoutMs: 1000 });
  h.state = () => h.editor.getSnapshot();
  h.writes = () => calls.filter(call => call.method !== 'GET');
  t.after(() => h.editor.dispose());
  await h.editor.start();
  return h;
}

test('loads both sections without issuing writes', async t => {
  const h = await setup(t); assert.equal(h.writes().length, 0); assert.ok(h.state().project.draft); assert.ok(h.state().general.draft);
});
test('no-op Save does not request or mutate anything', async t => {
  const h = await setup(t); const count = h.calls.length; await h.editor.save(); assert.equal(h.calls.length, count);
});
test('one Save sends General first, then the full 15-field project snapshot', async t => {
  const h = await setup(t); h.editor.edit('project', 'gcpm', 'New contact'); h.editor.edit('general', 'scope', 'New scope');
  await h.editor.save(); assert.deepEqual(h.writes().map(c => c.method), ['PATCH', 'PUT']);
  assert.deepEqual(h.writes()[0].body.changes, { scope: 'New scope' });
  assert.equal(h.state().project.draft.gcpm, 'New contact'); assert.equal(h.state().general.draft.scope, 'New scope');
  assert.equal(changedFields('project', h.state().project.base, h.state().project.draft).length, 0);
  assert.equal(changedFields('general', h.state().general.base, h.state().general.draft).length, 0);
});
test('General-only save does not call the SQL update route', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'New scope'); await h.editor.save();
  assert.deepEqual(h.writes().map(c => c.method), ['PATCH']); assert.equal(h.state().notice.message, 'Changes saved.');
});
test('project-only save does not PATCH General', async t => {
  const h = await setup(t); h.editor.edit('project', 'scheduleNotes', 'Note'); await h.editor.save();
  assert.deepEqual(h.writes().map(c => c.method), ['PUT']);
});
test('repeat Save does not replay either successful write', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'New'); h.editor.edit('project', 'gcpm', 'Person');
  await h.editor.save(); await h.editor.save(); assert.equal(h.writes().length, 2);
});
test('double-click protection takes effect before the first await', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'New');
  await Promise.all([h.editor.save(), h.editor.save()]); assert.equal(h.writes().length, 1);
});
test('all sections validate before any write: invalid date range blocks General too', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'New');
  h.editor.edit('project', 'plannedStartDate', '2026-10-10'); h.editor.edit('project', 'plannedEndDate', '2026-09-10');
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.match(h.state().notice.message, /before/);
});
test('invalid building count blocks a valid project write', async t => {
  const h = await setup(t); h.editor.edit('general', 'numberOfBuildings', '1.5'); h.editor.edit('project', 'gcpm', 'Person');
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.match(h.state().notice.message, /whole number/);
});
test('invalid selected person blocks every destination', async t => {
  const h = await setup(t); h.editor.edit('project', 'pmITUserId', '-1'); h.editor.edit('general', 'scope', 'New');
  await h.editor.save(); assert.equal(h.writes().length, 0);
});
test('length checks match SQL field capacity before starting a partial save', async t => {
  const h = await setup(t); h.editor.edit('project', 'scheduleNotes', 'x'.repeat(1001)); h.editor.edit('general', 'scope', 'New');
  await h.editor.save(); assert.equal(h.writes().length, 0);
});
test('scope clear remains an explicit null PATCH', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', ''); await h.editor.save();
  assert.deepEqual(h.writes()[0].body.changes, { scope: null });
});
test('unchanged IDs never become dirty from DOM strings', async t => {
  const h = await setup(t); h.editor.edit('project', 'pmITUserId', '926'); await h.editor.save(); assert.equal(h.writes().length, 0);
});
test('Discard resets both drafts without any API write', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'New'); h.editor.edit('project', 'gcpm', 'Person');
  h.editor.discard(); assert.equal(h.state().general.draft.scope, 'Original scope'); assert.equal(h.state().project.draft.gcpm, 'Riggs'); assert.equal(h.writes().length, 0);
});
test('a changed server value on an untouched SQL field is preserved in full snapshot', async t => {
  const h = await setup(t); h.editor.edit('project', 'gcpm', 'Person'); h.server.project.job.streetAddress = 'External address';
  await h.editor.save(); assert.equal(h.writes()[0].body.streetAddress, 'External address');
});
test('fresh unrelated Cognito version uses the latest version without clearing draft', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.server.general.entryVersion = 400;
  h.server.general.values.leed = true;
  await h.editor.save(); assert.equal(h.writes()[0].body.expectedVersion, 400); assert.deepEqual(h.writes()[0].body.changes, { scope: 'Mine' });
  assert.equal(h.state().general.draft.leed, 'true');
});
test('a conflict detected in either section prevents all initial writes', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.editor.edit('project', 'gcpm', 'Person');
  h.server.general.values.scope = 'Someone else'; h.server.general.entryVersion++;
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.equal(h.state().conflicts[0].field, 'scope');
  assert.equal(h.state().general.draft.scope, 'Mine'); assert.equal(h.state().project.draft.gcpm, 'Person');
});
test('Keep my edit resolves a conflict but does not write until Save', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.server.general.values.scope = 'External';
  await h.editor.save(); h.editor.resolve('general', 'scope', 'mine'); assert.equal(h.writes().length, 0);
  await h.editor.save(); assert.equal(h.writes().length, 1); assert.equal(h.server.general.values.scope, 'Mine');
});
test('Use current value clears only its own conflict and preserves other edits', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.editor.edit('general', 'leed', 'true');
  h.server.general.values.scope = 'External'; await h.editor.save(); h.editor.resolve('general', 'scope', 'latest');
  assert.equal(h.state().general.draft.scope, 'External'); assert.equal(h.state().general.draft.leed, 'true');
  await h.editor.save(); assert.deepEqual(h.writes()[0].body.changes, { leed: true });
});
test('server already at requested value needs no write', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.server.general.values.scope = 'Mine';
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.match(h.state().notice.message, /No save/);
});
test('fresh read failure before any write preserves both drafts', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.editor.edit('project', 'gcpm', 'Person');
  h.intercept = c => c.method === 'GET' && c.section === 'general' ? response({ detail: 'cognito_unavailable' }, 503) : null;
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.equal(h.state().general.draft.scope, 'Mine'); assert.equal(h.state().project.draft.gcpm, 'Person');
});
test('successful General, rejected project: a second Save retries only project', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.editor.edit('project', 'gcpm', 'Person');
  h.intercept = c => c.method === 'PUT' ? response({ detail: 'invalid_active_project_update' }, 422) : null;
  await h.editor.save(); assert.match(h.state().notice.message, /General Information saved/);
  assert.equal(h.state().general.draft.scope, h.state().general.base.scope); assert.equal(h.state().project.draft.gcpm, 'Person');
  h.intercept = null; await h.editor.save(); assert.deepEqual(h.writes().map(c => c.method), ['PATCH', 'PUT', 'PUT']);
});
test('Discard after partial success does not revert the saved General changes', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.editor.edit('project', 'gcpm', 'Person');
  h.intercept = c => c.method === 'PUT' ? response({ detail: 'invalid_active_project_update' }, 422) : null;
  await h.editor.save(); h.editor.discard(); assert.equal(h.state().general.draft.scope, 'Mine'); assert.equal(h.state().project.draft.gcpm, 'Riggs'); assert.equal(h.writes().length, 2);
});
test('SQL conflict introduced during General write stops the second destination', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.editor.edit('project', 'gcpm', 'Person');
  h.intercept = c => { if (c.method === 'PATCH') h.server.project.job.gcpm = 'External'; };
  await h.editor.save(); assert.deepEqual(h.writes().map(c => c.method), ['PATCH']); assert.equal(h.state().conflicts[0].section, 'project');
});
test('General-triggered unrelated SQL updates are merged before the full SQL write', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.editor.edit('project', 'gcpm', 'Person');
  h.intercept = c => { if (c.method === 'PATCH') h.server.project.job.cityStateZip = 'Phoenix, AZ'; };
  await h.editor.save(); assert.equal(h.writes()[1].body.cityStateZip, 'Phoenix, AZ');
});
test('version conflict at PATCH does not auto-retry or drop either draft', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.editor.edit('project', 'gcpm', 'Person');
  h.intercept = c => c.method === 'PATCH' ? response({ detail: { code: 'cognito_general_version_conflict', message: 'Version changed.', writeAttempted: false } }, 409) : null;
  await h.editor.save(); assert.equal(h.writes().length, 1); assert.equal(h.state().general.draft.scope, 'Mine'); assert.equal(h.state().project.draft.gcpm, 'Person');
});
test('General transport loss after apply is read back without another PATCH', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine');
  h.intercept = c => { if (c.method === 'PATCH') { h.server.general.values.scope = 'Mine'; h.server.general.entryVersion++; throw new TypeError('Network lost'); } };
  await h.editor.save(); await h.editor.save(); assert.equal(h.writes().length, 1); assert.equal(h.state().general.draft.scope, 'Mine'); assert.equal(h.state().general.unresolved, null);
  assert.match(h.state().notice.message, /now matches/);
});
test('unknown write not observed requires explicit review, not an automatic resend', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine');
  h.intercept = c => { if (c.method === 'PATCH') throw new TypeError('Network lost'); };
  await h.editor.save(); assert.equal(h.state().conflicts.length, 1); await h.editor.save(); assert.equal(h.writes().length, 1);
  h.intercept = null; h.editor.resolve('general', 'scope', 'mine'); await h.editor.save(); assert.equal(h.writes().length, 2);
});
test('unknown building creation uses read-back IDs and never duplicates the added row', async t => {
  const h = await setup(t); h.editor.edit('general', 'buildingNames', [{ id: 'b1', name: 'A' }, { id: null, name: 'B' }]);
  h.intercept = c => { if (c.method === 'PATCH') {
    h.server.general.values.buildingNames.push({ id: 'assigned-b2', name: 'B' }); h.server.general.entryVersion++; throw new TypeError('Network lost');
  } };
  await h.editor.save(); await h.editor.save(); assert.equal(h.writes().length, 1); assert.equal(h.state().general.draft.buildingNames[1].id, 'assigned-b2');
});
test('unknown SQL apply is checked without re-enqueueing a successful snapshot', async t => {
  const h = await setup(t); h.editor.edit('project', 'gcpm', 'Person');
  h.intercept = c => { if (c.method === 'PUT') { Object.assign(h.server.project.job, c.body); throw new TypeError('Network lost'); } };
  await h.editor.save(); await h.editor.save(); assert.equal(h.writes().length, 1); assert.equal(h.state().project.unresolved, null);
});
test('read failure after acknowledged SQL save never becomes a duplicate PUT', async t => {
  const h = await setup(t); h.editor.edit('project', 'gcpm', 'Person'); let acknowledged = false;
  h.intercept = c => { if (c.method === 'PUT') acknowledged = true;
    if (acknowledged && c.method === 'GET') return response({ detail: 'data_api_unavailable' }, 503); };
  await h.editor.save(); assert.equal(h.state().project.draft.gcpm, 'Person'); assert.equal(h.state().project.unresolved, null);
  await h.editor.save(); assert.equal(h.writes().length, 1);
});
test('mismatched SQL read after acknowledgement is flagged, not silently substituted', async t => {
  const h = await setup(t); h.editor.edit('project', 'gcpm', 'Person'); let acknowledged = false;
  h.intercept = c => { if (c.method === 'PUT') acknowledged = true;
    if (acknowledged && c.method === 'GET') { const data = copy(h.server.project); data.job.gcpm = 'External'; return response(data); } };
  await h.editor.save(); assert.equal(h.state().project.draft.gcpm, 'Person'); assert.equal(h.state().conflicts.length, 1); assert.equal(h.writes().length, 1);
});
test('uncertain write plus failed read blocks Save until exceptional recovery succeeds', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); let attempted = false;
  h.intercept = c => { if (c.method === 'PATCH') { attempted = true; throw new TypeError('Network lost'); }
    if (attempted && c.method === 'GET') return response({ detail: 'cognito_unavailable' }, 503); };
  await h.editor.save(); assert.ok(h.state().general.unresolved); await h.editor.save(); assert.equal(h.writes().length, 1);
  h.intercept = null; await h.editor.load('general'); assert.equal(h.state().general.unresolved, null); assert.equal(h.state().conflicts.length, 1); assert.equal(h.state().general.draft.scope, 'Mine');
});
test('protected-state verification failure never clears merely because scoped fields match', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine');
  h.intercept = c => { if (c.method === 'PATCH') { h.server.general.values.scope = 'Mine';
    return response({ detail: { code: 'cognito_general_verification_failed', writeAttempted: true, message: 'Unrelated drift.' } }, 502); } };
  await h.editor.save(); assert.equal(h.state().general.unresolved.critical, true);
  await h.editor.load('general'); await h.editor.save(); assert.equal(h.writes().length, 1); assert.equal(h.state().general.unresolved.critical, true);
});
test('the current canary gate is enforced client-side without changing server scope', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); h.server.general.writeEnabled = false;
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.match(h.state().notice.message, /not enabled/);
});
test('non-test jobs never load or write the new General endpoint', async t => {
  const h = await setup(t, { id: 485 }); h.editor.edit('project', 'gcpm', 'Person'); await h.editor.save();
  assert.ok(h.calls.every(c => c.section === 'project')); assert.equal(h.writes().length, 1);
});
test('viewer cannot edit either draft or invoke Save', async t => {
  const h = await setup(t, { canEdit: false }); h.editor.edit('project', 'gcpm', 'Person'); h.editor.edit('general', 'scope', 'Mine');
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.equal(h.state().project.draft.gcpm, 'Riggs');
});
test('edits attempted during a save do not mutate the in-flight draft', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine');
  h.intercept = c => { if (c.method === 'PATCH') h.editor.edit('general', 'scope', 'Changed during save'); };
  await h.editor.save(); assert.equal(h.state().general.draft.scope, 'Mine');
});
test('structured validation errors are safe display strings', () => {
  assert.equal(typeof projectRequestError([{ msg: 'Invalid', input: { secret: 'omitted' } }]), 'string');
  assert.equal(projectRequestError({ message: 'Readable' }), 'Readable');
});
test('incomplete project read does not replace stored values or send clears', async t => {
  const h = await setup(t); h.editor.edit('project', 'gcpm', 'Person');
  h.intercept = c => c.method === 'GET' && c.section === 'project' ? response({ job: { jobListId: 24 }, lookups: {} }) : null;
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.equal(h.state().project.draft.gcpm, 'Person');
});
test('wrong General identity prevents writes and preserves the entire draft', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine');
  h.intercept = c => c.method === 'GET' && c.section === 'general' ? response({ ...h.server.general, cognitoEntryId: 999 }) : null;
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.equal(h.state().general.draft.scope, 'Mine');
});
test('malformed successful PATCH response is treated as an uncertain outcome', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine');
  h.intercept = c => c.method === 'PATCH' ? response({ result: 'VERIFIED' }) : null;
  await h.editor.save(); assert.equal(h.writes().length, 1); assert.equal(h.state().conflicts.length, 1);
});
test('building IDs removed elsewhere are never reused or silently recreated', async t => {
  const h = await setup(t); h.editor.edit('general', 'buildingNames', [{ id: 'b1', name: 'Edited' }]);
  h.server.general.values.buildingNames = []; await h.editor.save(); h.editor.resolve('general', 'buildingNames', 'mine');
  assert.equal(h.writes().length, 0); assert.equal(h.state().conflicts.length, 1); assert.match(h.state().notice.message, /removed elsewhere/);
});
test('dispose prevents a late read or response from writing into a closed editor', async t => {
  const h = await setup(t); h.editor.edit('general', 'scope', 'Mine'); let release;
  h.intercept = c => c.method === 'GET' && c.section === 'general' ? new Promise(resolve => { release = () => resolve(response(h.server.general)); }) : null;
  const promise = h.editor.save(); await new Promise(resolve => setImmediate(resolve)); h.editor.dispose(); release(); await promise;
  assert.equal(h.writes().length, 0);
});
test('same-job restart after cleanup ignores the previous generation response', async () => {
  const data = fixture(); const waits = []; const calls = [];
  const editor = createProjectEditor({ jobListId: 24, canEdit: true, fetcher: (url, options) => new Promise(resolve => {
    calls.push(options); waits.push(() => resolve(response(url.endsWith('cognito-general') ? data.general : data.project)));
  }) });
  const first = editor.start(); editor.dispose(); const second = editor.start();
  waits.slice(2).forEach(fn => fn()); await second;
  const snapshot = editor.getSnapshot(); waits.slice(0, 2).forEach(fn => fn()); await first;
  assert.equal(editor.getSnapshot(), snapshot); editor.dispose();
});
test('project body contains exactly the established required 15 keys', () => {
  const draft = projectDraft(fixture().project); assert.equal(Object.keys(projectBody(draft)).length, 15);
  assert.equal(projectBody(draft).pmITUserId, 926); assert.equal(projectBody(draft).plannedStartDate, null);
});

test('leading-zero building count is a semantic no-op, not an uncertain write', async t => {
  const h = await setup(t); h.editor.edit('general', 'numberOfBuildings', '02');
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.equal(h.state().general.draft.numberOfBuildings, '2');
});
test('impossible calendar date is rejected before either write', async t => {
  const h = await setup(t); h.editor.edit('project', 'plannedStartDate', '2026-02-31'); h.editor.edit('general', 'scope', 'New');
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.match(h.state().notice.message, /valid/);
});
test('object-valued SQL fields are not stringified into a destructive snapshot', async t => {
  const h = await setup(t); h.editor.edit('project', 'gcpm', 'New'); h.server.project.job.streetAddress = { unexpected: 'object' };
  await h.editor.save(); assert.equal(h.writes().length, 0); assert.equal(h.state().project.draft.streetAddress, 'Original address');
});
