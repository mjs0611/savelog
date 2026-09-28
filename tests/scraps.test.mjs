import assert from 'node:assert/strict';
import { getScrapIds, toggleScrapLocal } from '../src/lib/scraps.ts';
let value='["kept"]', fail=true;
globalThis.localStorage={getItem:()=>value,setItem:(_,next)=>{if(fail)throw Error('quota');value=next;}};
assert.equal(toggleScrapLocal('new'),null); assert.deepEqual(getScrapIds(),['kept']);
assert.equal(toggleScrapLocal('kept'),null); assert.deepEqual(getScrapIds(),['kept']);
fail=false; assert.equal(toggleScrapLocal('new'),true); assert.deepEqual(getScrapIds(),['new','kept']);
assert.equal(toggleScrapLocal('new'),false); assert.deepEqual(getScrapIds(),['kept']);
console.log('scrap add/remove storage failures and successful persistence: passed');
