import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldRevalidateOnReturn, PAGE_RETURN_RECHECK_MS} from '../src/pageReturnRefresh.js';

const src = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('page-return revalidation honors a short navigation grace and invalidation', () => {
  const now = 1_000_000;
  assert.equal(PAGE_RETURN_RECHECK_MS, 20_000);
  assert.equal(shouldRevalidateOnReturn({loadedAt: now - 100, hasData: true}, now), false);
  assert.equal(shouldRevalidateOnReturn({loadedAt: now - 19_999, hasData: true}, now), false);
  assert.equal(shouldRevalidateOnReturn({loadedAt: now - 20_000, hasData: true}, now), true);
  assert.equal(shouldRevalidateOnReturn({loadedAt: 0, hasData: true}, now), true);
  assert.equal(shouldRevalidateOnReturn({loadedAt: now, hasData: false}, now), true);
  assert.equal(shouldRevalidateOnReturn({loadedAt: now + 100, hasData: true}, now), true);
});

test('navigation reads are passive cached GETs and manual reads preserve bypass', () => {
  for (const file of ['BidLogWorkspace.jsx', 'ActiveProjectsWorkspace.jsx', 'ProjectAccountability.jsx']) {
    const source = src(file);
    assert.match(source, /shouldRevalidateOnReturn/);
    assert.match(source, /passive: true/);
    assert.match(source, /X-Riggs-Passive-Read/);
    assert.match(source, /fresh=true/);
  }
  assert.match(src('BidLogWorkspace.jsx'), /\{fresh: true\}/);
  assert.match(src('ActiveProjectsWorkspace.jsx'), /fresh: !passive/);
  assert.match(src('ProjectAccountability.jsx'), /\{signal: controller\.signal, passive\}/);
  assert.match(src('ProjectAccountability.jsx'), /completedListControllerRef\.current\?\.abort\(\)/);
});

test('owner-only administration has one shared header Refresh and no duplicate manual button', () => {
  const app = src('App.jsx');
  const admin = src('AdministrationDashboard.jsx');
  assert.match(app, /label="Refresh administration"/);
  assert.match(app, /activePage === 'administration' && canViewAdministration/);
  assert.match(app, /refreshApiRef=\{administrationRefreshRef\}/);
  assert.match(admin, /useImperativeHandle\(refreshApiRef/);
  assert.doesNotMatch(admin, /className="administration-check"/);
  assert.match(admin, /fetch\('\/api\/admin\/overview'/);
  assert.match(admin, /fetch\('\/api\/admin\/presence'/);
  assert.doesNotMatch(admin, /dashboard-cache\/refresh/);
});
