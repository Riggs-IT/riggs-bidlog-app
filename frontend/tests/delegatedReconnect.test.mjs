import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconnectMicrosoft,checkMicrosoftReconnect} from '../src/delegatedReconnect.js';

const file = filename => readFileSync(new URL(filename, import.meta.url), 'utf8');

test('editor offers reconnect for expired delegated writes and never replays the saved write', () => {
  const src = file('../src/BidLogEditDrawer.jsx');
  assert.match(src, /delegated_session_expired/);
  assert.match(src, /Reconnect Microsoft/);
  assert.match(src, /await reconnectMicrosoft\(\)/);
  assert.match(src, /click Save again/);
  assert.doesNotMatch(src.slice(src.indexOf('async function reconnectEditorMicrosoft()'),src.indexOf('if (!sharePointItemId)')), /\bsave\(/);
});

test('merge has reconnect pathway without replaying merge, forcing fresh review', () => {
  const src = file('../src/BidLogMergeDialog.jsx');
  assert.match(src, /reconnectNeeded/);
  assert.match(src, /await reconnectMicrosoft\(\)/);
  assert.match(src, /resetReview\(\)/);
  assert.doesNotMatch(src.slice(src.indexOf('async function reconnectForMerge()'), src.indexOf('return (\n    <>',src.indexOf('async function reconnectForMerge()'))), /commitMerge\(/);
});

test('popup waits for a changed server-authenticated revision', async () => {
  const original = globalThis.window;
  const popup = {closed:false, location:{assign(value){this.value=value}}};
  let tick = null;
  let calls = 0;
  globalThis.window = {
    open: () => popup,
    fetch: async (url, options) => {
      assert.equal(url,'/api/auth/delegated/reconnect-status');
      assert.equal(options.credentials,'same-origin');
      calls += 1;
      return {ok:true, json:async () => ({revision: calls === 1 ? 'old' : 'new'})};
    },
    setInterval: callback => {tick=callback; return 101},
    clearInterval: () => {},
    setTimeout: () => 102,
    clearTimeout: () => {},
  };
  try {
    const promise = reconnectMicrosoft();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(popup.location.value, '/api/auth/delegated/reconnect');
    popup.closed = true;
    tick();
    assert.equal(await promise, true);
    assert.equal(calls,2);
  } finally {globalThis.window=original;}
});

test('popup cancellation or unchanged revision never claims success', async () => {
  const original = globalThis.window;
  const popup = {closed:false, location:{assign(){}}};
  let tick;
  globalThis.window = {
    open: () => popup,
    fetch: async () => ({ok:true, json:async () => ({revision:'still-old'})}),
    setInterval: fn => {tick=fn; return 21}, clearInterval:()=>{},
    setTimeout:()=>22, clearTimeout:()=>{},
  };
  try {
    const promise = reconnectMicrosoft();
    await new Promise(resolve => setImmediate(resolve));
    popup.closed = true; tick();
    await assert.rejects(promise, /not renewed/);
  } finally {globalThis.window=original;}
});

test('after an interrupted popup, user can check connection without restarting OAuth', async () => {
  const original=globalThis.window;
  const popup={closed:false, location:{assign(){}}};
  let tick; let rev='before';
  globalThis.window={
    open:()=>popup,
    fetch:async()=>({ok:true,json:async()=>({revision:rev})}),
    setInterval:fn=>{tick=fn;return 50},clearInterval:()=>{},
    setTimeout:()=>51,clearTimeout:()=>{},
  };
  try {
    const attempt=reconnectMicrosoft();
    await new Promise(resolve=>setImmediate(resolve));
    popup.closed=true;tick();
    await assert.rejects(attempt, /not renewed/);
    rev='after';
    assert.equal(await checkMicrosoftReconnect(),true);
  }finally{globalThis.window=original;}
});
