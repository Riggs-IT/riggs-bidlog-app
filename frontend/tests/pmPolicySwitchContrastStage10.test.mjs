import { readSource } from './helpers/readSource.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const css = readSource(new URL('../src/styles.css', import.meta.url), 'utf8');
const theme = readSource(new URL('../src/theme.css', import.meta.url), 'utf8');
const pmPanel = readSource(new URL('../src/PMForecastPanel.jsx', import.meta.url), 'utf8');

function rule(source, selector) {
  const marker = `${selector} {`;
  const at = source.indexOf(marker);
  assert.notEqual(at, -1, `Missing ${selector}`);
  const open = at + marker.length;
  return source.slice(open, source.indexOf('}', open));
}

function lightness(hex) {
  const rgb = hex.replace('#', '').match(/.{2}/g).map(part => parseInt(part, 16) / 255);
  const linear = rgb.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
function contrast(a, b) {
  const x = lightness(a), y = lightness(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
function token(source, themeSelector, name) {
  const body = rule(source, themeSelector);
  const found = body.match(new RegExp(String.raw`(?:^|\n)\s*${name}:\s*(#[0-9a-f]{6});`));
  assert.ok(found, `Missing ${themeSelector} ${name}`);
  return found[1];
}

test('ON/OFF policy control has meaningful visual difference in both themes', () => {
  for (const selector of [':root', ':root[data-theme="dark"]']) {
    const onTrack = token(theme, selector, '--toggle-on-track');
    const onThumb = token(theme, selector, '--toggle-on-thumb');
    const offTrack = token(theme, selector, '--toggle-off-track');
    const offThumb = token(theme, selector, '--toggle-off-thumb');
    assert.ok(contrast(onTrack, onThumb) >= 4.5, selector + ' ON thumb contrast');
    assert.ok(contrast(offTrack, offThumb) >= 4.5, selector + ' OFF thumb contrast');
    assert.ok(contrast(onTrack, offTrack) >= 3, selector + ' states need distinct tracks');
  }
});

test('Policy switch uses explicit tokens, retains dimensions and supports keyboard focus', () => {
  assert.match(rule(css, '.pm-policy-switch'), /var\(--toggle-off-border\)/);
  assert.match(rule(css, '.pm-policy-switch'), /var\(--toggle-off-label\)/);
  assert.match(rule(css, '.pm-policy-switch-track'), /width:\s*32px;/);
  assert.match(rule(css, '.pm-policy-switch-track'), /height:\s*18px;/);
  assert.match(rule(css, '.pm-policy-switch-track'), /var\(--toggle-off-track\)/);
  assert.match(rule(css, '.pm-policy-switch-thumb'), /var\(--toggle-off-thumb\)/);
  assert.match(rule(css, '.pm-policy-switch.is-on'), /var\(--toggle-on-label\)/);
  assert.match(rule(css, '.pm-policy-switch.is-on\n.pm-policy-switch-track'), /var\(--toggle-on-track\)/);
  assert.match(rule(css, '.pm-policy-switch.is-on\n.pm-policy-switch-thumb'), /var\(--toggle-on-thumb\)/);
  assert.match(rule(css, '.pm-policy-switch.is-on\n.pm-policy-switch-thumb'), /translateX\(14px\)/);
  assert.match(rule(css, '.pm-policy-switch:focus-visible'), /outline:\s*2px solid var\(--accent\);/);
  assert.match(rule(css, '.pm-policy-switch strong'), /font-size:\s*12px;/);
});

test('Policy preserves the existing role, checked state, disabled gate and click action', () => {
  assert.match(pmPanel, /role="switch"/);
  assert.match(pmPanel, /aria-checked=\{\s*policy\.requireBaselineTotalMatch/);
  assert.match(pmPanel, /policySaving\s*\|\|\s*saving/);
  assert.match(pmPanel, /onClick=\{\s*changeTotalSetting/);
  assert.match(pmPanel, /policy\.requireBaselineTotalMatch[\s\S]*?\? 'ON'[\s\S]*?: 'OFF'/);
  assert.match(css, /\.pm-policy-switch:disabled\s*\{[^}]*cursor:\s*wait;/);
});

test('OLED colors and financial/status semantics remain unchanged', () => {
  for (const expected of [
    '--bg: #0c0c0c;', '--surface: #191919;',
    '--pending-foundation: #85bde3;', '--warning: #d3a75f;',
    '--positive: #78ad97;', '--negative: #d08484;',
  ]) assert.ok(theme.includes(expected), expected);
});
