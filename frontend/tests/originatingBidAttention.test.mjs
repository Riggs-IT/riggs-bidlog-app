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

test('notification bell shows flat project cards and refreshes after a successful link', () => {
  const app = src('App.jsx');
  assert.match(app, /<NotificationProjectCards/);
  assert.match(app, /originatingItems=\{originatingBidAttentionItems\}/);
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
  assert.match(drawer, /initialProjectControl === 'pm-forecast'/);
  assert.match(drawer, /setOpenProjectControl\(/);
  assert.match(drawer, /data-project-control/);
});

test('one vertically scrolling notification list contains both alert families', () => {
  const app = src('App.jsx');
  const cards = src('NotificationProjectCards.jsx');
  const styles = src('styles.css');
  assert.match(app, /<div className="notification-list">/);
  assert.match(app, /<NotificationProjectCards/);
  assert.match(styles, /\.notification-list\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/);
  assert.doesNotMatch(cards, /notification-originating-projects/);
  assert.match(cards, /notification-action-card/);
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


test('both notification types open from the entire clickable card', () => {
  const app = src('App.jsx');
  const cards = src('NotificationProjectCards.jsx');
  const styles = src('styles.css');
  assert.match(app, /onOpenOriginating=\{openOriginatingBidAttentionProject\}/);
  assert.match(app, /onOpenForecast=\{openAttentionProject\}/);
  assert.match(cards, /onClick=\{\(\) => onOpenOriginating\(item\)\}/);
  assert.match(cards, /onClick=\{\(\) => onOpenForecast\(item\)\}/);
  assert.match(cards, /className="notification-item notification-action-card"/);
  assert.match(cards, /aria-hidden="true"/);
  assert.match(styles, /\.notification-action-card:hover,[\s\S]*?\.notification-action-card:focus-visible/);
});
