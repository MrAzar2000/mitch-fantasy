import test from 'node:test';
import assert from 'node:assert/strict';
import {extraPersonalMetrics} from '../personal-metrics.mjs';
const s={scores:[100,120],weekly:{1:100,2:120},pf:220,pa:210,ppg:110,results:[{r:'W',pf:100,pa:90},{r:'L',pf:120,pa:120.5}]};
const stats={weeks:[1,2],S:{1:s,2:{scores:[100,130],weekly:{1:100,2:130},pf:230,pa:220,ppg:115}}};
test('extra team metrics use finished scores and include ties in weekly highs and lows',()=>{
 const out=Object.fromEntries(extraPersonalMetrics({data:{},stats,teamId:1}));
 assert.equal(out['Median weekly score'],'110.0');assert.equal(out['Scoring rank'],2);assert.equal(out['Point differential'],'10.0');
 assert.equal(out['Weekly high scores (ties included)'],1);assert.equal(out['Weekly low scores (ties included)'],2);
 assert.equal(out['Closest loss'],'0.5');assert.equal(out['At or above weekly league median'],'1 / 2');
});
test('lineup metrics exclude unrecorded and live weeks and never substitute missing projections',()=>{
 const data={weekly:{1:{1:[[11,0,0,null]]},3:{1:[[11,0,99,1]]}},faab:{teams:[{teamId:1,spent:20,remaining:80,adds:4}]}};
 const out=Object.fromEntries(extraPersonalMetrics({data,stats,teamId:1,lineupSplit:r=>({act:r[0][2],opt:10,left:10-r[0][2]})}));
 assert.equal(out['Recorded lineup weeks'],1);assert.equal(out['Recorded lineup efficiency'],'0.0%');assert.equal(out['Points left on bench (optimal lineup)'],'10.0');
 assert(!('Average starter points vs projection' in out));assert.equal(out['FAAB remaining'],'$80');
});
test('preseason metrics omit unavailable performance and zero-budget data stays valid',()=>{
 const out=Object.fromEntries(extraPersonalMetrics({data:{faab:{teams:[{teamId:1,spent:0,remaining:0,adds:0}]}},stats:{weeks:[],S:{1:{scores:[]}}},teamId:1}));
 assert.deepEqual(out,{'FAAB spent':'$0','FAAB remaining':'$0','Waiver / free-agent adds':0});
});
test('recent form sorts completed week numbers instead of trusting schedule storage order',()=>{
 const state={weeks:[4,1,3,2],S:{1:{...s,ppg:25,scores:[40,10,30,20],weekly:{1:10,2:20,3:30,4:40}}}};
 const out=Object.fromEntries(extraPersonalMetrics({data:{},stats:state,teamId:1}));
 assert.equal(out['Last 3 completed weeks PPG'],'30.0');assert.equal(out['Recent scoring vs season PPG'],'5.0');
});
