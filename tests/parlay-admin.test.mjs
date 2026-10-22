import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('../netlify/functions/parlay.mts',import.meta.url),'utf8');
const js=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export default async','const handler = async').replace('export const config','const config'));
function harness(){
  const writes=[];
  const db={
    update:table=>({set:values=>({where:where=>({returning:async()=>{writes.push({table,values,where});return [{id:7,...values}];}})})}),
    insert:table=>({values:values=>({onConflictDoUpdate:conflict=>({returning:async()=>{writes.push({table,values,conflict});return [values];}})})}),
  };
  const ctx=vm.createContext({Response,URL,database:()=>db,parlayLegs:{id:'id',season:'season'},parlayWeeks:{season:'season',week:'week'},eq:(...args)=>args,and:(...args)=>args});
  vm.runInContext(js,ctx);return {handler:vm.runInContext('handler',ctx),writes};
}
const patch=body=>new Request('https://league.test/api/parlay?season=2026',{method:'PATCH',body:JSON.stringify(body)});
test('edits pick, odds and result together and can clear a past result',async()=>{
  const h=harness();
  assert.equal((await h.handler(patch({id:7,pick:'Updated pick',odds:'+180',result:'won'}))).status,200);
  assert.deepEqual({...h.writes[0].values},{pick:'Updated pick',odds:'+180',result:'won'});
  await h.handler(patch({id:7,result:'pending'}));assert.equal(h.writes[1].values.result,'pending');
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].where)),[['id',7],['season',2026]]);
});
test('saves and clears weekly participants and total odds independently of picks',async()=>{
  const h=harness();
  assert.equal((await h.handler(patch({weekDetails:{week:1,participants:'Mitch, Alex',totalOdds:'+5000'}}))).status,200);
  assert.deepEqual({...h.writes[0].values},{season:2026,week:1,participants:'Mitch, Alex',totalOdds:'+5000'});
  await h.handler(patch({weekDetails:{week:1,participants:'',totalOdds:null}}));
  assert.equal(h.writes[1].values.totalOdds,null);
});
test('rejects invalid details, empty picks and invalid grades without writes',async()=>{
  const h=harness();
  for(const body of [{id:7,pick:' '},{id:7,result:'hit'},{weekDetails:{week:23,participants:'Mitch',totalOdds:null}},{grades:[{id:7,result:'won'},{id:8,result:'bad'}]}])assert.equal((await h.handler(patch(body))).status,400);
  assert.equal(h.writes.length,0);
});
test('page inline scripts parse',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
    if(!match[1].includes('src=')&&!match[1].includes('application/'))new vm.Script('(async()=>{'+match[2].replace(/^import .*;$/gm,'')+'\n})');
  }
});

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function liveHarness(extra={}){
 const ctx=vm.createContext({Date,Set,...extra});
 vm.runInContext(html.slice(html.indexOf('function currentParlayLegs('),html.indexOf('function renderParlayStatus(')),ctx);
 return ctx;
}
test('live parlay uses latest team submissions and responds to corrected grades',()=>{
 const ctx=liveHarness();
 const legs=[{id:1,teamId:1,result:'lost',created_at:'2026-10-20'}, {id:2,teamId:1,result:'won',created_at:'2026-10-21'}, {id:3,teamId:2,result:'pending',created_at:'2026-10-21'}];
 assert.match(ctx.parlayStatus(legs).label,/ALIVE/);
 legs[2].result='lost';assert.match(ctx.parlayStatus(legs).label,/BUSTED/);
 legs[2].result='won';assert.match(ctx.parlayStatus(legs).label,/HIT/);
 legs[2].result='pending';assert.match(ctx.parlayStatus(legs).label,/ALIVE/);
 legs[2].result='void';assert.match(ctx.parlayStatus(legs).label,/HIT/);
 assert.match(ctx.parlayStatus([]).label,/Waiting/);
 assert.match(ctx.parlayStatus([{teamId:1,result:'void'}]).label,/VOID/);
});
test('current-week result saves persist independently and can be corrected or cleared',async()=>{
 const h=harness();
 for(const result of ['won','lost','pending','void','won']){
  assert.equal((await h.handler(patch({id:7,result}))).status,200);
  assert.deepEqual({...h.writes.at(-1).values},{result});
 }
});
test('pick entry defaults to selected team manager and requires a choice when unassigned',()=>{
 for(const selected of [2,-1]){
  const fields=new Map();let markup='';
  const ctx=vm.createContext({VIEWS:{},D:{teams:[{id:1,owner:'Drew'},{id:2,owner:'Mitch'}],meta:{}},MEID:selected,meTeam:()=>selected===2?{id:2}:null,parlayWk:()=>8,parlayWeek:8,ADMIN:false,shead:()=>'',esc:s=>s,setTimeout:()=>{},el:s=>{markup=s;return {querySelector:key=>{if(!fields.has(key))fields.set(key,{});return fields.get(key);}}}});
  vm.runInContext(html.slice(html.indexOf('VIEWS.parlay=function(){'),html.indexOf('async function fetchParlayHistory(){')),ctx);
  ctx.VIEWS.parlay();
  assert.match(markup,selected===2?/<option value="Mitch" selected>/:/<option value="" disabled selected>/);
  assert.doesNotMatch(markup,/<option value="Drew" selected>/);
  assert.ok(markup.indexOf('id="plDetails"')>markup.indexOf('id="plList"'));
 }
});
test('failed live grading keeps local result and reports failure; successful corrections update both caches',async()=>{
 const pick={id:7,result:'pending'},history={...pick},messages={textContent:''};let renderCount=0,ok=false;
 const ctx=vm.createContext({ADMIN:true,D:{meta:{season:2026}},parlayPicks:[pick],parlayHistory:[history],document:{getElementById:()=>messages,querySelector:()=>null},renderPicksList:()=>renderCount++,fetch:async()=>({ok,json:async()=>({id:7,result:'won'})})});
 vm.runInContext(html.slice(html.indexOf('async function saveParlayResult('),html.indexOf('function renderPicksList(')),ctx);
 const button={disabled:false};await ctx.saveParlayResult(7,'won',button);
 assert.equal(pick.result,'pending');assert.equal(renderCount,0);assert.match(messages.textContent,/not saved/);assert.equal(button.disabled,false);
 ok=true;await ctx.saveParlayResult(7,'won',button);
 assert.equal(pick.result,'won');assert.equal(history.result,'won');assert.equal(renderCount,1);
});
