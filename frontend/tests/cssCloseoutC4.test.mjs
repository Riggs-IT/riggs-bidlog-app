import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {readSource} from './helpers/readSource.mjs';
const src=new URL('../src/',import.meta.url);
const raw=f=>readFileSync(new URL(f,src),'utf8');
const noComments=s=>s.replace(/\/\*[\s\S]*?\*\//g,'');
const css=f=>noComments(raw('styles/'+f));
const notify=css('08-notifications-and-inputs.css');
const active=css('10-active-projects.css');
const feedback=css('11-lifecycle-feedback.css');
const staffing=css('11a-active-project-staffing.css');
const review=css('13-financial-review-and-metrics.css');
const full=readSource(new URL('styles.css',src));

test('C4 notification card family has the same owner as the bell and panel',()=>{
 for(const name of ['notification-center','notification-count','notification-panel','notification-action-card','notification-card-heading-copy','notification-card-description','notification-card-context','notification-card-reason','notification-card-action','notification-grace-note']){
  assert.ok(notify.includes('.'+name),name);
  assert.ok(!review.includes('.'+name),name+' still in financial review');
 }
});
test('C4 notification cards preserve full-card focus and hover interaction',()=>{
 assert.match(notify,/\.notification-action-card\s*\{[^}]*width:\s*100%;[^}]*font:\s*inherit;[^}]*cursor:\s*pointer;/);
 assert.match(notify,/\.notification-action-card:hover,\s*\.notification-action-card:focus-visible/);
 assert.match(notify,/\.notification-action-card:last-child\s*\{\s*border-bottom:\s*0;/);
});
test('C4 notification readout keeps approved counter typography and narrow placement',()=>{
 assert.match(notify,/\.notification-count\s*\{[^}]*min-width:\s*22px;[^}]*font-size:\s*12px;[^}]*font-weight:\s*800;/);
 assert.match(notify,/@media \(max-width: 700px\)[\s\S]*?\.notification-panel\s*\{\s*position:\s*fixed;/);
 assert.match(notify,/@media print\s*\{\s*\.notification-center,/);
});
test('C4 notification content order preserves basic item before actionable card refinement',()=>{
 assert.ok(notify.indexOf('.notification-item {')<notify.indexOf('.notification-action-card {'));
 assert.ok(notify.indexOf('.notification-card-description,')<notify.indexOf('.notification-card-context {'));
});
test('C4 read-only notices belong to Active Projects, not financial review',()=>{
 for(const name of ['management-preview-notice','management-preview-drawer-notice','management-preview-cognito-guide']){
  assert.ok(active.includes('.'+name),name);assert.ok(!review.includes('.'+name),name);
 }
 assert.ok(active.includes('.active-projects-workspace.management-admin-preview'));
});
test('C4 Management watermark stays passive with its exact responsive override',()=>{
 assert.match(active,/\.active-projects-workspace\.management-admin-preview::after\s*\{[^}]*pointer-events:\s*none;[^}]*user-select:\s*none;/);
 assert.match(active,/@media \(max-width: 760px\)\s*\{\s*\.active-projects-workspace\.management-admin-preview::after\s*\{\s*left:\s*10%;\s*font-size:\s*1\.55rem;/);
});
test('C4 staffing has its own module without a second copy in workspace feedback',()=>{
 for(const name of ['.staffing-role-heading','.project-team-staffing-shell','.project-team-organizer-grid','.staffing-current-readout','.staffing-plan-empty-state']){
  assert.ok(staffing.includes(name),name);assert.ok(!feedback.includes(name),name);
 }
 assert.equal(existsSync(new URL('styles/11-lifecycle-feedback-and-staffing.css',src)),false);
});
test('C4 staffing block stays in its original global cascade slot',()=>{
 const imports=[...raw('styles.css').matchAll(/^@import '([^']+)';$/gm)].map(x=>x[1]);
 assert.equal(imports.length,16);
 const index=imports.indexOf('./styles/11-lifecycle-feedback.css');
 assert.deepEqual(imports.slice(index,index+3),['./styles/11-lifecycle-feedback.css','./styles/11a-active-project-staffing.css','./styles/12-table-teams-and-zebra.css']);
});
test('C4 current and planned staffing remain distinct presentation families',()=>{
 assert.match(staffing,/\.staffing-current-status\s*\{[^}]*font-size:\s*9px !important;/);
 assert.match(staffing,/\.project-team-organizer-grid\s*\{[^}]*grid-template-columns:\s*minmax\(190px, 1\.25fr\)/);
 assert.match(staffing,/\.staffing-plan-empty-state\s*\{/);
});
test('C4 Organizer retains 980px and 760px breakpoints and disabled controls',()=>{
 for(const size of [980,760])assert.match(staffing,new RegExp('@media \\(max-width: '+size+'px\\)'));
 assert.match(staffing,/\.project-team-person-select:disabled\s*\{[^}]*cursor:\s*not-allowed;[^}]*opacity:\s*0\.7;/);
 assert.match(staffing,/\.staffing-inline-action:disabled\s*\{[^}]*opacity:\s*\.5;/);
});
test('C4 refresh toast and reduced motion remain with workspace feedback',()=>{
 for(const name of ['.action-toast.refresh-feedback','.refresh-toast-indicator.is-progress','.bid-log-lifecycle-tabs'])assert.ok(feedback.includes(name),name);
 assert.match(feedback,/@media \(prefers-reduced-motion: reduce\)/);
 assert.doesNotMatch(staffing,/\.action-toast|\.bid-log-lifecycle-tab/);
});
test('C4 semantic financial colors are not absorbed into notification/notice CSS',()=>{
 assert.match(review,/color:\s*var\(--pending-foundation\)/);
 assert.match(review,/color:\s*var\(--warning\)/);
 assert.match(review,/\.schedule-review-flag\s*\{/);
 assert.doesNotMatch(notify,/\.needs-rebalance-flag\s*\{/);
});
test('C4 theme values and shared typography remain separate from ownership changes',()=>{
 const tokens=raw('styles/theme-tokens.css');
 for(const value of ['--bg: #0c0c0c;','--surface: #191919;','--pending-foundation: #85bde3;','--warning: #d3a75f;'])assert.ok(tokens.includes(value),value);
 for(const data of [notify,active,feedback,staffing])assert.doesNotMatch(data,/:root\[data-theme="dark"\]/);
});
test('C4 expanded imports still expose print, focus, financial and staffing contracts',()=>{
 assert.doesNotMatch(full,/@import\b/);
 for(const name of ['.notification-action-card','.management-preview-notice','.project-team-organizer-grid','.balance-review-status-stack','.pm-policy-switch.is-on'])assert.ok(full.includes(name),name);
 assert.ok(full.indexOf('.action-toast {')<full.indexOf('.staffing-organizer-note {'));
});
test('C4 module headers explain ownership and the permissions boundary',()=>{
 for(const name of ['08-notifications-and-inputs.css','10-active-projects.css','11-lifecycle-feedback.css','11a-active-project-staffing.css','13-financial-review-and-metrics.css']){
  const text=raw('styles/'+name);assert.match(text,/Edit here:/);assert.match(text,/Related:/);assert.match(text,/theme-tokens\.css/);
 }
 assert.match(raw('styles/11a-active-project-staffing.css'),/CSS does not enable writes/);
});
test('C4 entry points remain import maps, not a new overrides layer',()=>{
 for(const name of ['styles.css','theme.css'])assert.equal(noComments(raw(name)).replace(/@import\s+(['"])[^'"]+\1\s*;/g,'').trim(),'');
});
