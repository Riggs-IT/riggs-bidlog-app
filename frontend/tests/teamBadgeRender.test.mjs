import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {teamIdentityMap} from '../src/teamBadgeIdentity.js';

test('four staff roles render Cognito colors and initials consistently without leaking extra profile details', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {ProjectTeamBadges} = await vite.ssrLoadModule('/src/BillingDisplay.jsx');
  const identities = teamIdentityMap([
    {pm:'PM Example', pmInitials:'PM', pmHexColor:'#234567'},
    {pm:'PE Example', pmInitials:'PE', pmHexColor:'#F1C40F'},
    {pm:'APM Example', pmInitials:'AP', pmHexColor:'#713A97'},
    {pm:'Super Example', pmInitials:'SP', pmHexColor:'#111111'},
  ]);
  const render = properties => renderToString(
    React.createElement(ProjectTeamBadges, {teamIdentityByName: identities, ...properties})
  );
  const html = render({pm:'PM Example', pe:'PE Example', apm:'APM Example', superintendent:'Super Example'});
  for (const [role, name, hex] of [
    ['PM','PM Example','#234567'],
    ['PE','PE Example','#F1C40F'],
    ['APM','APM Example','#713A97'],
    ['Superintendent','Super Example','#111111'],
  ]) {
    assert.match(html, new RegExp(`title="${role}: ${name}" style="background-color:${hex}`, 'i'));
  }
  assert.match(html, /<strong>PE<\/strong>/);
  assert.doesNotMatch(html, /HexColorCode|pmSeparated|ITUserID/);

  const explicit = render({pe:'PE Example', peHexColor:'#8899AA', peInitials:'EX'});
  assert.match(explicit, /background-color:#8899AA/i);
  assert.match(explicit, /<strong>EX<\/strong>/);

  const unknown = render({pe:'New PE', pm:'No PM Assigned'});
  assert.match(unknown, /title="PE: New PE"/);
  assert.doesNotMatch(unknown, /title="PM: No PM Assigned"/);
  assert.doesNotMatch(unknown, /<strong>NA<\/strong>/);
});
