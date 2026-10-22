import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

test('completed billing headline renders API values without redundant cards', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
    // This view mounts the Active Projects edit drawer even when no job is open.
    // Its browser-only external store is unrelated to this SSR billing assertion.
    plugins: [{
      name: 'stub-inactive-editor-for-completed-headline-test',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === './ActiveProjectEditDrawer.jsx'
          && importer?.replaceAll('\\', '/').endsWith('/src/ProjectAccountability.jsx')) {
          return '\0completed-headline-test-inactive-editor';
        }
        return null;
      },
      load(id) {
        if (id === '\0completed-headline-test-inactive-editor') {
          return 'export default function InactiveEditor() { return null; }';
        }
        return null;
      },
    }],
  });
  t.after(() => vite.close());

  const previousWindow = globalThis.window;
  globalThis.window = {
    fetch: async () => ({
      ok: true,
      json: async () => [{
        jobListId: 100,
        jobNumber: '10001',
        jobName: 'Synthetic completed job',
        contractAmount: 100,
        approvedChangeOrderAmount: 20,
        approvedChangeOrderCount: 1,
        totalContractAmount: 120,
        foundationActualTotal: 80,
        contractRemainingAmount: 40,
        actualVsTotalContractVariance: -40,
      }],
    }),
  };
  t.after(() => { globalThis.window = previousWindow; });

  const {
    default: ProjectAccountability,
    prefetchCompletedBillings,
  } = await vite.ssrLoadModule('/src/ProjectAccountability.jsx');
  await prefetchCompletedBillings();
  const markup = renderToString(React.createElement(ProjectAccountability, {
    user: {appRole: 'VIEWER'},
    pmDirectory: [],
  })).replaceAll('<!-- -->', '');

  const financialHeader = markup.slice(
    markup.indexOf('Completed billing financial totals'),
    markup.indexOf('class="content-card completed-project-card"'),
  );
  assert.match(markup, /Completed Billings/);
  assert.match(markup, /1 project/);
  assert.match(financialHeader, /Total Contract/);
  assert.match(financialHeader, /\$120/);
  assert.match(financialHeader, /Actual Billings/);
  assert.match(financialHeader, /\$80/);
  assert.match(financialHeader, /Actual vs Total Contract/);
  assert.match(financialHeader, /-\$40/);
  assert.match(financialHeader, /tone-critical/);
  assert.doesNotMatch(financialHeader, /Contract Remaining|Historical Estimates/);
  assert.match(markup, /Original: \$100/);
  assert.match(markup, /CO: \$20/);
  assert.doesNotMatch(markup, /CONTRACT BREAKDOWN/);
  assert.doesNotMatch(markup, /recorded CO events/);
});
