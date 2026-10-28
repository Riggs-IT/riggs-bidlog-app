import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readSource} from './helpers/readSource.mjs';
const src=new URL('../src/',import.meta.url);
const raw=f=>readFileSync(new URL(f,src),'utf8');
const uncomment=s=>s.replace(/\/\*[\s\S]*?\*\//g,'');
const pivot=uncomment(raw('styles/05-project-pivot.css'));
const other=name=>uncomment(raw('styles/'+name));
const one=s=>{
 const escaped=s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
 const matches=[...pivot.matchAll(new RegExp('(?:^|})\\s*'+escaped+'\\s*\\{','g'))];
 assert.equal(matches.length,1,s);
};

test('C3 pivot owns auxiliary and source-aware columns instead of inputs/references',()=>{
 for(const selector of ['.pivot-team-column','.pivot-gc-column','.pivot-source-active','.pivot-source-potential'])assert.ok(pivot.includes(selector),selector);
 for(const f of ['06-project-references.css','08-notifications-and-inputs.css'])assert.doesNotMatch(other(f),/\.project-pivot-table/);
});
test('month navigation and floating coverage controls have a single component owner',()=>{
 for(const selector of ['.project-pivot-month-scroll','.project-pivot-month-scroll-range','.project-pivot-sticky-coverage','.floating-table-controls'])assert.ok(pivot.includes(selector),selector);
 assert.doesNotMatch(other('11-lifecycle-feedback-and-staffing.css'),/\.project-pivot-|\.pivot-header-/);
});
test('pivot header totals are no longer split across table-finish and lifecycle files',()=>{
 for(const f of ['11-lifecycle-feedback-and-staffing.css','12-table-teams-and-zebra.css'])assert.doesNotMatch(other(f),/\.pivot-header-/);
 for(const s of ['.pivot-header-total-values','.pivot-header-activity-counts','.pivot-header-activity-separator'])one(s);
});
test('toolbar and project identity have one shared base definition each',()=>{
 for(const s of ['.project-pivot-toolbar','.pivot-project-info','.pivot-project-name','.pivot-project-name-line'])one(s);
 assert.match(pivot,/\.pivot-project-name\s*\{[^}]*text-overflow:\s*ellipsis;/);
 assert.match(pivot,/\.project-pivot-toolbar\s*\{[^}]*flex-wrap:\s*wrap;/);
});
test('shared title and status line retain their non-pivot owner',()=>{
 const shared=other('12-table-teams-and-zebra.css');
 assert.match(shared,/\.project-name-status-line\s*\{[^}]*display:\s*flex;[^}]*min-width:\s*0;[^}]*flex-wrap:\s*nowrap;/);
 assert.match(shared,/\.project-title-ellipsis\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*flex:\s*1 1 auto;/);
});
test('financial-review module no longer owns All metric-track or column geometry',()=>{
 const review=other('13-financial-review-and-metrics.css');
 assert.doesNotMatch(review,/\.pivot-metric-label|\.pivot-billing-amount|\.pivot-header-total|\.pivot-variance-mode-indicator/);
 assert.ok(pivot.includes('.pivot-metric-label-list'));
 assert.ok(pivot.includes('.pivot-variance-mode-indicator'));
});
test('All preserves its four, no-margin three, and completed-history two tracks',()=>{
 assert.match(pivot,/\.pivot-metric-label-list,\s*\.pivot-billing-amounts\s*\{[^}]*grid-template-rows:\s*repeat\(4, 15px\)/);
 assert.match(pivot,/\.pivot-no-margin[^}]*grid-template-rows:\s*repeat\(3, 15px\)/);
 assert.match(pivot,/\.pivot-history-only[^}]*grid-template-rows:\s*repeat\(2, 15px\)/);
});
test('frozen source-aware offsets and narrow Probability offsets retain exact values',()=>{
 for(const number of [82,94,176,300,476,260,436])assert.match(pivot,new RegExp('left:\\s*'+number+'px;'));
 assert.match(pivot,/@media \(max-width: 760px\)\s*\{\s*\.project-pivot-table\.pivot-source-potential[\s\S]*?left:\s*260px;/);
 assert.match(pivot,/@media \(max-width: 760px\)\s*\{\s*\.project-pivot-table\.pivot-source-potential[^}]*left:\s*260px;\s*}\s*\.project-pivot-table\.pivot-source-combined[^}]*left:\s*436px;/);
});
test('compact metric lane keeps its accepted widths and stable identity offsets',()=>{
 assert.match(pivot,/\.pivot-metric-labels-column\s*\{\s*position:\s*sticky;\s*left:\s*394px;/);
 assert.match(pivot,/\.pivot-source-combined\s*\.pivot-metric-labels-column\s*\{\s*left:\s*618px;/);
 assert.match(pivot,/\.pivot-metric-labels-pinned\s*\.pivot-metric-labels-column\s*\{\s*width:\s*63px;/);
});
test('late project background clip stays after shared header background reset',()=>{
 const header=pivot.indexOf('z-index: 8;');
 const late=pivot.indexOf('background-clip: padding-box;');
 assert.ok(header>=0 && late>header,'do not merge clip before the TH background shorthand');
 assert.match(pivot,/\.floating-table-header-table\s*th\.pivot-probability-column\s*\{[^}]*z-index:\s*13;/);
});
test('both genuine 760px adaptations and print-hidden controls remain',()=>{
 assert.match(pivot,/@media \(max-width: 760px\)[\s\S]*?width:\s*110px;/);
 assert.match(pivot,/@media print\s*\{\s*\.project-pivot-month-scroll\s*\{\s*display:\s*none !important;/);
 assert.match(pivot,/@media print\s*\{\s*\.project-pivot-toolbar,\s*\.floating-table-controls/);
});
test('shared badges and row states remain in the shared table module',()=>{
 const shared=other('12-table-teams-and-zebra.css');
 for(const s of ['.project-team-badges.compact','.project-team-badge strong','even of .pivot-project-row','td.pivot-probability-column'])assert.ok(shared.includes(s),s);
 assert.match(shared,/font-weight:\s*400;/);
});
test('semantic balance colors and right-aligned amount stack are not migrated into layout',()=>{
 const review=other('13-financial-review-and-metrics.css'),balance=other('15-balance-presentation.css');
 assert.match(review,/color:\s*var\(--pending-foundation\)/);
 assert.match(review,/color:\s*var\(--warning\)/);
 assert.match(balance,/\.balance-review-status-stack/);
 assert.match(balance,/color:\s*var\(--warning\)/);
 assert.doesNotMatch(pivot,/\.needs-rebalance-flag\s*\{|\.balance-review-amount-line\s*\{/);
});
test('entry point retains 15 imports and resolves the actual modules in order',()=>{
 const entry=raw('styles.css'),full=readSource(new URL('styles.css',src));
 assert.equal([...entry.matchAll(/^@import\b/gm)].length,15);
 assert.doesNotMatch(uncomment(entry).replace(/@import\s+(['"])[^'"]+\1\s*;/g,''),/[{}]/);
 assert.ok(full.includes('.project-pivot-sticky-coverage'));
 assert.ok(full.indexOf('.pivot-billing-amount-line')<full.indexOf('.notification-count'));
});
