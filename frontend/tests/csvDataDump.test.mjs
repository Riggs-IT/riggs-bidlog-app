import assert from 'node:assert/strict';
import test from 'node:test';
import {serializeCsv} from '../src/csvExport.js';
import {
  buildBidLogDataDump,
  buildCompletedDirectoryDataDump,
  buildCompletedHistoryDataDump,
  buildProjectDirectoryDataDump,
} from '../src/dataDumpExports.js';

test('CSV retains BOM, quotes, newlines, zeros and safe spreadsheet text', () => {
  const csv = serializeCsv(['Name', 'Amount', 'Missing'], [{
    Name: '=HYPERLINK("danger")\nLine two', Amount: -123.4, Missing: null,
  }]);
  assert.ok(csv.startsWith('\uFEFF"Name","Amount","Missing"\r\n'));
  assert.match(csv, /"'=HYPERLINK\(""danger""\)\nLine two","-123.4",""/);
  assert.ok(!csv.includes('\r\n\r\n'));
});

test('active/outcome Bid Log export follows supplied filtered/sorted list, retains CY and restricts margin', () => {
  const selected = [
    {bidName: 'B', sharePointItemId: 8, cubicYards: 0, manHours: 15, margin: 0.23, probability: 0.85},
    {bidName: 'A', originalBidLogId: 72, cubicYards: 514.25, margin: 0.3, probability: null},
  ];
  const viewer = buildBidLogDataDump(selected);
  assert.deepEqual(viewer.rows.map(row => row['Bid Name']), ['B', 'A']);
  assert.deepEqual(viewer.rows.map(row => row['Cubic Yards (CY)']), [0, 514.25]);
  assert.deepEqual(viewer.rows.map(row => row['Probability (%)']), [85, '']);
  assert.equal(viewer.rows[0]['Man Hours (MH)'], 15);
  assert.ok(!viewer.headers.some(header => /margin/i.test(header)));
  const admin = buildBidLogDataDump(selected, {canSeeMargin: true});
  assert.equal(admin.rows[0]['Bid Margin'], 0.23);
  assert.equal(admin.rows[1]['Bid Log ID'], 72);
  assert.ok(!admin.headers.includes('etag'));
});

test('Projects data dump honors supplied project population and margin role', () => {
  const data = [{jobNumber: '26660', jobName: 'Main', projectType: 'Tilt',
    projectCompleted: false, cubicYards: 0, totalContractAmount: 5000,
    estimatedMarginPercent: 0.22}];
  const viewer = buildProjectDirectoryDataDump(data);
  assert.equal(viewer.rows.length, 1);
  assert.equal(viewer.rows[0]['Cubic Yards (CY)'], 0);
  assert.equal(viewer.rows[0]['Project Completed'], 'No');
  assert.ok(!viewer.headers.some(x => /margin/i.test(x)));
  const admin = buildProjectDirectoryDataDump(data, {canViewMargin: true});
  assert.equal(admin.rows[0]['Estimated Margin (%)'], 22);
});

test('Completed Directory export preserves contract-vs-actual and omits margin for viewers', () => {
  const projects = [{jobListId: 10, jobNumber: '25510',
    foundationActualTotal: 12345, totalContractAmount: 15000,
    actualVsTotalContractVariance: -2655,
    marginDataComplete: false, marginCollectedTotal: 3500,
    weightedHistoricalMarginPercent: 0.25}];
  const viewer = buildCompletedDirectoryDataDump(projects);
  assert.deepEqual(viewer.rows.map(row => row['Job Number']), ['25510']);
  assert.equal(viewer.rows[0]['Actual vs Total Contract'], -2655);
  assert.ok(!viewer.headers.some(x => /margin/i.test(x)));
  const admin = buildCompletedDirectoryDataDump(projects, {canViewMargin: true});
  assert.equal(admin.rows[0]['Margin Collected'], '');
  assert.equal(admin.rows[0]['Weighted Historical Margin (%)'], '');
  assert.equal(admin.rows[0]['Margin Data Complete'], 'No');
});

test('Completed By Month includes only selected projects, zero months, and incomplete margins as blank', () => {
  const byId = new Map([
    [1, [{monthStart:'2026-09-01', actualAmount: 0, marginCollected: 0,
      marginDataComplete: true, missingMarginRows: 0, isAfterResolvedEnd: false},
      {monthStart:'2026-10-01', actualAmount: 100, marginCollected: null,
      marginDataComplete: false, missingMarginRows: 1, isAfterResolvedEnd: true}]],
    [2, [{monthStart:'2026-10-01', actualAmount: 999999, marginCollected: 5,
      marginDataComplete:true, missingMarginRows:0}]],
  ]);
  const result = buildCompletedHistoryDataDump({
    view:'month', projects:[{jobListId:1}], byId, months:['2026-09','2026-10'],
    monthlySummary: [
      {month:'2026-09', actual:0, marginCollected:0, billedProjects:0, projectsWithRecords:1, billedAfterEnd:0},
      {month:'2026-10', actual:100, marginCollected:null, billedProjects:1, projectsWithRecords:1, billedAfterEnd:1},
    ],
    canViewMargin:true,
  });
  assert.deepEqual(result.rows.map(x => x.Month), ['2026-10','2026-09']);
  assert.deepEqual(result.rows.map(x => x['Actual Billings']), [100, 0]);
  assert.deepEqual(result.rows.map(x => x['Margin Collected']), ['', 0]);
  assert.equal(result.rows[0]['Billed After End'], 1);
  const viewer = buildCompletedHistoryDataDump({
    view:'month', projects:[{jobListId:1}], byId, months:['2026-09','2026-10'],
    monthlySummary: [
      {month:'2026-09',actual:0,projectsWithRecords:1},
      {month:'2026-10',actual:100,projectsWithRecords:1},
    ],
  });
  assert.ok(!viewer.headers.some(x => /margin/i.test(x)));
});

test('Completed By Project export retains blank-vs-zero and focused-month selection', () => {
  const projects = [{jobListId:1, jobNumber:'26611', jobName:'A'},
    {jobListId:2,jobNumber:'26612',jobName:'No history'}];
  const byId = new Map([[1, [{monthStart:'2026-09-01',actualAmount:0,
    marginCollected:11,marginDataComplete:false,missingMarginRows:1}]]]);
  const all = buildCompletedHistoryDataDump({view:'project', projects, byId,
    months:['2026-09','2026-10'],canViewMargin:true});
  assert.equal(all.rows.length, 2);
  assert.equal(all.rows[0]['2026-09 Actual Billings'], 0);
  assert.equal(all.rows[0]['2026-09 Margin Collected'], '');
  assert.equal(all.rows[0]['2026-10 Actual Billings'], '');
  assert.equal(all.rows[1]['2026-09 Actual Billings'], '');
  const focused = buildCompletedHistoryDataDump({view:'project', projects, byId,
    months:['2026-09','2026-10'],focusedMonth:'2026-09'});
  assert.equal(focused.rows.length, 1);
  assert.ok(!focused.headers.includes('2026-10 Actual Billings'));
  assert.ok(!focused.headers.some(x => /margin/i.test(x)));
});
