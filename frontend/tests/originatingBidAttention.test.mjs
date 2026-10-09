import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = name => fs.readFileSync(path.join(here, '..', 'src', name), 'utf8');

test('originating-bid attention uses the shared passive freshness machinery without a duplicate eager read', () => {
  const hook = src('useOriginatingBidAttention.js');
  assert.match(hook, /watchVisibleReads\(\s*owner\.load/);
  assert.match(hook, /\/api\/originating-bid\/attention/);
  assert.match(hook, /readOptions\(config\)/);
  assert.doesNotMatch(hook, /void owner\.load\(\{ passive: true \}\)/);
  assert.doesNotMatch(hook, /localStorage/);
});

test('notification bell groups originating-bid attention and refreshes after a successful link', () => {
  const app = src('App.jsx');
  assert.match(app, /Originating Bids Need Linking/);
  assert.match(app, /notification-originating-projects/);
  assert.match(app, /originatingBidAttentionData\.attentionCount/);
  assert.match(app, /originatingBidAttention\.refresh\(\{ passive: false \}\)/);
  assert.match(app, /openOriginatingBidAttentionProject/);
  assert.match(app, /'originating-bid'/);
  assert.match(app, /initialProjectControl=\{\s*selectedCurrentProjectControl\s*\}/);
});

test('fallback attention drawer reuses the existing manual originating-bid interface', () => {
  const drawer = src('OriginatingBidAttentionDrawer.jsx');
  assert.match(drawer, /import OriginatingBidPanel/);
  assert.match(drawer, /<OriginatingBidPanel/);
  assert.match(drawer, /onLinked=\{onLinked\}/);
});

test('current project drawer can open directly to the originating-bid control from a notification', () => {
  const drawer = src('CurrentProjectBillingDrawer.jsx');
  assert.match(drawer, /initialProjectControl = null/);
  assert.match(drawer, /setOpenProjectControl\(\s*initialProjectControl/);
  assert.match(drawer, /data-project-control/);
});

test('originating-bid notification project list never requires horizontal scrolling', () => {
  const styles = src('styles.css');

  assert.match(styles, /\.notification-list\s*\{[\s\S]*?overflow-x:\s*hidden;/);
  assert.match(styles, /\.notification-originating-projects\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?overflow-x:\s*hidden;/);
  assert.match(styles, /\.notification-originating-project\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?box-sizing:\s*border-box;/);
  assert.match(styles, /\.notification-originating-project-copy\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;[\s\S]*?overflow:\s*hidden;/);
});


test('notification panel closes on outside pointer or Escape without treating inside clicks as outside', () => {
  const app = src('App.jsx');
  assert.match(app, /const notificationCenterRef =\s*useRef\(null\)/);
  assert.match(app, /ref=\{notificationCenterRef\}/);
  assert.match(app, /document\.addEventListener\(\s*'pointerdown',\s*closeOnOutsidePointer/);
  assert.match(app, /!center\.contains\(event\.target\)/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /document\.removeEventListener\(\s*'pointerdown',\s*closeOnOutsidePointer/);
});


test('originating-bid notification opens from the entire project row', () => {
  const app = src('App.jsx');
  const styles = src('styles.css');

  assert.match(app, /<button[\s\S]*?className="notification-originating-project"[\s\S]*?onClick=\{\(\) =>[\s\S]*?openOriginatingBidAttentionProject\(item\)/);
  assert.match(app, /className="notification-originating-project-copy"/);
  assert.match(app, /className="notification-view-project"[\s\S]*?aria-hidden="true"/);
  assert.match(styles, /\.notification-originating-project\s*\{[\s\S]*?cursor:\s*pointer;/);
  assert.match(styles, /\.notification-originating-project:hover,[\s\S]*?\.notification-originating-project:focus-visible/);
});
