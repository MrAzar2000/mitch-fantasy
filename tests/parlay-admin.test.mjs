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
