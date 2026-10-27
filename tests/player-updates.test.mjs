import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {normalizeResearch} from '../netlify/lib/player-research.mts';
import {positionCharts} from '../player-charts.mjs';
import {playerStatLine,shortPlayerName} from '../player-presentation.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('season form excludes bye zeroes while retaining a played zero-point game',()=>{
  const ctx=vm.createContext({D:{meta:{currentScoringPeriod:5},players:{7:['Runner','RB','KC']},weekly:{1:{1:[[7,2,12,10]]},2:{1:[[7,2,0,0]]},3:{1:[[7,2,0,9]]},4:{1:[[7,2,18,12]]}}},ST:{weeks:[1,2,3,4]},byeWk:()=>2});
  const a=html.indexOf('function playerSeason('),b=html.indexOf('/* ---- TRADE BLOCK',a);
  vm.runInContext(html.slice(a,b),ctx);
  assert.equal(ctx.playerSeason(7).gp,3);
  assert.equal(ctx.playerSeason(7).tot,30);
  assert.equal(ctx.playerSeason(7).l3,10);
});
test('research preserves raw position stats and negative add/drop trends and skips bye records',()=>{
  const weekly=(w,n)=>({seasonId:2026,statSourceId:0,statSplitTypeId:1,scoringPeriodId:w,appliedTotal:n,stats:{24:n}});
  const data={players:[{player:{id:7,fullName:'Runner',defaultPositionId:2,proTeamId:1,ownership:{percentChange:-2.5},stats:[weekly(1,12),weekly(2,0),weekly(3,0)]}}]};
  const result=normalizeResearch(data,{settings:{proTeams:[{id:1,abbrev:'KC',byeWeek:2}]}},2026,4).players[0];
  assert.equal(result.trend,-2.5);assert.equal(result.games,2);assert.equal(result.avg,6);assert.equal(result.log[0].stats[24],12);
  delete data.players[0].player.ownership;
  assert.equal(normalizeResearch(data,{},2026,4).players[0].trend,null);
});
test('position charts use actual kicker and defense stat IDs, and do not invent missing stats',()=>{
  const k=positionCharts({pos:'K',log:[{week:1,stats:{83:3,80:1,86:2}}]},String);
  assert.match(k,/Week 1: 3 Field goals made/);
  const d=positionCharts({pos:'DST',log:[{week:1,stats:{99:4,95:2,96:1,100:8}}]},String);
  assert.match(d,/Week 1: 2 Interceptions/);assert.match(d,/Week 1: 1 Fumble recoveries/);
  assert.match(positionCharts({pos:'WR',log:[{week:1,pts:10}]},String),/unavailable/);
  assert(!positionCharts({pos:'QB',log:[{week:1,stats:{3:0}}]},String).includes('unavailable'));
});


test('live player stats stay separate from completed game averages and preserve start rates',()=>{
  const sample=(week,points,stats)=>({seasonId:2026,statSourceId:0,statSplitTypeId:1,scoringPeriodId:week,appliedTotal:points,stats});
  const p=normalizeResearch({players:[{player:{id:7,fullName:'Quarterback',defaultPositionId:1,ownership:{percentOwned:63,percentStarted:41},stats:[sample(1,20,{3:200}),sample(2,3,{3:40})]}}]}, {},2026,2).players[0];
  assert.equal(p.avg,20);assert.equal(p.started,41);assert.deepEqual(p.currentStats,{3:40});assert.equal(p.log.length,1);
});

test('compact matchup stats keep real zeroes and omit unavailable observations',()=>{
  assert.equal(playerStatLine('QB',{1:19,0:30,3:212,4:1,20:0}),'19/30 CMP, 212 PASS YD, 1 TD, 0 INT');
  assert.equal(playerStatLine('RB',{23:2,24:13}),'2 CAR, 13 RUSH YD');
  assert.equal(playerStatLine('WR',null),'');
  assert.equal(shortPlayerName('Aaron Jones Sr.'),'A. Jones Sr.');
});
