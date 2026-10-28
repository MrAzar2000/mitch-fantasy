import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {viewportMetrics} from '../mobile-viewport.mjs';

test('the keyboard state requires an editor and substantial viewport shrinkage',()=>{
  assert.equal(viewportMetrics({height:430,layoutHeight:844,editing:true}).keyboard,true);
  assert.equal(viewportMetrics({height:760,layoutHeight:844,editing:true}).keyboard,false);
  assert.equal(viewportMetrics({height:430,layoutHeight:844,editing:false}).keyboard,false);
  assert.deepEqual(viewportMetrics({height:430.4,offsetTop:-20,layoutHeight:844,editing:true}),{height:430,top:0,keyboard:true});
});

test('team navigation selects the requested roster before rendering and rejects missing teams',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('function goTeam('),html.indexOf('\ndocument.addEventListener',html.indexOf('function goTeam(')));
  const renders=[],routes=[];
  const ctx=vm.createContext({teamById:{1:{},2:{}},viewedTeamId:null,closeMatchup:()=>{},setTab:(page,fresh)=>renders.push({page,fresh,team:ctx.viewedTeamId}),history:{replaceState:(_,__,url)=>routes.push(url)},location:{hash:'#teams?team=2'},URLSearchParams});
  vm.runInContext(source,ctx);
  ctx.goTeam(1);ctx.goTeam(2);ctx.goTeam(999);
  assert.deepEqual(renders,[{page:'teams',fresh:true,team:1},{page:'teams',fresh:true,team:2}]);
  assert.deepEqual(routes,['#teams?team=1','#teams?team=2']);
  ctx.readTeamRoute();assert.equal(ctx.viewedTeamId,2);
  ctx.location.hash='#teams';ctx.readTeamRoute();assert.equal(ctx.viewedTeamId,null);
  ctx.location.hash='#teams?team=999';ctx.readTeamRoute();assert.equal(ctx.viewedTeamId,null);
});

test('mobile navigation and scroll restoration use the clipped content scroller while desktop uses the window',()=>{
  const source=readFileSync(new URL('../mobile-viewport.mjs',import.meta.url),'utf8').split('// Keep keyboard-sized')[0].replace(/^export /gm,'');
  let phone=true;const shell={scrollTop:240,scrollTo({top}){this.scrollTop=top;}};
  const win={scrollY:90,scrollTo({top}){this.scrollY=top;}};
  const ctx=vm.createContext({window:win,document:{body:{classList:{contains:()=>phone}},querySelector:()=>shell}});
  vm.runInContext(source,ctx);
  assert.equal(ctx.pageScrollY(),240);ctx.scrollPageTo({top:0});assert.equal(shell.scrollTop,0);assert.equal(win.scrollY,90);
  phone=false;assert.equal(ctx.pageScrollY(),90);ctx.scrollPageTo({top:30});assert.equal(win.scrollY,30);assert.equal(shell.scrollTop,0);
});
