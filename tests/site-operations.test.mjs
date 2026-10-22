import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
function harness(name, admin=false){
 const writes=[];
 const source=readFileSync(new URL('../netlify/functions/'+name+'.mts',import.meta.url),'utf8');
 const js=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export default async','const handler = async').replace('export const config','const config'));
 const ctx=vm.createContext({Response,URL,crypto,Netlify:{env:{get:()=> 'test-secret'}},isAdmin:()=>admin,recordActivity:async(...args)=>writes.push(args),getDatabase:()=>({sql:async(strings,...params)=>{writes.push({query:strings.join('?'),params});return [{id:42}];}})});
 vm.runInContext(js,ctx);
 return {handler:vm.runInContext('handler',ctx),writes};
}
const request=(path,body,method='POST',headers={})=>new Request('https://league.test/api/'+path,{method,headers, ...(method==='GET'?{}:{body:JSON.stringify(body)})});
test('logs and feedback reads require server-verified admin access; status writes are protected',async()=>{
 for(const name of ['site-activity','site-feedback']){const h=harness(name);assert.equal((await h.handler(request(name,null,'GET'))).status,401);assert.equal(h.writes.length,0);}
 const h=harness('site-feedback');assert.equal((await h.handler(request('site-feedback',{id:1,status:'resolved'},'PATCH'))).status,401);assert.equal(h.writes.length,0);
});
test('activity rejects invalid payloads, notification spoofing, and cross-origin requests',async()=>{
 const h=harness('site-activity');
 for(const body of [null,[],{}, {category:'notification',detail:'pretend sent'}])assert.ok([400,403].includes((await h.handler(request('site-activity',body))).status));
 assert.equal((await h.handler(request('site-activity',{},'POST',{origin:'https://other.test'}))).status,403);assert.equal(h.writes.length,0);
});
test('valid observations deduplicate by event id and retain selected-team attribution',async()=>{
 const h=harness('site-activity'),id=crypto.randomUUID();
 const r=await h.handler(request('site-activity',{eventId:id,sessionId:crypto.randomUUID(),deviceId:crypto.randomUUID(),teamId:3,category:'activity',action:'app_open',detail:'Browser'}));
 assert.equal(r.status,200);assert.match(h.writes[0].query,/ON CONFLICT/);assert.equal(h.writes[0].params[0],id);assert.equal(h.writes[0].params[3],3);
});
test('feedback validates content, stores an idempotent report and supports admin status changes',async()=>{
 const h=harness('site-feedback');
 assert.equal((await h.handler(request('site-feedback',{kind:'problem',title:''}))).status,400);assert.equal(h.writes.length,0);
 const r=await h.handler(request('site-feedback',{requestId:crypto.randomUUID(),teamId:null,kind:'problem',title:'Scoreboard fails',message:'Tap Week 8 to reproduce',page:'scoreboard'}));
 assert.equal(r.status,201);assert.equal((await r.json()).id,42);assert.match(h.writes[0].query,/ON CONFLICT/);
 const admin=harness('site-feedback',true);assert.equal((await admin.handler(request('site-feedback',{id:42,status:'resolved'},'PATCH'))).status,200);assert.match(admin.writes[0].query,/UPDATE site_feedback/);
});
test('tracking starts once during boot, including direct links, rather than on home rendering',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/function boot\(\)\{\s*startSiteTracking\(\)/);
 assert.doesNotMatch(html,/VIEWS\.dash=function\(\)\{\s*startSiteTracking/);
 assert.match(html,/function startSiteTracking\(\)\{\s*if\(siteSession\)return/);
});
