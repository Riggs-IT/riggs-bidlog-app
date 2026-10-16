import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const dashboard=readFileSync(new URL('../src/AdministrationDashboard.jsx',import.meta.url),'utf8');
const board=readFileSync(new URL('../src/AdministrationLeaderboard.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/AdministrationUsagePanel.css',import.meta.url),'utf8');

test('automatic visible-only reads never POST or extend idle session',()=>{
  assert.match(dashboard,/setInterval\(refreshVisible, 60_000\)/);
  assert.match(dashboard,/document.visibilityState !== 'visible'/);
  assert.match(dashboard,/X-Riggs-Passive-Read/);
  assert.match(dashboard,/window.clearInterval\(timer\)/);
  assert.match(dashboard,/overviewInFlight.current/);
  assert.doesNotMatch(dashboard,/dashboard-cache\/refresh/);
});
test('all time and podium positions honor user request',()=>{
  assert.match(dashboard,/\[0, 7, 30, 90\]/);
  assert.match(board,/\[0, 'All Time'\]/);
  assert.match(board,/top\[1\]/);
  assert.match(board,/top\[0\]/);
  assert.match(board,/top\[2\]/);
  assert.match(css,/place-1/);
  assert.match(css,/place-2/);
  assert.match(css,/place-3/);
});
test('unhelpful session interpretation and technical essay removed',()=>{
  assert.doesNotMatch(dashboard,/Session interpretation|no automatic polling/);
  assert.doesNotMatch(board,/employee productivity|not deduplicated|heartbeat-credited active-use time/i);
});
