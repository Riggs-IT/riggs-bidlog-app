import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readSource} from './helpers/readSource.mjs';

const src = new URL('../src/', import.meta.url);
const raw = file => readFileSync(new URL(file, src), 'utf8');
const expanded = file => readSource(new URL(file, src), 'utf8');
const imports = text => [...text.matchAll(/^\s*@import\s+(['"])(\.\/[^'"]+\.css)\1\s*;/gm)].map(m=>m[2]);
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '');

test('global entry points contain documented ordered imports, not another override pile', () => {
  for (const file of ['styles.css','theme.css']) {
    const text = raw(file);
    const entries = imports(text);
    assert.ok(entries.length >= 2);
    assert.equal(new Set(entries).size, entries.length);
    assert.ok(entries.every(p=>p.startsWith('./styles/') && !p.includes('..')));
    assert.equal(stripComments(text).replace(/@import\s+(['"])[^'"]+\1\s*;/g, '').trim(), '');
  }
});

test('shared cascade order preserves base, workspace, metric and final balance sections', () => {
  assert.deepEqual(imports(raw('styles.css')), [
    './styles/01-foundations.css', './styles/02-billing-drawers.css',
    './styles/03-pm-projections.css', './styles/04-projected-workspace.css',
    './styles/05-project-pivot.css', './styles/06-project-references.css',
    './styles/07-detail-layout-and-filters.css', './styles/08-notifications-and-inputs.css',
    './styles/09-bid-log.css', './styles/10-active-projects.css',
    './styles/11-lifecycle-feedback-and-staffing.css', './styles/12-table-teams-and-zebra.css',
    './styles/13-financial-review-and-metrics.css', './styles/14-completed-closeout.css',
    './styles/15-balance-presentation.css',
  ]);
  const main = raw('main.jsx');
  assert.ok(main.indexOf("import './styles.css'") < main.indexOf("import './theme.css'"));
});

test('every shared module tells the editor what it owns and where colors live', () => {
  for (const name of imports(raw('styles.css'))) {
    const css = raw(name);
    assert.match(css, /Edit here:/);
    assert.match(css, /Related:/);
    assert.match(css, /theme-tokens\.css/);
    assert.match(css, /BIDLOG_CSS_EDITING_GUIDE\.md/);
  }
});

test('theme separates palette values from component mappings without changing tokens', () => {
  assert.deepEqual(imports(raw('theme.css')), ['./styles/theme-tokens.css','./styles/theme-surfaces.css']);
  const tokens=raw('styles/theme-tokens.css');
  for (const t of ['--bg: #0c0c0c;', '--surface: #191919;', '--accent: #c7c7c7;', '--pending-foundation: #85bde3;', '--warning: #d3a75f;']) assert.ok(tokens.includes(t));
  assert.doesNotMatch(tokens, /LOCAL PREVIEW ONLY/);
  assert.doesNotMatch(raw('styles/theme-surfaces.css'), /--bg\s*:/);
});

test('print, keyboard focus, frozen columns, zebra rows and clickable balance card survive', () => {
  const css=expanded('styles.css');
  for (const pattern of [/@media print/, /:focus-visible/, /position:\s*sticky/, /--table-row-alt/, /\.balance-review-detail\.is-actionable/, /\.pm-policy-switch\.is-on/]) assert.match(css,pattern);
  assert.doesNotMatch(css, /@import\b/);
  assert.doesNotMatch(expanded('theme.css'), /@import\b/);
});

test('source reader leaves non-CSS business logic untouched', () => {
  const file=new URL('App.jsx',src);
  assert.equal(readSource(file,'utf8'),readFileSync(file,'utf8'));
});

test('source reader rejects cyclic imports rather than silently dropping styles', () => {
  const dir=mkdtempSync(join(tmpdir(),'riggs-css-reader-'));
  try {
    writeFileSync(join(dir,'a.css'), "@import './b.css';\n");
    writeFileSync(join(dir,'b.css'), "@import './a.css';\n");
    assert.throws(()=>readSource(join(dir,'a.css')), /Cyclic/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('source reader rejects external or escaping imports', () => {
  const dir=mkdtempSync(join(tmpdir(),'riggs-css-reader-'));
  try {
    for (const name of ['https://invalid.example/theme.css','./../outside.css']) {
      writeFileSync(join(dir,'a.css'), `@import '${name}';\n`);
      assert.throws(()=>readSource(join(dir,'a.css')), /local, unconditional/);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
