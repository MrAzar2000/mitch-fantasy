type Json = Record<string, any>;
export type RosterAlert = {key:string; title:string; body:string; url:string; tag:string; teamIds:number[]};
export function rosterAlerts(league:Json, feed:Json, now=Date.now()):RosterAlert[]{
  const meta=league?.meta, week=Number(meta?.currentScoringPeriod);
  const updated=Date.parse(meta?.lastUpdated);
  if(!Number.isFinite(updated)||now-updated>15*60000||updated>now+60000||!Number.isInteger(week)||!Array.isArray(feed?.players)||feed.week!==week||feed.season!==Number(meta.season))return [];
  const players=new Map<number,Json>(feed.players.map((p:Json)=>[p.id,p]));
  const alerts:RosterAlert[]=[];
  for(const team of league.teams||[]){
    const roster=league.rosters?.[team.id]||[];
    const starters=roster.filter((p:Json)=>!['BE','IR'].includes(p.slot));
    const first=starters.map((p:Json)=>Number(players.get(p.playerId)?.kickoff)).filter((t:number)=>t>now).sort((a:number,b:number)=>a-b)[0];
    const scope=`${meta.leagueId}-${meta.season}-${week}-${team.id}`;
    for(const p of starters){
      const current=players.get(p.playerId);if(!current)continue;
      const status=String(current.injury||'').toUpperCase();
      const kick=Number(current.kickoff);
      const bye=current.bye===week;
      const deadline=bye?first:kick;
      if(!deadline||deadline<=now||deadline-now>24*3600000)continue;
      if(!bye&&!['OUT','O','IR','INJURED_RESERVE','SUSPENDED','SUSPENSION','DOUBTFUL','D'].includes(status))continue;
      alerts.push({key:`injury-${scope}-${p.playerId}`,title:'Check your starting lineup',body:`${current.name||p.name} is ${bye?'on bye':status.toLowerCase().replaceAll('_',' ')}. Review an eligible replacement before kickoff.`,url:`/#myteam?team=${team.id}`,tag:`lineup-injury-${scope}-${p.playerId}`,teamIds:[team.id]});
    }
    if(first&&first-now<=60*60000){
      const empty=feed.settingsVerified&&Array.isArray(feed.slots)?Math.max(0,feed.slots.length-starters.length):0;
      alerts.push({key:`deadline-${scope}`,title:'Your lineup deadline is approaching',body:`Your next starting-player kickoff is within an hour.${empty?` You have ${empty} empty starting slot${empty===1?'':'s'}.`:''} Review your roster in ESPN.`,url:`/#myteam?team=${team.id}`,tag:`lineup-kickoff-${scope}`,teamIds:[team.id]});
    }
  }
  return alerts;
}
