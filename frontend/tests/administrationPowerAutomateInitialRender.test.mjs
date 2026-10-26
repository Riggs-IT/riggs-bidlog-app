import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {unifiedFlowInventoryEvidence} from '../src/administrationPowerAutomateEvidence.mjs';

// Unknown inventory is intentionally null, not a verified empty tenant.
test('Power Automate starts safely before connection or inventory has loaded', async t => {
  assert.equal(unifiedFlowInventoryEvidence(null).flows, null);
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
  });
  t.after(async () => { await vite.close(); });
  const {default: PowerAutomate} = await vite.ssrLoadModule('/src/AdministrationPowerAutomate.jsx');
  const html = renderToString(React.createElement(PowerAutomate, {}));
  assert.match(html, /Checking Microsoft connection/);
  assert.doesNotMatch(html, /0 returned · Coverage/);
});
