import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatestRead, freshReadPath, readOptions, watchVisibleReads } from '../src/browserFreshness.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;});return {promise,resolve,reject}; };
const flush = async () => { await Promise.resolve();await Promise.resolve(); };
function setup(read = async () => 'value') {
  const state = { published: [], errors: [], time: 0, calls: [], allow: true };
  state.reader = createLatestRead({read: config => {state.calls.push(config);return read(config);},
    publish: value => {if (!state.allow) return false;state.published.push(value);},
    failed: error => state.errors.push(error),now:() => state.time});
  return state;
}
test('ordinary simultaneous loads share one request', async () => {
  const d=deferred(),s=setup(()=>d.promise),a=s.reader.load(),b=s.reader.load();assert.equal(a,b);
  await flush();assert.equal(s.calls.length,1);d.resolve('ok');await a;assert.deepEqual(s.published,['ok']);
});
test('does not cache response bodies or stop later deliberate loads', async () => {
 const s=setup();await s.reader.load();await s.reader.load();assert.equal(s.calls.length,2);
});
test('freshness age suppresses rapid focus reads', async () => {
 const s=setup();await s.reader.load();s.time=29_999;assert.equal((await s.reader.load({maxAgeMs:30_000})).status,'recent');assert.equal(s.calls.length,1);
 s.time=30_000;await s.reader.load({maxAgeMs:30_000});assert.equal(s.calls.length,2);
});
test('empty results count as a successful read', async () => {
 const s=setup(async()=>[]);await s.reader.load();assert.equal((await s.reader.load({maxAgeMs:1})).status,'recent');
});
test('a manual or post-write load supersedes an older response even when abort is ignored', async () => {
 const a=deferred(),b=deferred();let n=0;const s=setup(()=>++n===1?a.promise:b.promise);
 const x=s.reader.load();await flush();const y=s.reader.load({replace:true,fresh:true});await flush();
 assert.equal(s.calls[0].signal.aborted,true);b.resolve('new');await y;a.resolve('old');await x;assert.deepEqual(s.published,['new']);
});
test('obsolete transport errors are not visible', async () => {
 const a=deferred();let n=0;const s=setup(()=>++n===1?a.promise:Promise.resolve('new'));
 const x=s.reader.load();await flush();await s.reader.load({replace:true});a.reject(Error('old error'));await x;assert.equal(s.errors.length,0);
});
test('failed reads retain the last successful timestamp and do not publish fake empty data', async () => {
 let fail=false;const s=setup(()=>fail?Promise.reject(Error('offline')):Promise.resolve({items:[0,null]}));
 await s.reader.load();s.time=40_000;fail=true;await s.reader.load();assert.equal(s.reader.lastSuccessAt,0);assert.equal(s.published.length,1);assert.equal(s.errors.length,1);
});
test('failures can recover on the next normal read', async () => {
 let n=0;const s=setup(()=>++n===1?Promise.reject(Error('offline')):Promise.resolve('ok'));
 await s.reader.load();await s.reader.load({maxAgeMs:30_000});assert.deepEqual(s.published,['ok']);
});
test('cancel stops publication after unmount without disabling future reads', async () => {
 const a=deferred();let n=0;const s=setup(()=>++n===1?a.promise:'again');const x=s.reader.load();await flush();s.reader.cancel();a.resolve('old');await x;
 await s.reader.load();assert.deepEqual(s.published,['again']);
});
test('reset forgets age for account/project changes', async () => {
 const s=setup();await s.reader.load();s.reader.reset();await s.reader.load({maxAgeMs:30_000});assert.equal(s.calls.length,2);
});
test('draft guard can decline publication without marking the view fresh', async () => {
 const d=deferred(),s=setup(()=>d.promise),p=s.reader.load();await flush();s.allow=false;d.resolve('stale-to-editor');
 assert.equal((await p).status,'deferred');assert.equal(s.reader.lastSuccessAt,null);assert.equal(s.published.length,0);
});
test('preserves explicit zero, null, PM-only months and API amounts unchanged', async () => {
 const payload={items:[{monthStart:'2027-01-01',pmForecastAmount:0,systemBaselineAmount:null},
 {monthStart:'2027-02-01',pmForecastAmount:null,foundationActualAmount:123}]};
 const s=setup(async()=>payload);await s.reader.load();assert.equal(s.published[0],payload);assert.equal(payload.items[0].pmForecastAmount,0);
});
test('fresh true reaches the reader separately from passive flag', async () => {
 const s=setup();await s.reader.load({fresh:true,passive:true});assert.equal(s.calls[0].fresh,true);assert.equal(s.calls[0].passive,true);
});
test('read options preserve abort signal and only passive GET callers add activity suppression', () => {
 const signal=new AbortController().signal;assert.deepEqual(readOptions({signal}),{credentials:'same-origin',cache:'no-store',signal});
 assert.equal(readOptions({passive:true}).headers['X-Riggs-Passive-Read'],'1');assert.equal(readOptions().method,undefined);
});
test('fresh path keeps filters and replaces an existing fresh flag', () => {
 assert.equal(freshReadPath('/api/test?search=hello+world&fresh=false',true),'/api/test?search=hello+world&fresh=true');
 assert.equal(freshReadPath('/api/test',true),'/api/test?fresh=true');assert.equal(freshReadPath('/api/test'),'/api/test');
});
function targets() {
 const w=new EventTarget(),d=new EventTarget();d.visibilityState='visible';let tick,clear=0;
 w.setInterval=fn=>{tick=fn;return 42;};w.clearInterval=id=>{assert.equal(id,42);clear++;};
 return {w,d,tick:()=>tick(),clears:()=>clear};
}
test('watch runs initially, each visible interval, focus and restored pages', () => {
 const e=targets(),calls=[];const stop=watchVisibleReads(c=>calls.push(c),{windowTarget:e.w,documentTarget:e.d});
 e.tick();e.w.dispatchEvent(new Event('focus'));e.w.dispatchEvent(new Event('pageshow'));assert.equal(calls.length,4);
 assert.ok(calls.every(c=>c.passive===true&&c.maxAgeMs===30_000));stop();
});
test('hidden tabs send no interval/focus reads and returning visible revalidates', () => {
 const e=targets(),calls=[];e.d.visibilityState='hidden';const stop=watchVisibleReads(c=>calls.push(c),{windowTarget:e.w,documentTarget:e.d});
 e.tick();e.w.dispatchEvent(new Event('focus'));assert.equal(calls.length,0);e.d.visibilityState='visible';e.d.dispatchEvent(new Event('visibilitychange'));assert.equal(calls.length,1);stop();
});
test('cleanup removes timers and event listeners', () => {
 const e=targets(),calls=[];const stop=watchVisibleReads(c=>calls.push(c),{windowTarget:e.w,documentTarget:e.d});stop();
 e.tick();e.w.dispatchEvent(new Event('focus'));e.d.dispatchEvent(new Event('visibilitychange'));assert.equal(calls.length,1);assert.equal(e.clears(),1);
});
test('permission/session/edit guard can suspend watch reads', () => {
 const e=targets(),calls=[];let allowed=false;const stop=watchVisibleReads(c=>calls.push(c),{windowTarget:e.w,documentTarget:e.d,allowed:()=>allowed});
 e.tick();assert.equal(calls.length,0);allowed=true;e.tick();assert.equal(calls.length,1);stop();
});
test('current-project and active-bid refresh owners are independent', async () => {
 const d=deferred(),a=setup(()=>d.promise),b=setup();const p=a.reader.load();await b.reader.load();assert.equal(b.published.length,1);assert.equal(a.published.length,0);d.resolve('a');await p;
});
