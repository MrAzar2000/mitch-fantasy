import test from 'node:test';
import assert from 'node:assert/strict';
import { optimalLineup, estimatedCeiling, eliminationNumber } from '../lineup-tools.mjs';
test('optimizes competing position and FLEX assignments without reusing a player',()=>{
 const result=optimalLineup([{playerId:1,pos:'RB',value:20},{playerId:2,pos:'RB',value:18},{playerId:3,pos:'WR',value:30},{playerId:4,pos:'TE',value:12}],['RB','WR','FLEX']);
 assert.equal(result.total,68);assert.equal(result.complete,true);
 assert.equal(new Set(result.picks.map(p=>p.playerId)).size,3);
});
test('fills slots with negative projections and reports unavailable positions as incomplete',()=>{
 const result=optimalLineup([{pos:'QB',value:-2},{pos:'RB',value:null}],['QB','RB']);
 assert.equal(result.total,-2);assert.equal(result.picks.length,1);assert.equal(result.complete,false);
});
test('ceiling needs a projection and at least three games and reflects volatility',()=>{
 assert.equal(estimatedCeiling(null,[10,20,30]),null);
 assert.equal(estimatedCeiling(15,[10,20]),null);
 assert.equal(estimatedCeiling(15,[10,10,10]),15);
 assert.ok(estimatedCeiling(15,[0,10,20])>15);
});
test('elimination number requires being strictly behind, handles ties and exhausted schedules',()=>{
 assert.equal(eliminationNumber({w:4},{w:6},5),4);
 assert.equal(eliminationNumber({w:4,tie:1},{w:6},5),4);
 assert.equal(eliminationNumber({w:4},{w:6,tie:1},5),3);
 assert.equal(eliminationNumber({w:4},{w:6},2),1);
 assert.equal(eliminationNumber({w:4},{w:6},1),0);
});
