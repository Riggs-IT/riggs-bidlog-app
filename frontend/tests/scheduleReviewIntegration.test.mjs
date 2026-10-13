import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {indexScheduleReview} from '../src/scheduleReview.js';

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const review = {
  jobListId: 524, jobNumber: '26580', jobName: 'Longbow 202',
  forecastVersionId: 211, versionNumber: 3,
  durationAtPmSave: 7, currentDuration: 10,
  expectedEndAtPmSave: '2027-04-15', currentExpectedEnd: '2027-07-15',
  lastPositivePmBillingMonth: '2027-04-01', needsScheduleReview: true,
};
const createVite = async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
  });
  t.after(() => vite.close());
  return vite;
};

test('schedule-review data requires valid, unique projects; unavailable is not zero', () => {
  assert.equal(indexScheduleReview([review]).get('524').currentDuration, 10);
  assert.equal(indexScheduleReview([]).size, 0);
  assert.throws(() => indexScheduleReview(null), /invalid result/);
  assert.throws(() => indexScheduleReview([review, review]), /invalid or duplicate/);
  assert.throws(() => indexScheduleReview([{...review, currentDuration: 7}]), /invalid or duplicate/);
  assert.throws(() => indexScheduleReview([{...review, needsScheduleReview: false}]), /invalid or duplicate/);
});

test('schedule notification and two existing families render as full-card actions', async t => {
  const vite = await createVite(t);
  const {default: Cards} = await vite.ssrLoadModule('/src/NotificationProjectCards.jsx');
  const html = renderToString(React.createElement(Cards, {
    forecastItems: [{jobListId: 20, jobNumber: '25534', jobName: 'Peopleworks',
      rebalanceVarianceAmount: -100, forecastVersionId: 4}],
    originatingItems: [{jobListId: 21, jobNumber: '26605', jobName: 'Canyon Commerce Center'}],
    scheduleItems: [review],
    onOpenForecast: () => {}, onOpenOriginating: () => {}, onOpenSchedule: () => {},
    originatingStatus: () => '', currency: n => `$${n}`,
  }));
  assert.equal((html.match(/class="notification-item notification-action-card"/g) || []).length, 3);
  assert.match(html, /SCHEDULE NEEDS REVIEW/);
  assert.match(html, /7 to 10 months/);
  assert.match(html, /ORIGINATING BID NOT LINKED/);
  assert.match(html, /NEEDS REBALANCE/);
  assert.doesNotMatch(html, /notification-originating-projects/);
});

test('both project billing pivot and drawer render the schedule warning without new filter', async t => {
  const vite = await createVite(t);
  const {default: Pivot} = await vite.ssrLoadModule('/src/ProjectBillingPivot.jsx');
  const {default: Drawer} = await vite.ssrLoadModule('/src/CurrentProjectBillingDrawer.jsx');
  const project = {jobListId: 524, jobNumber: '26580', jobName: 'Longbow 202',
    projectCompleted: false, hasPmForecast: true, needsRebalance: true,
    scheduleReview: review, totalContractAmount: 300000};
  const html = renderToString(React.createElement(Pivot, {
    months: ['2027-07'], currentProjects: [project], bidProjects: [],
    currentMonthly: new Map(), bidMonthly: new Map(), currency: n => `$${n}`,
    monthLabel: month => month, onSelectCurrentProject: () => {},
    includeBids: false, projectionCoverage: {pm: 1, system: 0, rebalance: 1},
    portfolioBalanceAvailable: true, onProjectionSourceFilterChange: () => {},
  }));
  assert.match(html, /Schedule Needs Review/);
  assert.match(html, /Needs Rebalance/);
  assert.match(html, /data-schedule-review/);
  const drawer = renderToString(React.createElement(Drawer, {
    project, user: {appRole: 'VIEWER', canEditBilling: false},
    scheduleReview: review, monthlyRows: [], onClose: () => {},
  }));
  assert.match(drawer, /Schedule Needs Review/);
  assert.match(drawer, /data-schedule-review/);
  assert.doesNotMatch(drawer, /Admin Correction<\/button>/);
});

test('PE sees assigned schedule notice without access to PM financial edits', async t => {
  const vite = await createVite(t);
  const {default: Info} = await vite.ssrLoadModule('/src/ScheduleReviewInfoDrawer.jsx');
  const html = renderToString(React.createElement(Info, {review, onClose: () => {}}));
  assert.match(html, /Longbow 202/);
  assert.match(html, /Contact your project manager/);
  assert.doesNotMatch(html, /Revise PM Projection/);
  const main = readFileSync(new URL('../../backend/app/main.py', import.meta.url), 'utf8');
  assert.match(main, /canViewBidLog.*or capabilities\["canViewProjectedBillings"\]/);
  assert.match(main, /get_pm_forecast_schedule_review_attention\(current_user.eid\)/);
});

test('two tables and By Month rows expose flags; schedule does not add a filter', () => {
  const app = source('App.jsx');
  const directory = source('ActiveProjectsWorkspace.jsx');
  const pivot = source('ProjectBillingPivot.jsx');
  assert.match(app, /scheduleReviewByJobId\.get\(String\(row\.jobListId\)\)/);
  assert.match(app, /review=\{detail\.raw\?\.scheduleReview\}/);
  assert.match(app, /rebalanceByJobId=\{rebalanceByJobId\}/);
  assert.match(directory, /ScheduleReviewFlag/);
  assert.match(directory, /rebalanceByJobId\.has/);
  assert.match(pivot, /data-schedule-review/);
  assert.doesNotMatch(app, /value==='scheduleReview'/);
  assert.match(app, /No PM Projection\*/);
});
