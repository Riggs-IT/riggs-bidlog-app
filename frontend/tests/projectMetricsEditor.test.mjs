import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectMetricsEditor, metricsChanges, quantityDecimal,quantityWholeDisplay,quantityWholeEdit} from '../src/projectMetricsEditor.mjs';

function response(body, status = 200) {
  return {ok: status >= 200 && status < 300, status, json: async () => structuredClone(body)};
}
function setup(t, {canEdit = true, initial = {}, onPatch = null} = {}) {
  const server = {jobListId: 24, revision: 0, canEdit: true, squareFootage: '100.0000', cubicYards: '0', ...initial};
  const calls = [];
  const fetcher = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({url, method: options.method, body});
    if (options.method === 'GET') return response(server);
    if (onPatch) return onPatch(server, body);
    assert.equal(body.expectedRevision, server.revision);
    if (body.setSquareFootage) server.squareFootage = body.squareFootage;
    if (body.setCubicYards) server.cubicYards = body.cubicYards;
    server.revision++;
    return response({jobListId: 24, revision: server.revision, result: 'UPDATED'});
  };
  const editor = createProjectMetricsEditor({jobListId: 24, canEdit, fetcher,
    newId: () => 'ad76a88e-a605-4ef9-b069-cacc75bfc423', timeoutMs: 1500});
  t.after(() => editor.dispose());
  return {server, calls, editor, state: () => editor.getSnapshot(),
    writes: () => calls.filter(item => item.method === 'PATCH')};
}

test('valid zero is distinct from missing', () => {
  assert.equal(quantityDecimal('0'), '0');
  assert.equal(quantityDecimal('000.0000'), '0');
  assert.equal(quantityDecimal(null), null);
  assert.equal(quantityDecimal('0.1230'), '0.123');
  assert.throws(() => quantityDecimal('-1'));
  assert.throws(() => quantityDecimal('1e4'));
  assert.throws(() => quantityDecimal('2.00001'));
});

test('no write on initial read, unchanged zero, or discard', async t => {
  const h = setup(t); await h.editor.start();
  assert.equal(h.writes().length, 0);
  h.editor.edit('cubicYards', '0.0000');
  assert.deepEqual(metricsChanges(h.state().snapshot, h.state().draft), []);
  h.editor.edit('squareFootage', '250'); h.editor.discard();
  assert.equal(h.state().draft.squareFootage, '100');
  assert.equal(h.writes().length, 0);
});

test('one-field edit keeps unrelated CY unset; successful save does not retry', async t => {
  const h = setup(t); await h.editor.start();
  h.editor.edit('squareFootage', '250');
  assert.equal(await h.editor.save(), true);
  assert.equal(h.writes().length, 1);
  assert.deepEqual(h.writes()[0].body, {
    operationId: 'ad76a88e-a605-4ef9-b069-cacc75bfc423', expectedRevision: 0,
    setSquareFootage: true, setCubicYards: false, squareFootage: '250',
  });
  assert.equal(h.server.cubicYards, '0');
  assert.equal(await h.editor.save(), true);
  assert.equal(h.writes().length, 1);
});

test('zero override is sent explicitly, not treated as empty', async t => {
  const h = setup(t); await h.editor.start();
  h.editor.edit('squareFootage', '0');
  assert.equal(await h.editor.save(), true);
  assert.equal(h.writes()[0].body.squareFootage, '0');
});

test('stale revision blocks the PATCH', async t => {
  const h = setup(t); await h.editor.start();
  h.editor.edit('squareFootage', '350');
  h.server.revision = 1;
  assert.equal(await h.editor.save(), false);
  assert.equal(h.writes().length, 0);
  assert.equal(h.state().conflict, true);
});

test('changed fallback blocks the PATCH even when revision is still zero', async t => {
  const h = setup(t); await h.editor.start();
  h.editor.edit('squareFootage', '350');
  h.server.squareFootage = '101';
  assert.equal(await h.editor.save(), false);
  assert.equal(h.writes().length, 0);
});

test('uncertain PATCH result is held and never auto retried', async t => {
  const h = setup(t, {onPatch: () => {throw new Error('connection lost');}});
  await h.editor.start();
  h.editor.edit('squareFootage', '350');
  assert.equal(await h.editor.save(), false);
  assert.equal(h.state().unresolved, true);
  assert.equal(await h.editor.save(), false);
  assert.equal(h.writes().length, 1);
});

test('view-only sessions cannot mutate', async t => {
  const h = setup(t, {canEdit: false});
  await h.editor.start();
  h.editor.edit('squareFootage', '500');
  assert.equal(await h.editor.save(), false);
  assert.equal(h.writes().length, 0);
});

test('whole quantity display preserves historical decimals until an explicit edit',async t=>{
  const h=setup(t,{initial:{squareFootage:'100.2500',cubicYards:'50.7500'}});await h.editor.start();
  assert.equal(h.state().draft.squareFootage,'100');assert.equal(h.state().draft.cubicYards,'51');
  assert.deepEqual(metricsChanges(h.state().snapshot,h.state().draft),[]);
  h.editor.edit('squareFootage','250.25');assert.equal(await h.editor.save(),false);assert.equal(h.writes().length,0);
  h.editor.edit('squareFootage','250');assert.equal(await h.editor.save(),true);assert.equal(h.server.cubicYards,'50.7500');
  assert.equal(quantityWholeDisplay('999999999999999.5000'),'1000000000000000');
  assert.equal(quantityWholeEdit('0.0000'),'0');
});
