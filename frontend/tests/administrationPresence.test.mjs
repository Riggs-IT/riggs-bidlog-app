import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

const presence = {
  readOnly: true,
  source: 'RIGGSDATAHUB_USAGE_SESSIONS', availability: 'AVAILABLE',
  observedAtUTC: '2026-10-15T20:55:00Z',
  activityWindowSeconds: 120, idleWindowMinutes: 65, maxSessionsPerApp: 50,
  apps: [
    {appCode:'ACCOUNTING',openSessions:64,recentSessions:0,recentUsers:0,
      recentlyActiveSessions:0,recentHeartbeatSessions:0,idleUnconfirmedSessions:0,
      lastOpenHeartbeatAtUTC:'2026-10-09T17:38:37Z',truncated:false},
    {appCode:'BID_LOG',openSessions:213,recentSessions:1,recentUsers:1,
      recentlyActiveSessions:1,recentHeartbeatSessions:0,idleUnconfirmedSessions:0,
      lastOpenHeartbeatAtUTC:'2026-10-15T20:54:55Z',truncated:false},
    {appCode:'OPERATIONS',openSessions:2,recentSessions:0,recentUsers:0,
      recentlyActiveSessions:0,recentHeartbeatSessions:0,idleUnconfirmedSessions:0,
      lastOpenHeartbeatAtUTC:'2026-09-29T20:04:50Z',truncated:false},
  ],
  sessions:[{appCode:'BID_LOG',eid:2021,displayName:'Synthetic Employee',appRole:'ADMIN',
    currentPage:'Administration',status:'RECENT_ACTIVITY',
    startedAtUTC:'2026-10-15T20:54:00Z',lastActiveAtUTC:'2026-10-15T20:54:55Z',
    lastHeartbeatAtUTC:'2026-10-15T20:54:55Z'}],
};

test('three-app presence renders person only from bounded owner-only source',async t => {
  const vite = await createServer({
    root:fileURLToPath(new URL('../',import.meta.url)),
    server:{middlewareMode:true}, appType:'custom',logLevel:'silent',
  });
  t.after(async()=>{await vite.close();});
  const {default:Presence}=await vite.ssrLoadModule('/src/AdministrationPresence.jsx');
  const html=renderToString(React.createElement(Presence,{presence}))
    .replaceAll('<!-- -->','')
    .replaceAll('&#x27;', "'");
  for (const marker of ["Who's using Riggs apps",'Synthetic Employee','Administration',
    'Accounting','Operations','Bid Log','Last recorded','65 minutes','Recent activity',
    'not verified Microsoft sign-in']) {
    assert.ok(html.includes(marker), marker);
  }
  assert.doesNotMatch(html,/UsageSessionID|microsoftUsername|password|session token/i);
  const unavailable=renderToString(React.createElement(Presence,{presence:{availability:'UNAVAILABLE'}}));
  assert.match(unavailable,/could not be verified/);
  assert.doesNotMatch(unavailable,/Synthetic Employee/);
});

test('presence is owner-only passive GET; visible-only updates never POST session details',()=>{
  const src=readFileSync(new URL('../src/AdministrationDashboard.jsx',import.meta.url),'utf8');
  const backend=readFileSync(new URL('../../backend/app/main.py',import.meta.url),'utf8');
  assert.match(src,/fetch\('\/api\/admin\/presence'/);
  assert.match(src,/method: 'GET'/);
  assert.match(backend,/@app.get\("\/api\/admin\/presence"\)/);
  assert.match(backend,/Depends\(require_administration_owner\)/);
  // Stage 2D deliberately refreshes Administration only while visible, at most once a minute.
  assert.match(src,/setInterval\(refreshVisible, 60_000\)/);
  assert.match(src,/document\.visibilityState !== 'visible'/);
  assert.match(src,/window\.clearInterval\(timer\)/);
  assert.match(src,/'X-Riggs-Passive-Read': '1'/);
  // Presence remains a protected GET; automation never POSTs usage or session details.
  assert.doesNotMatch(src,/fetch\('\/api\/admin\/presence',[\s\S]{0,190}POST/);
});
