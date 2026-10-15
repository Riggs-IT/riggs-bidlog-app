import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

function session(eid, heartbeat, overrides={}) {
  return {
    appCode:'BID_LOG', eid, displayName:eid===1658?'Synthetic Employee A':'Synthetic Employee B',
    appRole:'VIEWER', currentPage:'Projected Billings',status:'RECENT_ACTIVITY',
    startedAtUTC:'2026-10-15T20:00:00Z',lastActiveAtUTC:heartbeat,
    lastHeartbeatAtUTC:heartbeat, ...overrides,
  };
}

test('live users renders one collapsed row per employee/app and offers drilldown', async t => {
  const vite = await createServer({
    root:fileURLToPath(new URL('../',import.meta.url)),
    server:{middlewareMode:true},appType:'custom',logLevel:'silent',
  });
  t.after(async()=>{await vite.close();});
  const {default:Presence}=await vite.ssrLoadModule('/src/AdministrationPresence.jsx');
  const presence = {
    readOnly:true,availability:'AVAILABLE',observedAtUTC:'2026-10-15T20:55:00Z',
    apps:[
      {appCode:'BID_LOG',openSessions:7,recentSessions:5,recentUsers:2,
        recentlyActiveSessions:1,lastOpenHeartbeatAtUTC:'2026-10-15T20:54:55Z',truncated:false},
    ],
    sessions:[
      session(1658,'2026-10-15T20:53:00Z',{currentPage:'Older archived page',status:'IDLE_UNCONFIRMED'}),
      session(1658,'2026-10-15T20:54:55Z',{currentPage:'Projected Billings'}),
      session(1658,'2026-10-15T20:52:00Z',{status:'IDLE_UNCONFIRMED'}),
      session(2021,'2026-10-15T20:53:00Z',{status:'IDLE_UNCONFIRMED'}),
      session(2021,'2026-10-15T20:54:00Z',{status:'RECENT_HEARTBEAT'}),
    ],
  };
  const html=renderToString(React.createElement(Presence,{presence}))
    .replaceAll('<!-- -->','');
  assert.equal((html.match(/class="administration-presence-expand"/g)||[]).length,2);
  assert.equal((html.match(/EID 1658/g)||[]).length,1);
  assert.equal((html.match(/EID 2021/g)||[]).length,1);
  assert.match(html,/3 sessions/);
  assert.match(html,/2 sessions/);
  assert.match(html,/aria-expanded="false"/);
  assert.doesNotMatch(html,/Older archived page/); // only latest page in the collapsed row
  assert.doesNotMatch(html,/session report[s]? for/);
  assert.doesNotMatch(html,/UsageSessionID|microsoftUsername|session token/i);
});
