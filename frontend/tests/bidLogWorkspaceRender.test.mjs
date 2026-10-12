import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

test('Bid Log renders for all app roles', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });

  t.after(async () => {
    await vite.close();
  });

  const {default: BidLogWorkspace} =
    await vite.ssrLoadModule('/src/BidLogWorkspace.jsx');

  for (const appRole of ['ADMIN', 'OPERATIONS', 'VIEWER']) {
    const html = renderToString(
      React.createElement(BidLogWorkspace, {
        user: {
          eid: 2172,
          appRole,
          workspaceProfile: 'PM',
          displayName: 'Test PM',
        },
        pmDirectory: [],
      })
    );

    assert.match(html, /Active Bids/);
  }
});
