import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {scrollExpandedCloseoutIntoView} from '../src/completedCloseoutScroll.mjs';

function rig({scrollTop = 600, scrollHeight = 2400, clientHeight = 600,
  containerTop = 160, disclosureTop = 675, open = true} = {}) {
  const calls = [];
  const container = {
    scrollTop, scrollHeight, clientHeight,
    getBoundingClientRect: () => ({top: containerTop}),
    scrollTo: options => calls.push(options),
  };
  const disclosure = {
    open,
    getBoundingClientRect: () => ({top: disclosureTop}),
  };
  return {container, disclosure, calls};
}

test('opening historical context scrolls only its own drawer and preserves the heading', () => {
  const {container, disclosure, calls} = rig();
  assert.equal(scrollExpandedCloseoutIntoView(container, disclosure), true);
  assert.deepEqual(calls, [{top: 1103, behavior: 'smooth'}]);
});

test('scroll request is clamped to the drawer scroll range', () => {
  const {container, disclosure, calls} = rig({scrollHeight: 1400, clientHeight: 600});
  assert.equal(scrollExpandedCloseoutIntoView(container, disclosure), true);
  assert.deepEqual(calls, [{top: 800, behavior: 'smooth'}]);
});

test('reduced motion disables smooth scrolling', () => {
  const {container, disclosure, calls} = rig();
  assert.equal(scrollExpandedCloseoutIntoView(container, disclosure, true), true);
  assert.equal(calls[0].behavior, 'auto');
});

test('no scroll on closed, already-visible, missing or invalid geometry', () => {
  for (const input of [
    rig({open: false}),
    rig({disclosureTop: 180}),
    rig({scrollHeight: Number.NaN}),
  ]) {
    assert.equal(scrollExpandedCloseoutIntoView(input.container, input.disclosure), false);
    assert.equal(input.calls.length, 0);
  }
  assert.equal(scrollExpandedCloseoutIntoView(null, null), false);
});

test('closeout scroll is wired to the native disclosure and never scrolls the window', () => {
  const source = readFileSync(new URL('../src/CompletedProjectBillingDrawer.jsx', import.meta.url), 'utf8');
  assert.match(source, /ref=\{closeoutScrollRef\} className="completed-drawer-scroll completed-closeout-report"/);
  assert.match(source, /ref=\{historicalContextRef\}[\s\S]*?className="completed-closeout-evidence"/);
  assert.match(source, /onToggle=\{event => setHistoricalContextOpen\(event\.currentTarget\.open\)\}/);
  assert.match(source, /window\.requestAnimationFrame[\s\S]*?scrollExpandedCloseoutIntoView\(/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(source, /window\.scrollTo\(/);
  const panel = readFileSync(new URL('../src/OriginatingBidPanel.jsx', import.meta.url), 'utf8');
  assert.match(panel, /projectKind === 'completed' && disclosure\.open/);
  assert.match(panel, /scrollExpandedCloseoutIntoView\(/);
});
