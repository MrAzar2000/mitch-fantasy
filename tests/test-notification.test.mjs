import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(readFileSync(new URL('../netlify/functions/test-notification.mts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default async','const handler=async').replace('export const config','const config'));
function harness({duplicate=false}={}){
 let writes=0,body;const hash='a'.repeat(64);
 const ctx=vm.createContext({Request,Response,URL,Date,JSON,String,Math,AbortSignal,Netlify:{env:{get:()=> 'configured'}},getDatabase:()=>({sql:async(parts)=>{if(parts[0].startsWith('SELECT'))return [{subscription_hash:hash}];writes++;return duplicate?[]:[{alert_key:'test'}];}}),fetch:async(_,opts)=>{if(opts?.body)body=JSON.parse(opts.body);return {ok:true,json:async()=>opts?.body?{sent:1,failed:0}:{testNotifications:true}};}});
 vm.runInContext(source,ctx);return {run:req=>vm.runInContext('handler',ctx)(req),writes:()=>writes,body:()=>body};
}
const request=(extra={})=>new Request('https://site.test/api/test-notification',{method:'POST',headers:{origin:'https://site.test',cookie:'mfl_preferences=12345678-1234-1234-1234-123456789abc',...extra}});
test('remote tests reject foreign origins and missing browser IDs without writing',async()=>{
 const h=harness();assert.equal((await h.run(request({origin:'https://elsewhere.test'}))).status,403);assert.equal((await h.run(request({cookie:''}))).status,400);assert.equal(h.writes(),0);
});
test('remote tests target only the requesting subscription and enforce a per-minute limit',async()=>{
 const h=harness();assert.equal((await h.run(request())).status,200);assert.deepEqual(Array.from(h.body().subscriptionHashes),['a'.repeat(64)]);assert.equal(h.body().teamIds,undefined);
 const duplicate=harness({duplicate:true});assert.equal((await duplicate.run(request())).status,429);assert.equal(duplicate.body(),undefined);
});
