// All performance metrics use completed league weeks; missing data stays missing.
export function extraPersonalMetrics({data,stats,teamId,lineupSplit}) {
  const s=stats.S[teamId];if(!s)return [];
  const rows=[],fixed=n=>Number.isFinite(n)?n.toFixed(1):'—';
  const avg=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:null;
  const scores=(s.scores||[]).filter(Number.isFinite),all=Object.values(stats.S);
  if(scores.length){
    const sorted=[...scores].sort((a,b)=>a-b),m=Math.floor(sorted.length/2);
    rows.push(['Median weekly score',fixed(sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2)],['Point differential',fixed(s.pf-s.pa)],['Scoring rank',1+all.filter(t=>t.ppg>s.ppg).length],['Point differential rank',1+all.filter(t=>t.pf-t.pa>s.pf-s.pa).length]);
    const total=all.reduce((n,t)=>n+(t.pf||0),0);
    rows.push(['Share of league points',total?fixed(s.pf/total*100)+'%':'—'],['100+ point weeks',scores.filter(x=>x>=100).length],['150+ point weeks',scores.filter(x=>x>=150).length]);
    const recent=[...stats.weeks].sort((a,b)=>a-b).map(w=>s.weekly?.[w]).filter(Number.isFinite).slice(-3);
    if(recent.length)rows.push(['Last 3 completed weeks PPG',fixed(avg(recent))],['Recent scoring vs season PPG',fixed(avg(recent)-s.ppg)]);
    const results=s.results||[],wins=results.filter(r=>r.r==='W'),losses=results.filter(r=>r.r==='L');
    rows.push(['Average score in wins',fixed(avg(wins.map(r=>r.pf)))],['Average score in losses',fixed(avg(losses.map(r=>r.pf)))],['Closest win',wins.length?fixed(Math.min(...wins.map(r=>r.pf-r.pa))):'—'],['Closest loss',losses.length?fixed(Math.min(...losses.map(r=>r.pa-r.pf))):'—']);
    let high=0,low=0,topHalf=0,count=0;
    for(const w of stats.weeks){const own=s.weekly?.[w];if(!Number.isFinite(own))continue;const field=all.map(t=>t.weekly?.[w]).filter(Number.isFinite).sort((a,b)=>a-b);if(field.length<2)continue;count++;if(own===field.at(-1))high++;if(own===field[0])low++;const mid=Math.floor(field.length/2),median=field.length%2?field[mid]:(field[mid-1]+field[mid])/2;if(own>=median)topHalf++;}
    if(count)rows.push(['Weekly high scores (ties included)',high],['Weekly low scores (ties included)',low],['At or above weekly league median',`${topHalf} / ${count}`]);
  }
  if(lineupSplit){let actual=0,optimal=0,left=0,covered=0,projWeeks=0,projDelta=0,beats=0;
    for(const week of stats.weeks){const roster=data.weekly?.[week]?.[teamId];if(!roster?.length||roster.some(r=>!Number.isFinite(r[2])))continue;
      const split=lineupSplit(roster);actual+=split.act;optimal+=split.opt;left+=split.left;covered++;
      const starters=roster.filter(r=>r[1]!==20&&r[1]!==21);
      if(starters.length&&starters.every(r=>Number.isFinite(r[3]))){const projection=starters.reduce((n,r)=>n+r[3],0);projDelta+=split.act-projection;projWeeks++;if(split.act>=projection)beats++;}
    }
    if(covered)rows.push(['Recorded lineup weeks',covered],['Recorded lineup efficiency',optimal>0?fixed(actual/optimal*100)+'%':'—'],['Points left on bench (optimal lineup)',fixed(left)],['Average missed lineup points',fixed(left/covered)]);
    if(projWeeks)rows.push(['Weeks meeting starter projections',`${beats} / ${projWeeks}`],['Average starter points vs projection',fixed(projDelta/projWeeks)]);
  }
  const budget=data.faab?.teams?.find(t=>t.teamId===teamId);
  if(budget){if(Number.isFinite(budget.spent))rows.push(['FAAB spent','$'+budget.spent]);if(Number.isFinite(budget.remaining))rows.push(['FAAB remaining','$'+budget.remaining]);if(Number.isFinite(budget.adds))rows.push(['Waiver / free-agent adds',budget.adds]);}
  return rows;
}
