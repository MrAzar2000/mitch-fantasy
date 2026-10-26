import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
function harness(name, admin=false){
 const writes=[],blobs=[],pushes=[];
 const source=readFileSync(new URL('../netlify/functions/'+name+'.mts',import.meta.url),'utf8');
 const js=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export default async','const handler = async').replace('export const config','const config'));
 const ctx=vm.createContext({Response,URL,crypto,Buffer,Blob,AbortSignal,Netlify:{env:{get:()=> 'test-secret'}},isAdmin:()=>admin,recordActivity:async(...args)=>writes.push(args),getStore:store=>({set:async(key,value)=>blobs.push({store,key,value})}),fetch:async(url,init)=>{pushes.push(JSON.parse(init.body));return new Response('{}');},getDatabase:()=>({sql:async(strings,...params)=>{const query=strings.join('?');if(/^SELECT id FROM site_feedback WHERE request_id/.test(query))return [];writes.push({query,params});return [{id:42}];}})});
 vm.runInContext(js,ctx);
 return {handler:vm.runInContext('handler',ctx),writes,blobs,pushes};
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
 assert.deepEqual(h.pushes.map(p=>p.teamIds),[[4]]);assert.equal(h.pushes[0].title,'New site problem');
 const admin=harness('site-feedback',true);assert.equal((await admin.handler(request('site-feedback',{id:42,status:'resolved'},'PATCH'))).status,200);assert.match(admin.writes[0].query,/UPDATE site_feedback/);
});
test('feedback accepts a missing subject and a photo-only report, storing the photo in blobs',async()=>{
 const h=harness('site-feedback');
 assert.equal((await h.handler(request('site-feedback',{requestId:crypto.randomUUID(),teamId:3,kind:'suggestion',title:'',message:'',page:''}))).status,400);
 assert.equal((await h.handler(request('site-feedback',{requestId:crypto.randomUUID(),teamId:3,kind:'suggestion',message:'',page:'',image:'data:text/html;base64,PGI+'}))).status,400);
 assert.equal(h.writes.length,0);assert.equal(h.blobs.length,0);
 const id=crypto.randomUUID(),r=await h.handler(request('site-feedback',{requestId:id,teamId:3,kind:'suggestion',message:'',page:'',image:'data:image/jpeg;base64,/9j/4AAQ'}));
 assert.equal(r.status,201);assert.equal(h.blobs[0].store,'feedback-photos');assert.equal(h.blobs[0].key,id+'.jpg');
 assert.equal(h.writes[0].params[3],'');assert.equal(h.writes[0].params[6],id+'.jpg');assert.deepEqual(h.pushes[0].teamIds,[4]);assert.equal(h.pushes[0].body,'Photo attached');
 const noSubject=await h.handler(request('site-feedback',{requestId:crypto.randomUUID(),teamId:null,kind:'problem',message:'Standings blank',page:'standings'}));
 assert.equal(noSubject.status,201);assert.equal(h.pushes[1].body,'Standings blank');
});
test('tracking starts once during boot, including direct links, rather than on home rendering',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/function boot\(\)\{\s*startSiteTracking\(\)/);
 assert.doesNotMatch(html,/VIEWS\.dash=function\(\)\{\s*startSiteTracking/);
 assert.match(html,/function startSiteTracking\(\)\{\s*if\(siteSession\)return/);
});
