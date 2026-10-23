import test from 'node:test';
import assert from 'node:assert/strict';
import {rosterAlerts} from '../netlify/lib/roster-alerts.mts';
const now=Date.parse('2026-10-25T16:30:00Z');
function fixture(){return {league:{meta:{leagueId:123,season:2026,currentScoringPeriod:8,lastUpdated:new Date(now).toISOString()},teams:[{id:1},{id:2}],rosters:{1:[{playerId:10,name:'Starter',slot:'WR'},{playerId:11,slot:'BE'}],2:[{playerId:12,slot:'QB'}]}},feed:{season:2026,week:8,settingsVerified:true,slots:['WR','QB'],players:[{id:10,name:'Starter',injury:'OUT',kickoff:now+1800000},{id:11,injury:'OUT',kickoff:now+1800000},{id:12,kickoff:now-60000}]}};}
test('targets unlocked starters and deduplicates each issue by league, season, week and team',()=>{
 const {league,feed}=fixture(),alerts=rosterAlerts(league,feed,now);
 assert.equal(alerts.length,2);assert.deepEqual(alerts.map(a=>a.teamIds),[[1],[1]]);
 assert.match(alerts[0].body,/Starter is out/);assert.match(alerts[1].body,/1 empty starting slot/);
 assert.deepEqual(alerts.map(a=>a.key),rosterAlerts(league,feed,now+60000).map(a=>a.key));
 assert.ok(alerts.every(a=>a.url==='/#myteam?team=1'));
});
test('stale or mismatched source data never produces lineup advice',()=>{
 const {league,feed}=fixture();league.meta.lastUpdated=new Date(now-16*60000).toISOString();assert.deepEqual(rosterAlerts(league,feed,now),[]);
 league.meta.lastUpdated=new Date(now).toISOString();feed.week=9;assert.deepEqual(rosterAlerts(league,feed,now),[]);
});
test('unknown kickoffs, locked starters and distant deadlines do not trigger pushes',()=>{
 const {league,feed}=fixture();feed.players[0].kickoff=null;assert.deepEqual(rosterAlerts(league,feed,now),[]);
 feed.players[0].kickoff=now-1;assert.deepEqual(rosterAlerts(league,feed,now),[]);
 feed.players[0].kickoff=now+25*3600000;assert.deepEqual(rosterAlerts(league,feed,now),[]);
});
test('bye warnings use another unlocked starter deadline and unknown settings do not invent empty slots',()=>{
 const {league,feed}=fixture();league.rosters[1].push({playerId:13,slot:'RB'});feed.players.push({id:13,name:'Bye player',bye:8,kickoff:null});feed.settingsVerified=false;
 const alerts=rosterAlerts(league,feed,now);assert.equal(alerts.length,3);assert.match(alerts[1].body,/on bye/);assert.doesNotMatch(alerts[2].body,/empty/);
});

import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const scheduledSource=stripTypeScriptTypes(readFileSync(new URL('../netlify/functions/roster-alerts.mts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default async','const handler=async').replace('export const config','const config'));
function scheduler({prior=false,failure=false,capable=true}={}){
 const queries=[],pushes=[];let released=false;
 const league={meta:{leagueId:123,season:2026,currentScoringPeriod:8,lastUpdated:new Date().toISOString()}};
 const client={query:async(q)=>{queries.push(q);if(q.includes('pg_try'))return {rows:[{locked:true}]};if(q.startsWith('SELECT alert_key'))return {rows:prior?[{}]:[]};return {rows:[]};},release(){released=true;}};
 const ctx=vm.createContext({Date,URLSearchParams,JSON,Number,String,AbortSignal,Netlify:{env:{get:()=> 'configured'}},getDatabase:()=>({pool:{connect:async()=>client}}),rosterAlerts:()=>[{key:'one-alert',teamIds:[1],title:'Lineup alert'}],fetch:async(url,options)=>{
 if(!options?.body)return {ok:true,json:async()=>String(url).includes('player-research')?{}:{rosterAlerts:capable}};
 if(JSON.parse(options.body).action==='lineup-source')return {ok:true,json:async()=>league};
 pushes.push(JSON.parse(options.body));return {ok:!failure,json:async()=>({sent:1,failed:0})};
 }});vm.runInContext(scheduledSource,ctx);
 return {run:()=>vm.runInContext('handler()',ctx),queries,pushes,released:()=>released};
}
test('scheduled delivery skips recorded alerts and commits only successful sends',async()=>{
 const existing=scheduler({prior:true});await existing.run();assert.equal(existing.pushes.length,0);assert.ok(existing.queries.includes('ROLLBACK'));
 const good=scheduler();await good.run();assert.equal(good.pushes.length,1);assert.ok(good.queries.some(q=>q.startsWith('INSERT INTO roster_alert_deliveries')));assert.ok(good.queries.includes('COMMIT'));assert.ok(good.released());
 const bad=scheduler({failure:true});await assert.rejects(bad.run(),/delivery failed/);assert.ok(!bad.queries.some(q=>q.startsWith('INSERT INTO roster_alert_deliveries')));assert.equal(bad.queries.at(-1),'ROLLBACK');assert.ok(bad.released());
});
test('scheduler refuses a sender without targeted roster-alert support',async()=>{
 const h=scheduler({capable:false});await assert.rejects(h.run(),/capable/);assert.equal(h.pushes.length,0);assert.equal(h.queries.length,0);
});
