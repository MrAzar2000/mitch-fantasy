import test from 'node:test';
import assert from 'node:assert/strict';
import {saveSnapshot,readSnapshot} from '../snapshot-cache.mjs';
test('saved public response survives a new request; invalid and unavailable storage fail safely',async()=>{
 const previous=globalThis.caches;let response;
 globalThis.caches={open:async()=>({put:async(_,r)=>{response=r;},match:async()=>response?.clone()})};
 try{assert.equal(await readSnapshot(),null);await saveSnapshot({meta:{},teams:[]});assert.equal(response,undefined);
 const data={meta:{lastUpdated:'2026-10-23T17:00:00Z'},teams:[{id:1}]};await saveSnapshot(data);assert.deepEqual(await readSnapshot(),data);
 globalThis.caches={open:async()=>{throw new Error('Storage denied');}};assert.equal(await readSnapshot(),null);await saveSnapshot(data);
 }finally{globalThis.caches=previous;}
});
