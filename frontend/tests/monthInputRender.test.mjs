import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

async function loadMonthInput(t) {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
  });
  t.after(async () => { await vite.close(); });
  return (await vite.ssrLoadModule('/src/MonthInput.jsx')).default;
}

// Real React/Vite imports are intentional: the host must run these, not skip
// them or replace React with a mock when certifying the complete application.
test('shared month control renders an accessible native month input', async t => {
  const MonthInput = await loadMonthInput(t);
  const html = renderToString(React.createElement(MonthInput, {
    value: '2026-09', onChange: () => {}, label: 'From Month',
  }));
  assert.match(html, /type="month"/);
  assert.match(html, /value="2026-09"/);
  assert.match(html, /aria-label="From Month"/);
  assert.doesNotMatch(html, /month-picker-popup/);
});

test('unsupported month input renders calendar button without editable free text', async t => {
  const MonthInput = await loadMonthInput(t);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {createElement: () => ({get type() {return 'text';}, set type(_) {}})},
  });
  let html;
  try {
    html = renderToString(React.createElement(MonthInput, {
      value: '2026-09', onChange: () => {}, label: 'From Month',
    }));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  }
  assert.match(html, /September 2026/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /<svg/);
  assert.doesNotMatch(html, /<input/);
});

test('native month control preserves normalized value and escapes its label', async t => {
  const MonthInput = await loadMonthInput(t);
  const html = renderToString(React.createElement(MonthInput, {
    value: '2027-08', onChange: () => {}, label: 'Through <Month>',
  }));
  assert.match(html, /value="2027-08"/);
  assert.match(html, /Through &lt;Month&gt;/);
  assert.doesNotMatch(html, /<Month>/);
});
