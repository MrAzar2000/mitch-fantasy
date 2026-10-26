import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('sorting standings retains official ranks and removes the playoff cut outside standings order',()=>{
  const rows=[{id:1,team:{name:'First'},pct:1,pf:100,pa:90,w:1,l:0,tie:0,luck:-1},{id:2,team:{name:'Second'},pct:0,pf:90,pa:100,w:0,l:1,tie:0,luck:2}];
  const ctx=vm.createContext({VIEWS:{},ST:{started:true,S:{1:rows[0],2:rows[1]}},D:{meta:{playoffTeamCount:1}},MEID:1,standOrder:()=>rows,shead:()=>'',teamLine:t=>t.name,streakPill:()=>'',fmt:n=>String(n??0),setTab:()=>{},el:markup=>({markup,querySelectorAll:()=>[]})});
  const start=html.indexOf('let standSort=');const end=html.indexOf('function streakNum',start);
  vm.runInContext(html.slice(start,end),ctx);
  const initial=vm.runInContext('VIEWS.standings().markup',ctx);
  assert.match(initial,/playoff-line/);
  const sorted=vm.runInContext('standSort={key:"luck",dir:-1};VIEWS.standings().markup',ctx);
  assert.doesNotMatch(sorted,/class="[^"]*playoff-line/);
  assert.match(sorted,/class="rankcol top">2<\/td>\s*<td>Second/);
  assert.match(sorted,/class="rankcol top">1<\/td>\s*<td>First/);
  assert.match(sorted,/aria-sort="descending"><button class="sort-control" data-k="luck"/);
});

test('probability history exposes guides, changes and compact matchup mode without inventing samples',()=>{
  const context=vm.createContext({D:{meta:{currentScoringPeriod:2},wpHistory:{7:[[1,0,0,60,40],[2,10,4,70,30],[3,20,10,55,45]]}},teamById:{1:{name:'Home'},2:{name:'Away'}},winProb:x=>({ph:x.homeProj/100}),esc:x=>x});
  const start=html.indexOf('function wpGraph('),end=html.indexOf('/* NFL context',start);
  vm.runInContext(html.slice(start,end),context);
  const full=vm.runInContext('wpGraph({id:7,week:2,homeTeamId:1,awayTeamId:2})',context);
  assert.match(full,/3 recorded updates/);assert.match(full,/>50%<\/text>/);assert.match(full,/-5 pp/);assert.match(full,/55–70%/);assert.doesNotMatch(full,/NaN/);
  const compact=vm.runInContext('wpGraph({id:7,week:2,homeTeamId:1,awayTeamId:2},true)',context);
  assert.match(compact,/wpg-compact/);assert.doesNotMatch(compact,/How to read/);
  const missing=vm.runInContext('wpGraph({id:8,week:2,homeTeamId:1,awayTeamId:2},true)',context);
  assert.match(missing,/after two recorded updates/);assert.doesNotMatch(missing,/<svg/);
});
