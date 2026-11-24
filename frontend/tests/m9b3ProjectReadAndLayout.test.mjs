import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isHiddenProjectName,visibleProjects} from '../src/projectVisibility.mjs';
import {compareBlankJobNumbers,comparePendingProjects} from '../src/projectDirectorySort.mjs';
import {readUnnumberedDirectory} from '../src/unnumberedProjectDirectory.mjs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
test('internal yard names include exact year-suffixed variants, not unrelated projects',()=>{
  assert.equal(isHiddenProjectName(' RIGGS YARD 2026 '),true);assert.equal(isHiddenProjectName('Riggs Yard 2025'),true);
  assert.equal(isHiddenProjectName('Riggs Yard Expansion'),false);assert.equal(isHiddenProjectName('Riggs Yard 2026 Expansion'),false);
  const rows=[{jobNumber:'8925',jobName:'Riggs Yard 2025'},{jobNumber:'8926',jobName:'RIGGS YARD 2026'},{jobNumber:null,jobName:'TEST BID RODNEY 2'},{jobListId:24}];
  assert.deepEqual(visibleProjects(rows),[rows[2]]);
});
test('blank job number sorts first ascending and last descending; assigned comparisons unchanged',()=>{
  for(const blank of [null,undefined,'','  ']){assert.equal(compareBlankJobNumbers(blank,'8925','asc'),-1);assert.equal(compareBlankJobNumbers('8925',blank,'asc'),1);assert.equal(compareBlankJobNumbers(blank,'8925','desc'),1);}
  assert.equal(compareBlankJobNumbers(null,'','asc'),0);assert.equal(compareBlankJobNumbers('8925','8926','asc'),null);
  assert.match(read('ActiveProjectsWorkspace.jsx'),/sortState\.key === 'job' \? compareBlankJobNumbers/);
});
test('directory explicit refresh bypasses detail cache; normal read does not',async()=>{
  const row={setupId:'b83c8aa6-558b-545e-8bf8-7779236745f8',originalBidLogId:4970,cognitoEntryId:1199,revision:2,jobName:'TEST BID RODNEY 2'};
  for(const fresh of [false,true]){const paths=[];await readUnnumberedDirectory({fresh,request:async path=>{paths.push(path);if(paths.length===1)return {externalState:'CREATED_UNNUMBERED',items:[row]};throw Error('offline');}});assert.equal(paths[1],`/api/project-setups/jis/${row.setupId}${fresh?'?fresh=true':''}`);}
});
test('numbered field staffing occupies its own full-width section, not paired office card',()=>{
  const drawer=read('ActiveProjectEditDrawer.jsx'),staff=read('ActiveProjectStaffingOrganizer.jsx'),css=read('styles/10-active-projects.css');
  const office=drawer.indexOf('sectionId="riggs"'),gc=drawer.indexOf('sectionId="gc"'),full=drawer.indexOf('sectionId="fieldStaffing"'),organizer=drawer.indexOf('<ProjectFieldTeam');
  assert.ok(office<gc&&gc<full&&full<organizer);assert.match(drawer.slice(gc,full),/<\/ActiveProjectSection>\s*<\/div>/);
  assert.match(css,/active-project-field-staffing-section \.project-team-organizer-grid \{grid-template-columns:minmax\(0,/);
  assert.doesNotMatch(staff,/controlled test project|Current assignments are shown in the Organizer timeline/);
  assert.doesNotMatch(drawer,/writeEnabled=\{Number\(jobListId\) === 24\}/);
});
test('manual reload and existing post-save refresh bypass cache; no browser persistent storage',()=>{
  const drawer=read('ActiveProjectEditDrawer.jsx'),pending=read('UnnumberedProjectEditor.jsx');
  assert.match(drawer,/quiet: true, fresh: true/);assert.match(drawer,/onClick=\{\(\)=>void loadCognitoDetail\(\{fresh:true\}\)\}/);
  assert.match(pending,/cycle\?'\?fresh=true'/);assert.doesNotMatch(pending,/localStorage|sessionStorage/);
});

test('pending projects stay at the top in both directions and all sorts',()=>{
  const pending={setupId:'setup',jobListId:null,jobNumber:null},real={jobListId:5,jobNumber:'99'},blank={jobListId:6,jobNumber:null};
  assert.equal(comparePendingProjects(pending,real),-1);assert.equal(comparePendingProjects(real,pending),1);
  assert.equal(comparePendingProjects(blank,real),0);assert.equal(comparePendingProjects(pending,pending),0);
  assert.match(read('ActiveProjectsWorkspace.jsx'),/const pendingOrder=comparePendingProjects\(a,b\);\s*if\(pendingOrder\)return pendingOrder;/);
});
