import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {normalizeInboxReport} from '../netlify/lib/team-inbox.mts';
import {safeInboxUrl} from '../team-inbox.mjs';
const device='13db9799-4f25-4456-9444-7658d5917c31';
function harness(name='team-inbox',rows=[]){
  const calls=[];
  const source=readFileSync(new URL('../netlify/functions/'+name+'.mts',import.meta.url),'utf8');
  const js=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export default async','const handler = async').replace('export const config','const config'));
  const ctx=vm.createContext({Request,Response,URL,crypto,normalizeInboxReport,Netlify:{env:{get:()=> 'test-secret'}},getDatabase:()=>({sql:async(strings,...params)=>{const query=strings.join('?');calls.push({query,params});if(query.includes('SELECT m.id'))return rows;if(query.includes('AS unread'))return [{unread:80,latest:120}];return [];}}),isAdmin:()=>false,recordActivity:async()=>{throw Error('Unexpected unvalidated delivery');}});
  vm.runInContext(js,ctx);return {run:vm.runInContext('handler',ctx),calls};
}
function req(path='team-inbox?team=3',method='GET',payload,headers={}){
  return new Request('https://league.test/api/'+path,{method,headers:{cookie:`mfl_preferences=${device}`,...headers},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
}
test('inbox reports retain target teams, distinguish broadcasts, and reject malformed audiences',()=>{
  assert.deepEqual(normalizeInboxReport(JSON.stringify({title:'Trade Block',body:'New players',teams:[3,3,4]})),{title:'Trade Block',body:'New players',url:'/#block',teams:[3,4]});
  assert.equal(normalizeInboxReport(JSON.stringify({title:'League update',body:'Hello',teams:'everyone'})).teams,null);
  assert.equal(normalizeInboxReport(JSON.stringify({title:'League update',body:'Hello',teams:[]})).teams,null);
  for(const teams of [[0],[-1],['3'],{},'3'])assert.equal(normalizeInboxReport(JSON.stringify({title:'Hello',body:'World',teams})),null);
  assert.equal(normalizeInboxReport('broken'),null);
});
test('notification links cannot leave the league site or execute scripts',()=>{
  for(const url of ['javascript:alert(1)','https://example.com','//example.com','/\\example.com','/api/team-inbox']){
    assert.equal(safeInboxUrl(url),'/');
    assert.equal(normalizeInboxReport(JSON.stringify({title:'Hello',body:'World',url})).url,'/');
  }
  assert.equal(safeInboxUrl('/#matchup?week=8'),'/#matchup?week=8');
});
test('inbox rejects invalid teams, missing devices and cross-origin writes before touching storage',async()=>{
  const h=harness();
  assert.equal((await h.run(req('team-inbox?team=0'))).status,400);
  assert.equal((await h.run(req('team-inbox?team=3','GET',undefined,{cookie:''}))).status,400);
  assert.equal((await h.run(req('team-inbox?team=3','PATCH',{action:'read',id:3},{origin:'https://other.test'}))).status,403);
  assert.equal((await h.run(req('team-inbox?team=3','POST',{}))).status,405);
  assert.equal(h.calls.length,0);
});
test('inbox pagination returns independent totals and scopes receipts to both device and team',async()=>{
  const h=harness('team-inbox',Array.from({length:51},(_,i)=>({id:100-i,title:'Notification',body:'League update',read:false})));
  const res=await h.run(req()),p=await res.json();
  assert.equal(res.status,200);assert.equal(p.rows.length,50);assert.equal(p.next,51);assert.equal(p.unread,80);assert.equal(p.latest,120);
  assert.deepEqual([...h.calls[0].params],[3,device,'[3]',2147483647]);
  assert.match(h.calls[0].query,/team_ids IS NULL OR m.team_ids @>/);
  assert.match(h.calls[0].query,/r.team_id = \? AND r.device_id = \?/);
});
test('mark-all uses a fixed message cutoff and cannot affect another team audience',async()=>{
  const h=harness();
  assert.equal((await h.run(req('team-inbox?team=3','PATCH',{action:'read_all',id:25}))).status,200);
  const q=h.calls[0];assert.match(q.query,/team_ids IS NULL OR team_ids @>/);assert.match(q.query,/id <= \?/);assert.match(q.query,/ON CONFLICT DO NOTHING/);
  assert.deepEqual([...q.params],[device,3,'[3]','read_all',25,'read_all',25]);
  const invalid=harness();assert.equal((await invalid.run(req('team-inbox?team=3','PATCH',{action:'read_all',id:0}))).status,400);assert.equal(invalid.calls.length,0);
});
test('only authenticated push reports write a notification and its log atomically',async()=>{
  const h=harness('site-activity'),body={category:'notification',detail:JSON.stringify({title:'Roster alert',body:'Review your starters',teams:[3]})};
  assert.equal((await h.run(req('site-activity','POST',body))).status,403);assert.equal(h.calls.length,0);
  const res=await h.run(req('site-activity','POST',body,{'x-notify-secret':'test-secret'}));
  assert.equal(res.status,200);assert.equal(h.calls.length,1);assert.match(h.calls[0].query,/WITH logged AS/);assert.match(h.calls[0].query,/INSERT INTO team_inbox_messages/);assert(h.calls[0].params.includes('[3]'));
});
