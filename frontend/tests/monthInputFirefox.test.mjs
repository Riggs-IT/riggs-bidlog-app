import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  MONTH_NAMES,
  MONTH_ABBREVIATIONS,
  isValidBillingMonth,
  displayBillingMonth,
  yearForBillingMonth,
  billingMonthForYearAndIndex,
  acceptedBillingMonth,
  monthPopoverPosition,
} from '../src/monthPickerModel.js';

const src = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = src('../src/App.jsx');
const completed = src('../src/CompletedMonthlyHistory.jsx');
const component = src('../src/MonthInput.jsx');
const css = src('../src/styles/01-foundations.css');

const good = ['2026-09', '2027-08', '1900-01', '9999-12'];
const bad = ['', '2026-', '2026-0', '2026-00', '2026-13', '2026-9', '2026-09-01',
  '0000-12', 'NaN-NaN', ' 2026-09', null, undefined, 202609, '2026/09'];
for (const value of good) test(`accepts normalized month ${value}`, () => {
  assert.equal(isValidBillingMonth(value), true);
});
for (const value of bad) test(`rejects invalid month ${String(value)}`, () => {
  assert.equal(isValidBillingMonth(value), false);
  assert.equal(acceptedBillingMonth('2026-09', value), '2026-09');
});

test('month display and year selection match the Chromium locale label', () => {
  assert.equal(displayBillingMonth('2026-09'), 'September 2026');
  assert.equal(displayBillingMonth('2027-08'), 'August 2027');
  assert.equal(displayBillingMonth(''), 'Choose month');
  assert.equal(yearForBillingMonth('2026-09', 2025), 2026);
  assert.equal(yearForBillingMonth('2026-', 2025), 2025);
  assert.equal(MONTH_NAMES.length, 12);
  assert.equal(MONTH_ABBREVIATIONS.length, 12);
  assert.equal(MONTH_ABBREVIATIONS[8], 'Sep');
});

test('popup month selection emits only YYYY-MM with safe bounds', () => {
  assert.equal(billingMonthForYearAndIndex(2026, 8), '2026-09');
  assert.equal(billingMonthForYearAndIndex(2027, 0), '2027-01');
  assert.equal(billingMonthForYearAndIndex(9999, 11), '9999-12');
  for (const [year,index] of [[999,0],[10000,0],[2026,-1],[2026,12],[NaN,0],[2026,1.5]]) {
    assert.equal(billingMonthForYearAndIndex(year,index), null);
  }
  assert.equal(acceptedBillingMonth('2026-09', '2027-08'), '2027-08');
});

test('popup fits below or above trigger and clamps horizontal viewport', () => {
  assert.deepEqual(monthPopoverPosition({left:100, top:80, bottom:116}, 1440, 900), {left:100, top:122});
  assert.deepEqual(monthPopoverPosition({left:1400, top:770, bottom:806}, 1440, 900), {left:1178, top:514});
  assert.deepEqual(monthPopoverPosition({left:320, top:40, bottom:75}, 390, 760), {left:128, top:81});
});

test('projected filters use shared month input at both positions', () => {
  assert.match(app, /import MonthInput from '\.\/MonthInput\.jsx'/);
  assert.equal((app.match(/<MonthInput\b/g) || []).length, 4);
  assert.equal((app.match(/type="month"/g) || []).length, 0);
  assert.match(app, /value=\{fromMonth\} onChange=\{setFromMonth\}/);
  assert.match(app, /value=\{throughMonth\} onChange=\{setThroughMonth\}/);
});

test('completed monthly history uses same picker, invalid ranges still guard fetch', () => {
  assert.match(completed, /import MonthInput from '\.\/MonthInput\.jsx'/);
  assert.equal((completed.match(/<MonthInput\b/g) || []).length, 2);
  assert.match(completed, /if \(!months\.length\) return Promise\.resolve\(null\)/);
  assert.equal((completed.match(/type="month"/g) || []).length, 0);
});

test('Edge remains native; Firefox receives a real button, calendar icon and month/year dialog', () => {
  assert.match(component, /probe\.type = 'month'/);
  assert.match(component, /return probe\.type === 'month'/);
  assert.match(component, /if \(nativePicker\)/);
  assert.match(component, /<input type="month" value=\{value\}/);
  assert.match(component, /acceptedBillingMonth\(value, event\.currentTarget\.value\)/);
  assert.match(component, /event\.currentTarget\.value = value/);
  assert.match(component, /aria-haspopup="dialog"/);
  assert.match(component, /aria-pressed=\{month === value\}/);
  assert.match(component, /createPortal\(/);
  assert.match(component, /<CalendarIcon \/>/);
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /document\.addEventListener\('pointerdown'/);
});

test('fallback popup uses existing light/dark theme tokens and focus styling', () => {
  for (const value of ['--surface','--surface-2','--accent','--accent-soft','--border','--text']) {
    assert.ok(css.includes(`var(${value})`));
  }
  for (const cls of ['.month-picker-trigger','.month-picker-popup','.month-picker-grid','.month-picker-year-row']) {
    assert.ok(css.includes(cls), `Missing ${cls}`);
  }
  assert.match(css, /month-picker-trigger:focus-visible/);
  assert.match(css, /z-index: 150/);
});
