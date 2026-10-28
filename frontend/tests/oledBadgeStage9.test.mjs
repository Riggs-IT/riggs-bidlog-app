import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
const theme = read('theme.css');
const styles = read('styles.css');
const sourceFilters = read('ProjectionDisplay.css');
const app = read('App.jsx');

function block(css, selector) {
  const token = selector + ' {';
  const start = css.indexOf(token);
  assert.notEqual(start, -1, `Missing ${selector}`);
  const body = start + token.length;
  return css.slice(body, css.indexOf('}', body));
}

function luminance(hex) {
  const vals = hex.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2];
}

test('selected PM and No PM filters return to neutral gray without changing behavior', () => {
  assert.doesNotMatch(theme, /--projection-filter-active/);
  assert.doesNotMatch(theme, /\.projection-source-count-toggle\.active:not\(\.rebalance-count\)/);
  assert.match(block(sourceFilters, '.projection-source-count-toggle.active'), /var\(--accent\)/);
  assert.match(theme, /--accent:\s*#c7c7c7;/);
  assert.match(app, /aria-pressed=\{projectionSourceFilter === ALL \|\| projectionSourceFilter === 'pm'\}/);
});

test('unread notification counter has larger shared sizing and high-contrast neutral OLED colors', () => {
  const base = block(styles, '.notification-count');
  assert.match(base, /min-width:\s*22px;/);
  assert.match(base, /height:\s*22px;/);
  assert.match(base, /font-size:\s*12px;/);
  assert.match(base, /font-weight:\s*800;/);
  assert.match(base, /font-variant-numeric:\s*tabular-nums;/);
  const dark = block(theme, ':root[data-theme="dark"] .notification-count');
  assert.match(dark, /background:\s*#eeeeee;/);
  assert.match(dark, /color:\s*#151515;/);
  const contrast = (luminance('eeeeee') + .05) / (luminance('151515') + .05);
  assert.ok(contrast > 12, 'Notification count contrast must exceed 12:1');
  assert.match(app, /notificationCount > 99[\s\S]*?'99\+'/);
  assert.match(app, /className="notification-count"/);
});

test('meaningful statuses and OLED page colors do not drift', () => {
  for (const token of [
    '--bg: #0c0c0c;', '--surface: #191919;',
    '--pending-foundation: #85bde3;', '--warning: #d3a75f;',
  ]) assert.ok(theme.includes(token), token);
});
