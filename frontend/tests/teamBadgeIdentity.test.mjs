import { readSource } from './helpers/readSource.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configuredTeamColor, resolveTeamBadge, teamBadgeTextColor,
  teamIdentityMap, teamNameKey,
} from '../src/teamBadgeIdentity.js';

const source = filename => readSource(new URL(`../src/${filename}`, import.meta.url), 'utf8');

const directory = teamIdentityMap([
  {pm:'  Alex  Costanzo  ', pmInitials:' AC ', pmHexColor:'#F09A11'},
  {pm:'Project Engineer One', pmInitials:'PE1', pmHexColor:'#182A43'},
  {pm:'Field Super', pmInitials:'FS', pmHexColor:'#ffffff'},
  {pm:'Duplicate', pmInitials:'DA', pmHexColor:'#123456'},
  {pm:' duplicate ', pmInitials:'DB', pmHexColor:'#654321'},
  {pm:'Missing', pmInitials:'', pmHexColor:'red'},
]);

test('Cognito identities use normalized exact names and exclude collisions, not fuzzy matches', () => {
  assert.equal(teamNameKey('  ALEX  COSTANZO '), 'alex costanzo');
  assert.equal(directory.has('alex costanzo'), true);
  assert.equal(directory.has('duplicate'), false);
  assert.equal(resolveTeamBadge('Alex', null, null, directory).color, null);
  assert.equal(resolveTeamBadge('Duplicate', null, null, directory).color, null);
  assert.equal(resolveTeamBadge('Random PE', null, null, directory).initials, '');
});

test('PE and other staff use configured color and initials; direct typed metadata wins', () => {
  assert.deepEqual(resolveTeamBadge(' project engineer one ', null, null, directory), {
    initials: 'PE1', color: '#182A43',
  });
  assert.deepEqual(resolveTeamBadge('Alex Costanzo', 'XX', '#334455', directory), {
    initials: 'XX', color: '#334455',
  });
  assert.deepEqual(resolveTeamBadge('Alex Costanzo', '', 'invalid', directory), {
    initials: 'AC', color: '#F09A11',
  });
  assert.equal(resolveTeamBadge('Missing', null, null, directory).color, null);
  assert.equal(configuredTeamColor('F09A11'), null);
  assert.equal(configuredTeamColor('#f09a11'), '#f09a11');
});

test('dark orange AC uses white ink; light fills use dark ink in either theme', () => {
  assert.equal(teamBadgeTextColor('#FF6000'), '#ffffff'); // AC orange
  assert.equal(teamBadgeTextColor('#FF6600'), '#ffffff'); // nearby configured orange
  assert.equal(teamBadgeTextColor('#FFCC00'), '#111111'); // yellow
  assert.equal(teamBadgeTextColor('#BEC600'), '#111111'); // yellow-green
  assert.equal(teamBadgeTextColor('#FFFFFF'), '#111111');
  assert.equal(teamBadgeTextColor('#000000'), '#ffffff');
  assert.equal(teamBadgeTextColor('#182A43'), '#ffffff');
  assert.equal(teamBadgeTextColor(null), '#ffffff');
});

test('project names sit closer to compact badges without resizing the squircles', () => {
  const css = source('styles.css');
  assert.match(css, /\.project-team-badges\.compact\s*\{[^}]*gap: 4px;[^}]*margin-top: 2px;/);
  assert.match(css, /\.project-team-badges\.compact \.project-team-badge\s*\{[^}]*min-width: 27px;[^}]*height: 24px;/);
});

test('one authenticated passive directory read serves Projected, Active, Completed and Bid Log', () => {
  const hook = source('useTeamBadgeDirectory.js');
  const app = source('App.jsx');
  const bidLog = source('BidLogWorkspace.jsx');
  const display = source('BillingDisplay.jsx');
  const history = source('CompletedMonthlyHistory.jsx');
  const pivot = source('ProjectBillingPivot.jsx');
  const completed = source('ProjectAccountability.jsx');
  const active = source('ActiveProjectsWorkspace.jsx');
  assert.match(hook, /window\.fetch\('\/api\/bid-log\/reference\/pm-badges'/);
  assert.match(hook, /'X-Riggs-Passive-Read': '1'/);
  assert.match(hook, /return \(\) => controller\.abort\(\)/);
  assert.match(app, /useTeamBadgeDirectory\(user\?\.eid, canViewBidLog\)/);
  assert.match(app, /teamIdentityMap\(teamBadgeDirectory\)/);
  assert.match(app, /pmBadgeDirectory=\{teamBadgeDirectory\}/);
  assert.doesNotMatch(bidLog, /window\.fetch\('\/api\/bid-log\/reference\/pm-badges'/);
  assert.match(bidLog, /\[\.\.\.pmDirectory, \.\.\.pmBadgeDirectory\]/);
  for (const body of [app, active, completed, pivot, history, display]) {
    assert.match(body, /teamIdentityByName/);
  }
  assert.match(display, /resolveTeamBadge\(pe, peInitials, peHexColor, teamIdentityByName\)/);
  assert.match(display, /resolveTeamBadge\(\s*superintendent, superintendentInitials/);
  for (const file of ['App.jsx','BidLogWorkspace.jsx','ActiveProjectsWorkspace.jsx','ProjectAccountability.jsx']) {
    const code = source(file);
    assert.match(code, /teamBadgeTextColor/);
    assert.doesNotMatch(code, /function pmBadgeTextColor/);
  }
});

test('compact badges fit the row; initials are larger, regular-weight, and not stretched', () => {
  const css = source('styles.css');
  assert.match(css, /\.project-team-badge\s*\{[^}]*min-width: 30px;[^}]*height: 27px;[^}]*padding: 0 5px;/);
  assert.match(css, /\.project-team-badges\.compact \.project-team-badge\s*\{[^}]*min-width: 27px;[^}]*height: 24px;[^}]*padding: 0 4px;/);
  assert.match(css, /\.project-team-badge strong\s*\{[^}]*font-size: 13px;[^}]*font-weight: 400;[^}]*letter-spacing: 0;/);
  assert.match(css, /\.project-team-badges\.compact \.project-team-badge strong\s*\{[^}]*font-size: 13px;[^}]*font-weight: 400;/);
  assert.match(css, /\.pm-initials-badge\s*\{[^}]*width: 28px;[^}]*height: 28px;[^}]*font-size: 13px;[^}]*font-weight: 400;/);
  assert.doesNotMatch(css, /\.project-team-badge strong\s*\{[^}]*font-weight: 800;/);
});
