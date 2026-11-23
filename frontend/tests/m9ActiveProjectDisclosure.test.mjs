import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setProjectSectionsOpen} from '../src/activeProjectDisclosure.mjs';
const read = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('expand and collapse only the marked details in the current project', () => {
  const sections = [{open: false, draft: {scope: 'unsaved'}}, {open: true}, {open: false}];
  const other = {open: false};
  const root = {querySelectorAll(selector) {
    assert.equal(selector, 'details[data-project-disclosure]');
    return sections;
  }};
  const draft = sections[0].draft;
  setProjectSectionsOpen(root, true);
  assert.ok(sections.every(s => s.open));
  setProjectSectionsOpen(root, false);
  assert.ok(sections.every(s => !s.open));
  assert.equal(sections[0].draft, draft);
  assert.equal(other.open, false);
  setProjectSectionsOpen(null, true);
});

test('disclosure content is mounted regardless of open state', () => {
  const source = read('ActiveProjectSection.jsx');
  assert.match(source, /<details ref=\{ref\} data-project-disclosure/);
  assert.match(source, /<summary className="active-project-disclosure-summary">/);
  assert.match(source, /<div className="active-project-disclosure-content">\{children\}<\/div>/);
  assert.doesNotMatch(source, /open\s*&&\s*children/);
});

test('existing paired layout, global controls and full-width supplier table remain', () => {
  const drawer = read('ActiveProjectEditDrawer.jsx');
  const sheet = read('ActiveProjectCognitoSections.jsx');
  const css = read('styles/10-active-projects.css');
  for (const id of ['basics','location','parties','design','riggs','gc','scope'])
    assert.match(drawer, new RegExp(`sectionId="${id}"`));
  for (const id of ['buildings-contract','suppliers','concrete','detailing','startup-closeout'])
    assert.match(sheet, new RegExp(`sectionId="${id}"`));
  assert.match(drawer, /headerActions=\{/);
  assert.match(drawer, /setProjectSectionsOpen\(sectionsRef.current, true\)/);
  assert.match(drawer, /setProjectSectionsOpen\(sectionsRef.current, false\)/);
  assert.match(drawer, /active-project-layout-pair active-project-teams-pair/);
  assert.match(sheet, /active-project-layout-pair active-project-reference-pair/);
  assert.ok(sheet.indexOf('sectionId="suppliers"') < sheet.indexOf('active-project-reference-pair'));
  assert.match(css, /active-project-layout-pair[^{}]*\{grid-template-columns:1fr\}/);
  assert.match(sheet, /value=\{closeout.additionalName1\}/);
  assert.match(sheet, /value=\{closeout.additionalName2\}/);
});
