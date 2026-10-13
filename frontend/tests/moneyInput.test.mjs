import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {
  displayMoneyValue, groupMoneyDraft, moneyCaretPosition, parseMoneyDraft,
} from '../src/moneyInput.js';

test('currency presentation uses comma grouping and fixed cents, preserving blank vs zero', () => {
  assert.equal(displayMoneyValue(''), '');
  assert.equal(displayMoneyValue(null), '');
  assert.equal(displayMoneyValue('0'), '0.00');
  assert.equal(displayMoneyValue('50000'), '50,000.00');
  assert.equal(displayMoneyValue('1159575'), '1,159,575.00');
  assert.equal(displayMoneyValue('1294919.00'), '1,294,919.00');
  assert.equal(displayMoneyValue('893226.5'), '893,226.50');
  assert.equal(displayMoneyValue('.42'), '0.42');
  assert.equal(displayMoneyValue('00012.3'), '12.30');
});

test('while typing, commas are live but trailing decimal and partial cents remain editable', () => {
  assert.equal(groupMoneyDraft('1294919.'), '1,294,919.');
  assert.equal(groupMoneyDraft('1294919.0'), '1,294,919.0');
  assert.equal(displayMoneyValue('1294919.', true), '1,294,919.');
  assert.equal(displayMoneyValue('1294919.0', true), '1,294,919.0');
  assert.equal(displayMoneyValue('1294919', true), '1,294,919');
  assert.equal(moneyCaretPosition('1234', 2, '1,234'), 3);
  assert.equal(moneyCaretPosition('1234', 0, '1,234'), 0);
  assert.equal(moneyCaretPosition('1234.50', 7, '1,234.50'), 8);
});

test('parsed values passed to all existing save handlers have no display separators', () => {
  assert.equal(parseMoneyDraft(''), '');
  assert.equal(parseMoneyDraft('0'), '0');
  assert.equal(parseMoneyDraft('$ 1,294,919.00'), '1294919.00');
  assert.equal(parseMoneyDraft('1,294,919.5'), '1294919.5');
  assert.equal(parseMoneyDraft('.35'), '.35');
  assert.equal(parseMoneyDraft('1.'), '1.');
  assert.equal(parseMoneyDraft('1.234'), null);
  assert.equal(parseMoneyDraft('-10'), null);
  assert.equal(parseMoneyDraft('1e6'), null);
  assert.equal(parseMoneyDraft('abc'), null);
  assert.equal(Number(parseMoneyDraft('$ 1,294,919.00')), 1294919);
});

test('money input renders accessible text decimal mode with grouped cents', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode:true}, appType:'custom', logLevel:'silent',
  });
  t.after(() => vite.close());
  const {default: MoneyInput} = await vite.ssrLoadModule('/src/MoneyInput.jsx');
  const markup = renderToString(React.createElement(MoneyInput, {
    'aria-label':'December PM Projection', value:'1294919.00', onValueChange:()=>{},
  }));
  assert.match(markup, /type="text"/);
  assert.match(markup, /inputMode="decimal"/);
  assert.match(markup, /value="1,294,919.00"/);
  assert.match(markup, /aria-label="December PM Projection"/);
  assert.doesNotMatch(markup, /type="number"/);
});

test('monetary editors share one formatter and nonmoney fields retain their own types', () => {
  const source = name => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
  assert.match(source('PMForecastPanel.jsx'), /<MoneyInput[\s\S]*?onValueChange/);
  assert.match(source('ActiveBidBillingDrawer.jsx'), /<MoneyInput[\s\S]*?amountOverride/);
  for (const name of ['BidLogEditDrawer.jsx', 'BidLogOutcomeEditDrawer.jsx']) {
    const s = source(name);
    for (const field of ['estimatedPrice', 'redimixFootingPrice', 'rebarPrice']) {
      assert.match(s, new RegExp(`<MoneyInput[^\\n]+form\\.${field}`));
    }
    assert.match(s, /type="number"[^\n]+form\.probabilityPercent/);
    assert.match(s, /type="number"[^\n]+form\.margin/);
  }
  assert.match(source('ActiveBidBillingDrawer.jsx'), /estimatedDurationMonths:[\s\S]*?event\.target\.value/);
  assert.match(source('PMForecastPanel.jsx'), /forecastAmount:[\s\S]*?Number\(/);
});
