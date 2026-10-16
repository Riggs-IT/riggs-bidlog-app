import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

const fixture = {
  readOnly: true, availability: 'AVAILABLE', source: 'RIGGSDATAHUB_USAGE_SESSIONS',
  metric: 'HEARTBEAT_CREDITED_ACTIVE_SECONDS',
  windowRule: 'SESSION_STARTED_IN_ARIZONA_WINDOW',
  overlapRule: 'SESSION_WINDOW_OVERLAP_WARNING_NOT_DEDUPED',
  observedAtUTC: '2026-10-16T16:05:00Z', windowStartUTC: '2026-09-17T07:00:00Z',
  windowStartArizonaDate: '2026-09-17', windowDays: 30, appCode: 'ALL',
  employeeLimit: 200, employeesTruncated: false, totalEmployees: 2,
  totalSessions: 5, totalRecordedActiveSeconds: 5400,
  totalPossibleOverlapSessions: 2, carryInSessions: 0, excludedInvalidSessions: 0,
  employees: [
    {rank:1, eid:2021, displayName:'Synthetic Alpha', recordedActiveSeconds:3600,
      sessionCount:3, appsUsed:2, possibleOverlapSessions:2},
    {rank:2, eid:176, displayName:'Synthetic Beta', recordedActiveSeconds:1800,
      sessionCount:2, appsUsed:1, possibleOverlapSessions:0},
  ],
};

async function withComponents(t) {
  const vite = await createServer({
    root:fileURLToPath(new URL('../',import.meta.url)),
    server:{middlewareMode:true}, appType:'custom', logLevel:'silent',
  });
  t.after(async() => { await vite.close(); });
  const {default:Leaderboard}=await vite.ssrLoadModule('/src/AdministrationLeaderboard.jsx');
  const {default:Usage}=await vite.ssrLoadModule('/src/AdministrationUsagePanel.jsx');
  return {Leaderboard,Usage};
}

test('leaderboard shows medal podium, rest below and All Time selector', async t => {
  const {Leaderboard}=await withComponents(t);
  const data={...fixture, totalEmployees:4, totalSessions:7, totalRecordedActiveSeconds:7200,
    totalPossibleOverlapSessions:2, employees:[...fixture.employees,
      {rank:3, eid:400,displayName:'Synthetic Gamma',recordedActiveSeconds:1200,sessionCount:1,appsUsed:1,possibleOverlapSessions:0},
      {rank:4,eid:500,displayName:'Synthetic Delta',recordedActiveSeconds:600,sessionCount:1,appsUsed:1,possibleOverlapSessions:0}]};
  const html=renderToString(React.createElement(Leaderboard,{
    leaderboard:data, days:30,appCode:'ALL',loading:false,
    onDaysChange:()=>{},onAppChange:()=>{},
  })).replaceAll('<!-- -->','');
  for (const label of ['Synthetic Alpha','Synthetic Beta','Synthetic Gamma','Synthetic Delta',
    '🥇','🥈','🥉','1st','2nd','3rd','Everyone else','All Time', 'All applications']) {
    assert.ok(html.includes(label),label);
  }
  assert.doesNotMatch(html,/Last 30 Arizona days|Session interpretation|not deduplicated|employee productivity/i);
  assert.doesNotMatch(html,/email@|microsoftUsername|oid|UsageSessionID|password/i);
});

test('unavailable and loading states cannot impersonate a genuine zero', async t => {
  const {Leaderboard}=await withComponents(t);
  const props={days:7,appCode:'BID_LOG',onDaysChange:()=>{},onAppChange:()=>{}};
  const unavailable=renderToString(React.createElement(Leaderboard,{
    ...props,leaderboard:{availability:'UNAVAILABLE'},loading:false,
  }));
  assert.match(unavailable,/temporarily unavailable/);
  assert.doesNotMatch(unavailable,/No recorded sessions|Synthetic Alpha/);
  const loading=renderToString(React.createElement(Leaderboard,{
    ...props,leaderboard:null,loading:true,
  }));
  assert.match(loading,/Updating scores/);
  assert.doesNotMatch(loading,/No recorded sessions/);
});

test('owner toggle uses only one active panel and no large employee history on live view', async t => {
  const {Usage}=await withComponents(t);
  const html=renderToString(React.createElement(Usage,{
    mode:'LEADERBOARD', leaderboard:fixture, presence:null,
    days:30, appCode:'ALL', loading:false,
    onModeChange:()=>{},onDaysChange:()=>{},onAppChange:()=>{},
  }));
  assert.match(html,/Live Users/);
  assert.match(html,/Usage Leaderboard/);
  assert.match(html,/aria-selected="true"/);
  assert.match(html,/Synthetic Alpha/);
  assert.doesNotMatch(html,/Sessions shown|Recent heartbeat/);
});

test('selected-only reads and visible minute updates are passive and bounded',()=>{
  const dashboard=readFileSync(new URL('../src/AdministrationDashboard.jsx',import.meta.url),'utf8');
  const backend=readFileSync(new URL('../../backend/app/main.py',import.meta.url),'utf8');
  const auth=readFileSync(new URL('../../backend/app/auth.py',import.meta.url),'utf8');
  const dataApi=readFileSync(new URL('../../backend/app/data_api.py',import.meta.url),'utf8');
  assert.match(dashboard,/fetch\('\/api\/admin\/presence'/);
  assert.match(dashboard,/fetch\(`\/api\/admin\/leaderboard\?days=\$\{days\}&app=\$\{encodeURIComponent\(appCode\)\}`/);
  assert.match(dashboard,/X-Riggs-Passive-Read/);
  assert.match(dashboard,/usagePending\.current\?\.abort\(\)/);
  assert.match(dashboard,/useImperativeHandle\(refreshApiRef/);
  assert.match(dashboard,/setInterval\(refreshVisible, 60_000\)/);
  assert.match(dashboard,/document.visibilityState !== 'visible'/);
  assert.match(dashboard,/window.clearInterval\(timer\)/);
  assert.match(dashboard,/lastAutoAt.current/);
  assert.doesNotMatch(dashboard,/dashboard-cache\/refresh/);
  assert.match(backend,/@app.get\("\/api\/admin\/leaderboard"\)/);
  assert.match(backend,/Depends\(require_administration_owner\)/);
  assert.match(auth,/"\/api\/admin\/leaderboard"/);
  assert.match(dataApi,/"\/v1\/bid-log\/admin\/leaderboard"/);
});
