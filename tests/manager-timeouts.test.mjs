import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {remainingTimeout,countdownText} from '../manager-timeouts.mjs';
function harness(admin=false){
  const calls=[];
  const source=readFileSync(new URL('../netlify/functions/manager-timeouts.mts',import.meta.url),'utf8');
  const js=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export default async','const handler = async').replace('export const config','const config'));
  const ctx=vm.createContext({Request,Response,URL,isAdmin:()=>admin,getDatabase:()=>({sql:async(strings,...params)=>{calls.push({query:strings.join('?'),params});return strings.join('').includes('SELECT')?[{expires_at:'2026-11-01T12:00:00Z'}]:[];}})});
  vm.runInContext(js,ctx);return {run:vm.runInContext('handler',ctx),calls};
}
const req=(method='GET',body,team=3,extra={})=>new Request('https://league.test/api/manager-timeouts?team='+team,{method,headers:extra,...(body===undefined?{}:{body:JSON.stringify(body)})});
test('only the admin may create or remove timeouts; cross-origin and invalid requests never query storage',async()=>{
  const h=harness();
  for(const method of ['PUT','DELETE'])assert.equal((await h.run(req(method,{seconds:60}))).status,401);
  assert.equal((await h.run(req('GET',undefined,0))).status,400);
  assert.equal((await h.run(req('PUT',{seconds:60},3,{origin:'https://other.test'}))).status,403);
  assert.equal((await h.run(req('POST',{}))).status,405);
  assert.equal(h.calls.length,0);
});
test('duration validation rejects negative, fractional, missing and excessive values',async()=>{
  const h=harness(true);
  for(const seconds of [0,-1,0.5,31536001,'60',null])assert.equal((await h.run(req('PUT',{seconds}))).status,400);
  assert.equal((await h.run(req('PUT',null))).status,400);assert.equal(h.calls.length,0);
});
test('timeouts persist using database time and expire in the database read query',async()=>{
  const h=harness(true),res=await h.run(req('PUT',{seconds:90},7)),data=await res.json();
  assert.equal(res.status,200);assert.equal(data.team,7);assert.equal(data.expiresAt,'2026-11-01T12:00:00Z');assert(data.serverNow);
  assert.match(h.calls[0].query,/ON CONFLICT.*DO UPDATE/s);assert.deepEqual([...h.calls[0].params],[7,90]);
  assert.match(h.calls[1].query,/team_id = \? AND expires_at > now\(\)/);assert.deepEqual([...h.calls[1].params],[7]);
  assert.equal(res.headers.get('Cache-Control'),'no-store');
});
test('ending a timeout only removes the selected team',async()=>{
  const h=harness(true);assert.equal((await h.run(req('DELETE',undefined,4))).status,200);
  assert.match(h.calls[0].query,/DELETE FROM manager_timeouts WHERE team_id = \?/);assert.deepEqual([...h.calls[0].params],[4]);
});
test('countdown uses elapsed wall time, includes days, and stops at expiry',()=>{
  const expiry='2026-11-01T12:00:00Z',now=Date.parse(expiry);
  assert.equal(remainingTimeout(expiry,now-90500),91);
  assert.equal(remainingTimeout(expiry,now),0);assert.equal(remainingTimeout(expiry,now+60000),0);
  assert.equal(remainingTimeout(null,now),0);assert.equal(countdownText(90061),'1d 01:01:01');assert.equal(countdownText(65),'00:01:05');
});
