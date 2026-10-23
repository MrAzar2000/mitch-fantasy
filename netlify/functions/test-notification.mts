import type {} from '@netlify/functions';
import {getDatabase} from '@netlify/database';
export default async(req:Request)=>{
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Forbidden'},403);
  const device=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('mfl_preferences='))?.slice(16);
  if(!device||!/^[a-f0-9-]{36}$/i.test(device))return reply({error:'Enable notifications and save alert settings first.'},400);
  const sender=Netlify.env.get('TRADE_DIGEST_NOTIFY_URL'),secret=Netlify.env.get('NOTIFY_SECRET');
  if(!sender||!secret)return reply({error:'Remote notification testing is not available yet.'},503);
  try{
    const db=getDatabase();
    const rows=await db.sql`SELECT subscription_hash FROM manager_preferences WHERE device_id=${device}`;
    const hash=rows[0]?.subscription_hash;
    if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))return reply({error:'Enable notifications and save alert settings first.'},400);
    const capability=await fetch(sender,{signal:AbortSignal.timeout(5000)});
    if(!capability.ok||(await capability.json()).testNotifications!==true)return reply({error:'Remote notification testing needs the push sender update.'},503);
    const key=`test-${device}-${Math.floor(Date.now()/60000)}`;
    const inserted=await db.sql`INSERT INTO roster_alert_deliveries (alert_key) VALUES (${key}) ON CONFLICT DO NOTHING RETURNING alert_key`;
    if(!inserted.length)return reply({error:'Wait a minute before testing again.'},429);
    const response=await fetch(sender,{method:'POST',headers:{'Content-Type':'application/json','x-notify-secret':secret},body:JSON.stringify({title:'MFL push test',body:'Remote push delivery reached your device.',tag:'matchup-test',url:'/#dash',subscriptionHashes:[hash]}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error();
    const result=await response.json();
    if(result.failed>0)throw new Error();
    return reply({sent:result.sent||0,suppressed:result.suppressed||0});
  }catch{return reply({error:'Remote test failed. Try again shortly.'},503);}
};
export const config={path:'/api/test-notification'};
