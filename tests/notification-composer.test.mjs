import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function composer(){
  const controls=Object.fromEntries(['.x','#pnMsg','#pnSend','#pnEveryone','#pnAudience','#pnTitle','#pnBody'].map(id=>[id,{value:'',checked:false,disabled:false}]));
  const recipients=[1,3,7].map(value=>({value:String(value),checked:false,disabled:false}));
  const wrap={setAttribute(){},addEventListener(){},querySelector:s=>controls[s],querySelectorAll:()=>recipients};
  const calls=[];let finish;
  const ctx=vm.createContext({ADMIN:true,D:{teams:[{id:1,name:'One'}]},esc:s=>s,closeMatchup(){},document:{createElement:()=>wrap,body:{appendChild(){},classList:{add(){}}},addEventListener(){}},mdlKey(){},INBOX:{refresh(){}},sb:{from:table=>({insert:payload=>{calls.push({table,payload});return new Promise(resolve=>finish=resolve);}})}});
  vm.runInContext(html.slice(html.indexOf('function adminPush(){'),html.indexOf('function adminGradeParlay')),ctx);ctx.adminPush();
  controls['#pnTitle'].value='League update';controls['#pnBody'].value='Message';
  return {controls,recipients,calls,send:()=>controls['#pnSend'].onclick(),finish:result=>finish(result)};
}
test('notification composer rejects an empty audience and submits multiple teams without broadcasting',async()=>{
  const h=composer();await h.send();assert.equal(h.calls.length,0);assert.match(h.controls['#pnMsg'].textContent,/Choose at least one/);
  h.recipients[0].checked=h.recipients[2].checked=true;
  const pending=h.send();assert.equal(h.controls['#pnSend'].disabled,true);
  await h.send();assert.equal(h.calls.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),{table:'push_queue',payload:{title:'League update',body:'Message',team_ids:[1,7]}});
  h.finish({error:null});await pending;assert.equal(h.controls['#pnSend'].disabled,false);assert.equal(h.controls['#pnBody'].value,'');
});
test('league delivery requires an explicit checkbox and failed sends retain the draft',async()=>{
  const h=composer();h.controls['#pnEveryone'].checked=true;h.controls['#pnEveryone'].onchange();assert(h.recipients.every(n=>n.disabled));
  const pending=h.send();assert.equal(h.calls[0].payload.team_ids,null);h.finish({error:Error('Unavailable')});await pending;
  assert.equal(h.controls['#pnBody'].value,'Message');assert.equal(h.controls['#pnSend'].disabled,false);assert.match(h.controls['#pnMsg'].innerHTML,/Failed/);
});
test('background rendering preserves open dialogs even when the composer field has lost focus',()=>{
  let closed=0;
  const ctx=vm.createContext({ADMIN:true,VIEWS:{dash(){}},cur:'dash',trackSite(){},swipingBack:false,window:{},document:{getElementById:id=>id==='mdl'?{}:null},closeMatchup(){closed++;},VIEW_BACK:[]});
  vm.runInContext(html.slice(html.indexOf('function setTab('),html.indexOf('// Home button and MFL mark')),ctx);
  ctx.setTab('dash');assert.equal(closed,0);
});
