import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {isTiltProject,isValidAwardPanelCount} from '../src/bidLogAwardQuantity.mjs';
test('Tilt award panels required, positive whole SQL int',()=>{
 assert.equal(isTiltProject(' Tilt '),true);assert.equal(isTiltProject('CIP'),false);
 for(const v of [null,undefined,'',0,-1,1.5,true,'NaN','Infinity',2147483648])assert.equal(isValidAwardPanelCount(v),false,String(v));
 for(const v of ['65',65,2147483647])assert.equal(isValidAwardPanelCount(v),true,String(v));
 const s=readFileSync(new URL('../src/BidLogEditDrawer.jsx',import.meta.url),'utf8');
 assert.match(s,/key: 'numberOfPanels'.*isTiltProject.*isValidAwardPanelCount/);assert.match(s,/fieldKey="numberOfPanels" invalid=/);
});
