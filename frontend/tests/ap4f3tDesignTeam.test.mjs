import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = name => readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const panel = source('ActiveProjectDesignTeam.jsx');
const details = source('DesignTeamContactDetails.jsx');

test('active project has no permanent explanatory text or duplicate JIS heading',()=>{
  for(const oldText of ['Current JIS:', 'Choose to preview a contact.',
    'Active Project design selections are read-only for persistence.',
    'Current Form 19 calculated value (fallback: Form 206 mirror)'])
    assert.ok(!panel.includes(oldText),`old text still in component: ${oldText}`);
  assert.match(panel,/label="Architect of record"/);
  assert.match(panel,/label="Structural engineer of record"/);
});

test('only an altered selection gets a nonpersistent preview badge and revert',()=>{
  assert.match(panel,/const showingPreview = preview !== null && preview.id !== currentId/);
  assert.match(panel,/\{showingPreview && \(/);
  assert.match(panel,/Not saved · Preview only/);
  assert.match(panel,/setPreviewId\(null\)/);
  assert.doesNotMatch(panel,/editor\.edit|saveProject|updateProject|onChange\('architectLookupId'/);
});

test('current JIS email/address show without provenance text; draft retains source note',()=>{
  assert.match(panel,/fallbackEmail=\{showingPreview \? null : record\?\.email\}/);
  assert.match(panel,/fallbackAddress=\{showingPreview \? null : record\?\.address\}/);
  assert.match(panel,/showSource=\{false\}/);
  assert.match(details,/showSource = true/);
  assert.match(details,/\{showSource && <small/);
  assert.match(details,/Contact details not available from directory/);
});
