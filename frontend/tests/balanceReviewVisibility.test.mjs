import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

const source = file => readFileSync(new URL(`../src/${file}`, import.meta.url),'utf8');
const short = {
  jobListId: 531, needsRebalance: true, forecastVersionId: 201,
  projectionTargetAmount: 1819605.01, editablePmProjectionTotal: 1798368,
  rebalanceVarianceAmount: -21237.01,
  reviewStatus: 'NEEDS_REBALANCE', reviewStatusSource:'VERIFIED_SERVER',
};

test('table and drawer share signed SQL balance amounts, no editable projection required', async t => {
  const vite = await createServer({root:fileURLToPath(new URL('../', import.meta.url)),
    server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  t.after(() => vite.close());
  const {BalanceReviewAmount,default:BalanceReviewSummary,signedBalanceGap} =
    await vite.ssrLoadModule('/src/BalanceReviewSummary.jsx');
  assert.deepEqual(signedBalanceGap(short),{value:-21237.01,text:'−$21,237.01',direction:'short'});
  const amount = renderToString(React.createElement(BalanceReviewAmount,{review:short}));
  assert.doesNotMatch(amount,/Balance gap:/);
  assert.match(amount,/>\$21,237 short<\/span>/);
  assert.match(amount,/title="[^"]*\$21,237\.01[^"]*"/);
  assert.doesNotMatch(amount,/>\$21,237\.01<\/strong>/);
  assert.match(amount,/short/);
  const detail = renderToString(React.createElement(BalanceReviewSummary,{review:short}));
  assert.match(detail,/PM projection balance difference/);
  assert.match(detail,/Remaining contract/);
  assert.match(detail,/1,819,605\.01/);
  assert.match(detail,/PM projection/);
  assert.match(detail,/1,798,368/);
  assert.match(detail,/21,237\.01/);
  assert.doesNotMatch(detail,/Revise Projections|<input|<button|<form/);
});

test('pending Foundation keeps the gap visible only in detail, not as an instruction in the table',async t=>{
  const vite=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),
    server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  t.after(()=>vite.close());
  const {BalanceReviewAmount,default:BalanceReviewSummary} =
    await vite.ssrLoadModule('/src/BalanceReviewSummary.jsx');
  const pending={...short,reviewStatus:'PENDING_FOUNDATION'};
  assert.equal(renderToString(React.createElement(BalanceReviewAmount,{review:pending})),'');
  const detail=renderToString(React.createElement(BalanceReviewSummary,{review:pending}));
  assert.match(detail,/Pending Foundation/);
  assert.match(detail,/pending reconciliation/);
  assert.match(detail,/21,237\.01/);
  const unverified={...pending,reviewStatusSource:'SQL_REBALANCE_FALLBACK'};
  const fallbackAmount = renderToString(React.createElement(BalanceReviewAmount,{review:unverified}));
  assert.match(fallbackAmount,/>\$21,237 short<\/span>/);
  assert.match(fallbackAmount,/21,237\.01/); // exact value remains in hover text
  assert.match(renderToString(React.createElement(BalanceReviewSummary,{review:unverified})),/Needs Rebalance/);
});

test('null and missing amounts never turn into dollar zero or a fake gap',async t=>{
  const vite=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),
    server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  t.after(()=>vite.close());
  const {default:BalanceReviewSummary,BalanceReviewAmount,signedBalanceGap} =
    await vite.ssrLoadModule('/src/BalanceReviewSummary.jsx');
  for(const item of [null,undefined,NaN,'not a number',0]){
    const row={...short,rebalanceVarianceAmount:item};
    assert.equal(signedBalanceGap(row),null);
    assert.equal(renderToString(React.createElement(BalanceReviewAmount,{review:row})), '');
    assert.equal(renderToString(React.createElement(BalanceReviewSummary,{review:row})), '');
  }
  assert.equal(signedBalanceGap({...short,needsRebalance:false}),null);
});

test('amount wiring touches existing projected/pivot/directory and read-only drawer, not PM edit math',()=>{
  assert.match(source('App.jsx'),/BalanceReviewAmount review=\{rebalanceByJobId\.get/);
  assert.match(source('ProjectBillingPivot.jsx'),/BalanceReviewAmount review=\{row\.raw\}/);
  assert.match(source('ActiveProjectsWorkspace.jsx'),/BalanceReviewAmount review=\{rebalanceByJobId\.get/);
  assert.match(source('CurrentProjectBillingDrawer.jsx'),/<BalanceReviewSummary[\s\S]*?review=\{rebalanceAttention\}/);
  const flag=source('ForecastBalanceFlag.jsx');
  assert.doesNotMatch(flag,/Verifying Balance|review-verifying-flag/);
  assert.doesNotMatch(source('App.jsx'),/Verifying Balance/);
});


test('project detail action is explicit, and pending/uncertified statuses do not force PM edit', async t => {
  const vite = await createServer({root:fileURLToPath(new URL('../',import.meta.url)),
    server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  t.after(()=>vite.close());
  const {default:BalanceReviewSummary,BalanceReviewAmount} = await vite.ssrLoadModule('/src/BalanceReviewSummary.jsx');
  const action = renderToString(React.createElement(BalanceReviewSummary,{
    review:short,onAction:()=>{},actionLabel:'Revise Projections',
  }));
  assert.match(action, /<button[^>]*type="button"[^>]*class="balance-review-detail/);
  assert.match(action, /Revise Projections/);
  assert.doesNotMatch(action, /class="secondary-button balance-review-detail-action/);
  assert.match(action,/Remaining contract/);
  const pending = renderToString(React.createElement(BalanceReviewSummary,{
    review:{...short,reviewStatus:'PENDING_FOUNDATION'},
    onAction:()=>{},actionLabel:'View Billing Projections',
  }));
  assert.match(pending,/View Billing Projections/);
  assert.match(pending,/pending reconciliation/);
  const deferredReview = {...short,reviewStatusSource:'DEFERRED_CLASSIFICATION'};
  const deferred = renderToString(React.createElement(BalanceReviewSummary,{
    review:deferredReview,onAction:()=>{},
  }));
  assert.equal(deferred,'');
  assert.equal(renderToString(React.createElement(BalanceReviewAmount,{review:deferredReview})), '');
});
