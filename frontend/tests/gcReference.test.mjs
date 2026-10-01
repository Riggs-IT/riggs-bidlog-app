import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalDirectory, generalContractorNames, resolveContractor, contractorTokens,
  contractorFilterOptions, contractorFilterMatch, selectedRecords, selectContractor,
  createGcReferenceStore, MULTIPLE_GCS,
} from '../src/gcReference.js';

const items = [
  {sharePointItemId: 1, name: 'A.R. Mays Construction', cityStateZip: 'Scottsdale, AZ', streetAddress: '1 Test Street'},
  {sharePointItemId: 2, name: 'ESI Construction', cityStateZip: 'Meridian, ID'},
  {sharePointItemId: 3, name: 'ESI Construction', cityStateZip: 'Golden, CO'},
  {sharePointItemId: 4, name: 'BIG-D', cityStateZip: 'Phoenix, AZ'},
  {sharePointItemId: 5, name: 'Inactive GC', isActive: false},
  {sharePointItemId: 6, name: 'Willmeng Construction', cityStateZip: 'Phoenix, AZ'},
  {sharePointItemId: 7, name: 'Sun State Builders', cityStateZip: 'Tempe, AZ'},
  {sharePointItemId: 8, name: 'Wespac Construction, Inc.', cityStateZip: 'Phoenix, AZ'},
  {sharePointItemId: 9, name: 'LGE Design Build', cityStateZip: 'Phoenix, AZ'},
  {sharePointItemId: 10, name: 'Big-D Construction', cityStateZip: 'Salt Lake City, UT'},
];
const d = () => canonicalDirectory(items);
const response = (rows=items, status=200) => ({ok:status===200, status, json:async()=>({items:rows})});
const deferred = () => { let resolve, reject; const promise = new Promise((r,j)=>{resolve=r;reject=j;}); return {resolve,reject,promise}; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('legacy writes retain multi-GC delimiter, trim, order, and case-only deduplication', () => {
  assert.deepEqual(generalContractorNames('Old Name¡OLD NAME¡Second GC'), ['Old Name', 'Second GC']);
  assert.deepEqual(generalContractorNames([' A ', 'B¡C']), ['A','B','C']);
  assert.deepEqual(generalContractorNames(null), []);
  assert.deepEqual(generalContractorNames(['GC  Co', 'GC Co']), ['GC  Co','GC Co']);
});
test('directory identity is the compatibility PotentialGCID, not name', () => {
  assert.equal(d().byId.size,9); assert.equal(d().byName.get('esi construction').length,2);
});
test('inactive records are excluded', () => assert.equal(d().items.some(r=>r.name==='Inactive GC'),false));
test('ID zero, missing, and unsafe numeric IDs fail closed', () => {
  for(const id of [0,null,undefined,'no-id',-1,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>canonicalDirectory([{sharePointItemId:id,name:'Valid'}]));
});
test('duplicate record IDs fail instead of silently collapsing rows',()=>assert.throws(()=>canonicalDirectory([items[0],items[0]])));
test('invalid names and injected name delimiters fail',()=> {
  for(const name of ['', ' ', 'one¡two']) assert.throws(()=>canonicalDirectory([{sharePointItemId:1,name}]));
});
test('invalid response does not become an empty successful directory',()=> assert.throws(()=>canonicalDirectory({})));
test('canonical case variant resolves to one ID',()=>assert.equal(resolveContractor('a.r. mays construction',d()).key,'gc:1'));
test('punctuation and whitespace variant resolves only to a unique record',()=>assert.equal(resolveContractor('AR MAYS CONSTRUCTION',d()).key,'gc:1'));
test('explicit handoff alias resolves A.R. Mays to unique named target',()=>assert.equal(resolveContractor('AR MAYS',d()).key,'gc:1'));
test('approved handoff alias families resolve only through named canonical targets',()=>{
  assert.equal(resolveContractor('Willmeng',d()).key,'gc:6');
  assert.equal(resolveContractor('SUNSTATE',d()).key,'gc:7');
  assert.equal(resolveContractor('Wespac',d()).key,'gc:8');
  assert.equal(resolveContractor('LGE',d()).key,'gc:9');
  const withoutShortBigD=canonicalDirectory(items.filter(row=>row.sharePointItemId!==4));
  assert.equal(resolveContractor('Big D',withoutShortBigD).key,'gc:10');
});
test('unknown short names are not fuzzy expanded',()=>assert.equal(resolveContractor('ESI',d()).status,'UNMATCHED'));
test('same-name records are unresolved rather than arbitrarily choosing first ID',()=>assert.equal(resolveContractor('ESI Construction',d()).status,'AMBIGUOUS'));
test('format collision remains ambiguous',()=> {
 const dir=canonicalDirectory([{sharePointItemId:10,name:'A-B'},{sharePointItemId:11,name:'AB'}]);
 assert.equal(resolveContractor('A B',dir).status,'AMBIGUOUS');
 assert.equal(resolveContractor('AB',dir).key,'gc:11');
});
test('approved alias is not applied when an exact distinct GC exists',()=> {
 const dir=canonicalDirectory([...items,{sharePointItemId:11,name:'AR MAYS'}]);
 assert.equal(resolveContractor('AR MAYS',dir).key,'gc:11');
});
test('approved alias does not guess between duplicate target directory records',()=> {
 const dir=canonicalDirectory([...items,{sharePointItemId:11,name:'A.R. Mays Construction'}]);
 assert.equal(resolveContractor('AR MAYS',dir).status,'AMBIGUOUS');
});
test('filters include only represented contractors, not entire directory',()=>{
 const options=contractorFilterOptions(['AR MAYS','a.r. mays construction'],d());
 assert.deepEqual(options.map(r=>r.value),['gc:1']);
});
test('unmatched historical name remains visible and filterable',()=>{
 const option=contractorFilterOptions(['Unmapped Raw GC'],d())[0];
 assert.equal(option.label,'Unmapped Raw GC');
 assert.ok(contractorFilterMatch('Unmapped Raw GC',option.value,'ALL',d()));
});
test('canonical filters match every deterministic alias without rewriting input',()=>{
 const value=['AR MAYS','BIG-D']; const before=JSON.stringify(value);
 assert.ok(contractorFilterMatch(value,'gc:1','ALL',d())); assert.equal(JSON.stringify(value),before);
});
test('multi-GC filtering survives canonicalization and selected record changes',()=>{
 assert.ok(contractorFilterMatch('AR MAYS¡BIG-D',MULTIPLE_GCS,'ALL',d()));
 assert.ok(!contractorFilterMatch('AR MAYS',MULTIPLE_GCS,'ALL',d()));
 assert.ok(contractorFilterMatch('AR MAYS','ALL','ALL',d()));
});
test('out-of-scope selected key is not reinserted into directory filter options',()=>{
 const options=contractorFilterOptions(['Unknown'],canonicalDirectory([]),'gc:1');
 assert.ok(!options.some(r=>r.value==='gc:1')); // Out-of-scope options no longer injected.
 assert.ok(!contractorFilterMatch('Unknown','gc:1','ALL',canonicalDirectory([])));
});
test('picker selects record IDs separately even when names match',()=>{
 const a=selectContractor([],2,d()); assert.equal(selectedRecords(a.value,d(),a.chosenIds)[0].record.id,'2');
 const b=selectContractor(a.value,3,d(),true,a.chosenIds);
 assert.deepEqual(b.value,['ESI Construction']);
 assert.equal(selectedRecords(b.value,d(),b.chosenIds)[0].record.id,'3');
});
test('reopened name-only same-name selection reports ambiguity',()=>{
 const selected=selectedRecords(['ESI Construction'],d()); assert.equal(selected[0].record,null); assert.ok(selected[0].ambiguous);
});
test('new selection emits canonical name but preserves unrelated legacy contractors',()=>{
 const result=selectContractor(['Unknown raw name'],1,d()); assert.deepEqual(result.value,['Unknown raw name','A.R. Mays Construction']);
});
test('deselecting chosen ID removes just that contractor',()=>{
 const a=selectContractor(['BIG-D'],1,d()); const b=selectContractor(a.value,1,d(),true,a.chosenIds);
 assert.deepEqual(b.value,['BIG-D']);
});
test('single-select uses one canonical contractor',()=>assert.deepEqual(selectContractor(['BIG-D'],1,d(),false).value,['A.R. Mays Construction']));
test('picker rejects unknown/inactive directory IDs',()=>assert.throws(()=>selectContractor([],5,d())));
test('previous record choice is rejected if that record is no longer active',()=>{
 const r=selectedRecords(['ESI Construction'],canonicalDirectory([items[2]]),{'esi construction':'2'});
 assert.equal(r[0].record,null); assert.ok(r[0].currentOnly);
});
test('search corpus contains address, city, name and does not drop same-name records',()=>assert.ok(d().byId.get('1').searchText.includes('1 test street')));
test('normal callers share one in-flight read',async()=>{
 const pending=deferred();let calls=0; const s=createGcReferenceStore({fetcher:()=>{calls++;return pending.promise;}});
 const a=s.load(),b=s.load();assert.equal(a,b);await tick();assert.equal(calls,1);pending.resolve(response());await a;assert.equal(s.getSnapshot().items.length,9);
});
test('TTL cache expires without retaining a map of historical queries',async()=>{
 let clock=0,calls=0;const s=createGcReferenceStore({now:()=>clock,ttl:100,fetcher:async()=>{calls++;return response();}});
 await s.load();await s.load();assert.equal(calls,1);clock=100;await s.load();assert.equal(calls,2);
});
test('force refresh supersedes ignored-abort older transport',async()=>{
 const old=deferred(),fresh=deferred();let count=0;const s=createGcReferenceStore({fetcher:()=>++count===1?old.promise:fresh.promise});
 const a=s.load();const rejected=assert.rejects(a,{name:'AbortError'});await tick();
 const b=s.load({force:true});await tick();fresh.resolve(response([{sharePointItemId:20,name:'New GC'}]));await b;
 old.resolve(response());await rejected;assert.equal(s.getSnapshot().items[0].name,'New GC');
});
test('clear prevents old request from publishing into new session',async()=>{
 const old=deferred();const s=createGcReferenceStore({fetcher:()=>old.promise});const a=s.load();const rejected=assert.rejects(a,{name:'AbortError'});
 await tick();s.clear();old.resolve(response());await rejected;assert.equal(s.getSnapshot().items.length,0);assert.equal(s.getSnapshot().loadedAt,null);
});
test('failure is visible while retaining last known names, and explicit retry works',async()=>{
 let count=0;const s=createGcReferenceStore({fetcher:async()=>++count===2?response([],503):response()});
 await s.load();await assert.rejects(s.load({force:true}));assert.equal(s.getSnapshot().items.length,9);assert.ok(s.getSnapshot().error);
 await s.load({force:true});assert.equal(s.getSnapshot().error,null);
});
test('HTTP 403 fails without retry or auth bypass',async()=>{
 let calls=0;const s=createGcReferenceStore({fetcher:async()=>{calls++;return response([],403);}});
 await assert.rejects(s.load());assert.equal(calls,1);assert.equal(s.getSnapshot().items.length,0);
});
test('directory options are sorted once and frozen',()=>{assert.ok(Object.isFrozen(d().items));assert.ok(Object.isFrozen(d().items[0]));});
test('snapshot is stable until a publication and subscriptions clean up',async()=>{
 const s=createGcReferenceStore({fetcher:async()=>response()});const before=s.getSnapshot();assert.equal(before,s.getSnapshot());
 let calls=0;const off=s.subscribe(()=>calls++);await s.load();assert.ok(calls>0);assert.equal(s.getSnapshot(),s.getSnapshot());
 off();const last=calls;s.clear();assert.equal(calls,last);
});
test('directory GET is same-origin/no-store and never writes',async()=>{
 let seen;const s=createGcReferenceStore({fetcher:async(...args)=>{seen=args;return response();}});await s.load();
 assert.equal(seen[0],'/api/bid-log/reference/general-contractors');assert.equal(seen[1].method,'GET');assert.equal(seen[1].credentials,'same-origin');
 assert.equal(seen[1].cache,'no-store');assert.equal(seen[1].body,undefined);
});
