import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const styles = fs.readFileSync(
  new URL('../src/styles.css', import.meta.url),
  'utf8',
);

const theme = fs.readFileSync(
  new URL('../src/theme.css', import.meta.url),
  'utf8',
);

test('all application tables use the shared subtle zebra stripe rule', () => {
  const tableClasses = [
    '.monthly-table',
    '.detail-table',
    '.billing-monthly-table',
    '.monthly-project-table',
    '.completed-project-table',
    '.completed-monthly-table',
    '.project-pivot-table',
    '.bid-log-table',
    '.active-bid-monthly-table',
    '.active-project-table',
  ];

  assert.match(styles, /SUBTLE TABLE ZEBRA STRIPING/);
  assert.match(styles, /--table-row-alt/);

  for (const tableClass of tableClasses) {
    assert.ok(
      styles.includes(tableClass),
      `${tableClass} should participate in zebra striping`,
    );
  }

  assert.match(
    styles,
    /even of :not\(\.monthly-project-detail-row\):not\(\.bid-log-notes-row\)/,
  );

  assert.match(theme, /--table-row-alt:/);
});

test('zebra striping preserves completed, selected, hover, and sticky pivot states', () => {
  assert.match(styles, /monthly-comparison-row\.selected/);
  assert.match(styles, /active-project-data-row:has\(\.project-status-pill\.completed\)/);
  assert.match(styles, /pivot-project-row:hover/);
  assert.match(styles, /td\.pivot-project-column/);
  assert.match(styles, /td\.pivot-probability-column/);
});
