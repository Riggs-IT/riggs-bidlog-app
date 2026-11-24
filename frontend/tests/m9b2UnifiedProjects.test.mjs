import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectDirectoryRows,projectDirectoryKey} from '../src/viewFilters.js';
import {isHiddenProject,isHiddenProjectName,visibleProjects,visibleProjectRelated} from '../src/projectVisibility.mjs';
import {unnumberedDirectoryRow,readUnnumberedDirectory} from '../src/unnumberedProjectDirectory.mjs';
import {allProjectSectionsOpen,setProjectSectionsOpen} from '../src/activeProjectDisclosure.mjs';
const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const row={setupId:'b83c8aa6-558b-545e-8bf8-7779236745f8',jobName:'TEST BID RODNEY 2',originalBidLogId:4970,cognitoEntryId:1199,revision:2};
test('visibility excludes exact internal jobs, not other test names, people or bid ID collisions',()=>{
  const jobs=[{jobListId:24,jobName:'renamed'},{jobListId:30,jobNumber:'11111'},{jobListId:31,jobName:' RIGGS   YARD '},{jobListId:32,jobName:'Test - Automation'}, {jobListId:33,jobName:'Riggs Yard Expansion'}, {jobListId:34,jobName:'Other',pm:'Riggs Yard'},unnumberedDirectoryRow(row)];
  assert.deepEqual(visibleProjects(jobs),jobs.slice(4));
  assert.equal(jobs.length,7);assert.equal(isHiddenProject({originalBidLogId:24,bidName:'New project'}),false);
  assert.equal(isHiddenProjectName(' Riggs Yard '),true);
  assert.deepEqual(visibleProjectRelated([{jobListId:24},{jobListId:31},{jobListId:33}],jobs),[{jobListId:33}]);
});
test('unnumbered projects participate in normal counts, completed toggle and unique row identity',()=>{
  const first=unnumberedDirectoryRow(row),second=unnumberedDirectoryRow({...row,setupId:'cd34254f-fb66-4d1e-8c77-16cd4f844962'});
  const numbered={jobListId:1199,jobNumber:'22500',jobName:'Real job'};
  const completed={jobListId:5,jobName:'Completed',projectCompleted:true};
  const active=[numbered,first,second,{jobListId:24}];
  assert.deepEqual(projectDirectoryRows(active,[completed],false),active.slice(0,3));
  assert.deepEqual(projectDirectoryRows(active,[completed],true),[...active.slice(0,3),completed]);
  assert.notEqual(projectDirectoryKey(first),projectDirectoryKey(second));
  assert.equal(first.jobListId,null);assert.equal(first.jobNumber,null);assert.notEqual(projectDirectoryKey(first),projectDirectoryKey(numbered));
});
test('directory reads preserve real JIS identity, quantities and operational financial ownership',()=>{
  const d={...row,fields:[{key:'jobType',value:'OTH'},{key:'squareFootageSF',value:'5000'},{key:'cubicYardsCY',value:0},{key:'operationalContractAmount',value:'11'},{key:'anticipatedStartDate',value:'2027-01-01'}]};
  const result=unnumberedDirectoryRow(row,d);assert.equal(result.squareFootage,'5000');assert.equal(result.cubicYards,0);assert.equal(result.operationalContractAmount,'11');assert.equal(result.totalContractAmount,null);assert.equal(result.effectiveStartDate,'2027-01-01');
  assert.throws(()=>unnumberedDirectoryRow(row,{...d,cognitoEntryId:1200}));
});
test('failed detail read keeps authorized row but marks missing information; no write is issued',async()=>{
  const paths=[];const result=await readUnnumberedDirectory({request:async(path,options)=>{paths.push(path);assert.equal(options.method,undefined);if(paths.length===1)return {externalState:'CREATED_UNNUMBERED',items:[row]};throw Error('offline');}});
  assert.equal(paths.length,2);assert.equal(result.partial,true);assert.equal(result.items[0].jobName,row.jobName);assert.equal(result.items[0].pm,null);
});
test('single toggle expands a mixed state, collapses all open sections, never replaces input state',()=>{
  const entries=[{open:false,draft:{value:'pending'}},{open:true}];const root={querySelectorAll:()=>entries};const draft=entries[0].draft;
  assert.equal(allProjectSectionsOpen(root),false);setProjectSectionsOpen(root,!allProjectSectionsOpen(root));assert.equal(allProjectSectionsOpen(root),true);setProjectSectionsOpen(root,!allProjectSectionsOpen(root));assert.equal(allProjectSectionsOpen(root),false);assert.equal(entries[0].draft,draft);
  assert.equal(allProjectSectionsOpen({querySelectorAll:()=>[]}),false);
  const toggle=read('ProjectSectionsToggle.jsx');assert.equal((toggle.match(/<button\b/g)||[]).length,1);assert.match(toggle,/Collapse all':'Expand all/);
});
test('both identities use same public modal entry and visual shell without canary wording',()=>{
  const page=read('ActiveProjectsWorkspace.jsx'),drawer=read('ActiveProjectEditDrawer.jsx'),editor=read('UnnumberedProjectEditor.jsx'),sheet=read('ActiveProjectCognitoSections.jsx');
  assert.doesNotMatch(page,/UnnumberedProjectsPanel|Awaiting Job Number/);assert.match(page,/setEditProjectId\(projectDirectoryKey\(project\)\)/);
  assert.match(drawer,/<UnnumberedProjectEditor/);assert.match(drawer,/<NumberedProjectEditDrawer/);assert.match(drawer,/bid-log-edit-drawer active-project-edit-drawer project-setup-editor/);assert.match(editor,/bid-log-edit-drawer active-project-edit-drawer project-setup-editor/);
  for(const title of ['Closeout','Project Information'])assert.ok(sheet.includes(`title="${title}"`));
  for(const title of ['Buildings','Admin'])assert.ok(drawer.includes(`title="${title}"`));
  assert.doesNotMatch(editor,/Original canary retained|approved reset|Mapped · save not enabled|integration pending/);
  assert.match(editor,/detail\?\.writeEnabled===true/);assert.match(editor,/expectedEntryId:detail.cognitoEntryId/);
});
test('business-display filtering leaves primary financial certification tuple intact',()=>{
  const app=read('App.jsx');assert.match(app,/portfolioBalance, currentProjects, currentMonthly, primarySnapshotId/);assert.match(app,/visibleProjects\(currentProjects\)/);assert.match(app,/visibleProjectRelated\(forecastAttention,currentProjects\)/);assert.match(read('ProjectAccountability.jsx'),/setRows\(visibleProjects\(payload\)\)/);assert.match(read('ProjectSetupAwaitingPanel.jsx'),/visibleProjects\(checked.items\)/);
});
