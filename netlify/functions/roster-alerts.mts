import type {} from '@netlify/functions';
import {getDatabase} from '@netlify/database';
import {rosterAlerts} from '../lib/roster-alerts.mjs';

export default async()=>{
  const sender=Netlify.env.get('TRADE_DIGEST_NOTIFY_URL'),secret=Netlify.env.get('NOTIFY_SECRET');
  if(!sender||!secret)throw new Error('Roster alert sender is not configured');
  const capability=await fetch(sender,{signal:AbortSignal.timeout(5000)});
  if(!capability.ok||(await capability.json()).rosterAlerts!==true)throw new Error('Deploy the roster-alert-capable push sender before enabling delivery');
  const source=await fetch(sender,{method:'POST',headers:{'Content-Type':'application/json','x-notify-secret':secret},body:JSON.stringify({action:'lineup-source'}),signal:AbortSignal.timeout(10000)});
  if(!source.ok)throw new Error('League source unavailable');
  const league=await source.json(),m=league.meta;
  if(!m||!/^\d{1,12}$/.test(String(m.leagueId))||!Number.isInteger(Number(m.season))||!Number.isInteger(Number(m.currentScoringPeriod)))throw new Error('Invalid league source');
  if(Date.now()-Date.parse(m.lastUpdated)>15*60000)return;
  const query=new URLSearchParams({league:String(m.leagueId),season:String(m.season),week:String(m.currentScoringPeriod)});
  const feedResponse=await fetch(`https://mitch-fantasy.netlify.app/api/player-research?${query}`,{signal:AbortSignal.timeout(25000)});
  if(!feedResponse.ok)throw new Error('Current player data unavailable');
  const feed=await feedResponse.json(),alerts=rosterAlerts(league,feed);
  const client=await getDatabase().pool.connect();
  try{
    for(const alert of alerts){
      await client.query('BEGIN');
      const lock=await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',[alert.key]);
      if(!lock.rows[0].locked){await client.query('ROLLBACK');continue;}
      const prior=await client.query('SELECT alert_key FROM roster_alert_deliveries WHERE alert_key=$1',[alert.key]);
      if(prior.rows.length){await client.query('ROLLBACK');continue;}
      const response=await fetch(sender,{method:'POST',headers:{'Content-Type':'application/json','x-notify-secret':secret},body:JSON.stringify(alert),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Roster alert delivery failed');
      const result=await response.json();
      if(typeof result.sent!=='number'||result.failed>0)throw new Error('Roster alert delivery incomplete');
      // Suppressed/absent subscribers are still a completed attempt; do not repeat after quiet hours.
      await client.query('INSERT INTO roster_alert_deliveries (alert_key) VALUES ($1)',[alert.key]);
      await client.query('INSERT INTO site_activity (event_id,category,action,detail) VALUES ($1,$2,$3,$4) ON CONFLICT (event_id) DO NOTHING',[alert.key,'notification','roster_alert',JSON.stringify({title:alert.title,teams:alert.teamIds,sent:result.sent,suppressed:result.suppressed||0,failed:result.failed||0})]);
      await client.query('COMMIT');
    }
    await client.query("DELETE FROM roster_alert_deliveries WHERE sent_at < now() - interval '180 days'");
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
};
export const config={schedule:'*/15 * * * *'};
