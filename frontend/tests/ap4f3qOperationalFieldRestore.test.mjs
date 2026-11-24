import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const sheet = src('ActiveProjectCognitoSections.jsx');
const drawer = src('ActiveProjectEditDrawer.jsx');
const css = src('styles/10-active-projects.css');
const compact = sheet.split('if (compact) return')[1].split('  return (')[0];

test('AP4F3Q restores actual Cognito operational sections in the compact Active Project JIS view', () => {
  for (const title of ['Authorized Suppliers & Contracts','Concrete & Mix Designs',
    'Detailing & Submittals','Closeout','Project Information']) {
    assert.ok(compact.includes(title), `missing section ${title}`);
  }
  for (const title of ['Admin','Buildings']) {
    assert.ok(drawer.includes(`title="${title}"`), `missing section ${title}`);
    assert.ok(!compact.includes(`title="${title}"`), `duplicate section ${title}`);
  }
  for (const source of ['lender','lenderStreet','lenderCityStateZip']) assert.ok(drawer.includes(`cognitoPayload?.lenderInformation?.${source}`));
  for (const source of [
    'suppliers.primaryConcreteSupplier','suppliers.secondaryConcreteSupplier',
    'suppliers.primaryAggregateSupplier','suppliers.secondaryAggregateSupplier',
    'suppliers.rebarSupplier','suppliers.siteSubcontractor','suppliers.patchingSubcontractor',
    'suppliers.pcsContract','suppliers.scsContract','suppliers.pasContract',
    'suppliers.sasContract','suppliers.rebarContract','suppliers.siteworkContract',
    'suppliers.patchingContract','concrete.approvedMixDesignsPrimarySupplier',
    'concrete.approvedMixDesignsSecondarySupplier','detailing.requiredSubmittals',
    'detailing.commentsForDetailing',
    'startup.teamDistributionList','startup.warrantyWork','startup.retentionCollected',
    'closeout.additionalEmail1','closeout.additionalEmail2',
  ]) {
    const alias = source === 'detailing.requiredSubmittals' ? 'ProjectSubmittals value={submittals}' : source;
    assert.ok(compact.includes(alias), `missing operational source ${source}`);
  }
  assert.match(drawer, /cognitoPayload\?\.riggsStartup\?\.estimatedDuration/);
  assert.match(sheet, /<SupplierRow title="Rebar"/);
  assert.match(sheet, /<SupplierRow title="Sitework"/);
  assert.match(sheet, /<SupplierRow title="Patching"/);
  assert.match(sheet, /<FileList files=\{files\}/);
});

test('AP4F3Q does not restore calculated formulas, generated IDs or workflow action toggles', () => {
  for (const prohibited of ['controls.', 'ControlProjectName','RiggsPMEmail',
    'GCInFoundation','FolderCreated','LockTime','NotifyEveryone',
    'SendToContracts','PublishUpdatedPreliminaryLeinInfoSheet',
    'entry.','cognitoEntryId']) {
    assert.ok(!compact.includes(prohibited), `unexpected system/control field ${prohibited}`);
  }
  assert.ok(!compact.includes('onChange='));
  assert.ok(!compact.includes('onClick='));
});

test('AP4F3Q preserves clear JIS/financial semantics and false-vs-missing values', () => {
  assert.match(drawer, /<ProjectContractType value=\{cognitoPayload\?\.contract\}\/>/);
  assert.match(src('ProjectContractType.jsx'), /value===true\?'Contract':value===false\?'LOI':'—'/);
  assert.match(drawer, /JIS contract amount \(not Foundation total\)/);
  assert.match(compact, /amount=\{suppliers.pcsAmount\}/);
  assert.match(sheet, /value === true \|\| value === false/);
  assert.match(sheet, /value === null \|\| value === undefined \|\| value === ''/);
  assert.match(compact, /<SupplierRow[\s\S]*?files=\{suppliers.pcsContract\}/);
});

test('AP4F3Q keeps existing write paths and top-level Active Project layout intact', () => {
  assert.match(drawer, /<ActiveProjectOfficeTeam/);
  assert.match(drawer, /<ActiveProjectAdditionalMembers/);
  assert.match(drawer, /<ProjectFieldTeam/);
  assert.match(drawer, /<ActiveProjectCognitoSections compact/);
  assert.doesNotMatch(drawer, /writeEnabled=\{Number\(jobListId\) === 24\}/);
  assert.match(drawer, /title=\{job.jobName \|\| projectSummary\?\.jobName/);
  assert.match(drawer, /<ActiveProjectDesignTeam/);
  assert.doesNotMatch(drawer, /<details className="active-project-full-reference"/);
  assert.match(drawer, /className="active-project-jis-reference"/);
  assert.match(css, /active-project-compact-sections/);
});
