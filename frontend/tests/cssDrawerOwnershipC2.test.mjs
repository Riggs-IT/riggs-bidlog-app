import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readSource} from './helpers/readSource.mjs';
const src=new URL('../src/',import.meta.url);
const raw=f=>readFileSync(new URL(f,src),'utf8');
const uncomment=s=>s.replace(/\/\*[\s\S]*?\*\//g,'');
const drawers=uncomment(raw('styles/02-billing-drawers.css'));
const workspace=uncomment(raw('styles/04-projected-workspace.css'));
const refs=uncomment(raw('styles/06-project-references.css'));
const filters=uncomment(raw('styles/07-detail-layout-and-filters.css'));
// Collect top-level blocks only. Responsive rules remain intentionally separate.
function topRules(text){
 const result=[];let start=0,depth=0,quote=null,escaped=false,header='';
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c==='{'){if(depth===0)header=text.slice(start,i).trim();depth++;}
  if(c==='}'){depth--;if(depth===0){if(!header.startsWith('@'))result.push(header.replace(/\s+/g,' '));start=i+1;}}
 }
 assert.equal(depth,0,'unbalanced CSS in source test');return result;
}
const rootRules=topRules(drawers);
const oneRoot=(css,selector)=>assert.equal(topRules(css).filter(x=>x===selector).length,1,selector);

test('C2 makes the billing drawer the owner of shared cards and source comparisons',()=>{
 for(const selector of ['.billing-meta-card','.billing-characteristics-grid','.billing-curve-summary','.source-comparison','.projection-detail-grid','.billing-section-explainer']){
  assert.ok(drawers.includes(selector),selector);
  assert.ok(!workspace.includes(selector),`workspace still owns ${selector}`);
  assert.ok(!filters.includes(selector),`filter module still owns ${selector}`);
 }
});
test('base and final drawer fragments have one top-level rule per selector',()=>{
 for(const selector of ['.billing-drawer-meta','.completed-drawer-meta','.completed-drawer-scroll','.completed-drawer-section','.billing-curve-summary','.billing-curve-help-popover','.projection-attention-message','.projection-detail-grid'])oneRoot(drawers,selector);
});
test('reference cards own their final grid and direct-child card layout',()=>{
 oneRoot(refs,'.project-setup-flags');
 assert.match(refs,/\.project-setup-flags\s*> \.project-setup-flag\s*\{[^}]*min-height:\s*78px/);
 assert.match(refs,/\.project-setup-flags\s*> \.project-setup-flag\s*\+ \.project-setup-flag/);
 assert.doesNotMatch(filters,/\.project-setup-/);
});
test('curve help popover keeps its placement with its dimensions',()=>{
 assert.match(drawers,/\.billing-curve-help-popover\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*130;/);
 assert.doesNotMatch(refs,/\.billing-curve-help-popover\s*\{/);
});
test('sidebar and completed directory styling remain in the filter module',()=>{
 for(const selector of ['.side-filter-drawer','.side-filter-source-toggles','.completed-more-filter-grid','.completed-lifecycle-cell'])assert.ok(filters.includes(selector),selector);
 assert.doesNotMatch(filters,/\.billing-(?:drawer|kpi|meta|curve|characteristics)/);
});
test('card typography is shared between themes and preserves the accepted hierarchy',()=>{
 assert.match(drawers,/\.billing-meta-label[\s\S]*?font-size:\s*11px;/);
 assert.match(drawers,/\.billing-meta-card > strong[\s\S]*?font-size:\s*16px;/);
 assert.doesNotMatch(drawers,/:root\[data-theme/);
});
test('responsive grid thresholds are retained rather than collapsed into a desktop-only rule',()=>{
 for(const threshold of [1280,1050,900,760,700,640,620])assert.match(drawers,new RegExp(`@media\\s*\\(\\s*max-width:\\s*${threshold}px\\s*\\)`));
 for(const threshold of [1050,760,700])assert.match(refs,new RegExp(`@media\\s*\\(\\s*max-width:\\s*${threshold}px\\s*\\)`));
});
test('drawer print disclosures and shared close-button alignment survive',()=>{
 assert.match(drawers,/@media print\s*\{\s*\.source-comparison\s*\{\s*display:\s*none !important;/);
 assert.match(drawers,/\.billing-drawer-close,\s*\.completed-drawer-close\s*\{[^}]*place-items:\s*center;/);
});
test('independent financial, PM and closeout owners are not absorbed into drawer consolidation',()=>{
 const full=readSource(new URL('styles.css',src),'utf8');
 assert.match(full,/\.balance-review-status-stack > \.balance-review-amount-line\s*\{[^}]*color:\s*var\(--warning\);/);
 assert.match(full,/\.needs-rebalance-flag\.pending-foundation-flag/);
 assert.match(full,/\.pm-policy-switch\.is-on/);
 assert.ok(raw('styles/14-completed-closeout.css').includes('.completed-closeout-contract-ledger'));
});
test('import entry stays structural with no new overlay stylesheet',()=>{
 const entry=raw('styles.css');
 assert.equal([...entry.matchAll(/^@import\b/gm)].length,16);
 assert.doesNotMatch(uncomment(entry).replace(/@import\s+(['"])[^'"]+\1\s*;/g,''),/[{}]/);
 assert.ok(rootRules.length>30);
});
