import { csvText } from './lineup-tools.mjs';

export function installArchiveTools(api) {
  const {views,esc,el}=api;
  const specs = {
    draft: {
      title:'Explore draft picks', headers:['Pick','Round','Player','Position','NFL team','Manager','Recorded games','Recorded points','Points / game'],
      rows(d) { return (d.draft||[]).map(p=>{const t=d.teams.find(t=>t.id===p.teamId),stats=api.playerSeason(p.playerId);return {team:String(p.teamId),position:p.pos,period:String(p.round),cells:[p.overall,p.round,p.name,p.pos,p.proTeam,t?.owner||t?.name||'',stats.gp||0,stats.tot??'',stats.gp?stats.avg.toFixed(1):'']};}); },
      period:'Round', note:'Production covers recorded roster weeks, including time on other fantasy teams. Availability and injuries affect production; these totals do not measure what a manager could have predicted on draft day.'
    },
    history: {
      title:'Explore past seasons', headers:['Season','Manager','Team','Finish','Wins','Losses','Ties','Points for','Points against'],
      rows(d) {const owners=new Map((d.history?.owners||[]).map(o=>[String(o.ownerId),o]));return (d.history?.seasons||[]).flatMap(s=>s.standings.map(r=>({team:String(r.ownerId),period:String(s.year),cells:[s.year,owners.get(String(r.ownerId))?.name||'',r.team,r.rank,r.w,r.l,r.t||0,r.pf,r.pa]})));},
      period:'Season', note:'Managers are matched by their historical owner ID so team-name changes stay together.'
    },
    records: {
      title:'Explore weekly results', headers:['Week','Team','Manager','Opponent','Points','Opponent points','Margin','Result'],
      rows(d) {return (d.schedule||[]).filter(m=>m.winner&&m.winner!=='UNDECIDED'&&m.week<=Number(d.meta.regularSeasonWeeks||14)).flatMap(m=>[true,false].map(home=>{const t=d.teams.find(t=>t.id===(home?m.homeTeamId:m.awayTeamId)),o=d.teams.find(t=>t.id===(home?m.awayTeamId:m.homeTeamId)),pf=home?m.homeScore:m.awayScore,pa=home?m.awayScore:m.homeScore;return {team:String(t?.id),period:String(m.week),cells:[m.week,t?.name,t?.owner,o?.name,pf,pa,pf-pa,pf===pa?'T':pf>pa?'W':'L']};}));},
      period:'Week', note:'Completed regular-season weeks only. Use the record cards below for season leaders.'
    }
  };
  for(const [page,spec] of Object.entries(specs)) {
    const original=views[page];
    views[page]=()=>{
      const root=original(), d=api.getData(), all=spec.rows(d);
      const params=new URLSearchParams(location.hash.split('?')[1]||'');
      const panel=el(`<section class="card card-p mx-archive"><div class="mx-heading"><h3>${spec.title}</h3><button type="button" class="btn ghost" data-export>Export results</button></div><form class="mx-actions"><label>Search<input name="search" type="search" placeholder="Player, team or manager" value="${esc(params.get('search')||'')}"></label><label>Manager<select name="manager"><option value="">All managers</option></select></label><label>${spec.period}<select name="period"><option value="">All ${spec.period.toLowerCase()}s</option></select></label>${page==='draft'?'<label>Position<select name="position"><option value="">All positions</option></select></label>':''}<button type="reset" class="btn ghost">Reset</button></form><p class="metricnote">${spec.note}</p><p data-count role="status"></p><div class="twrap"><table><thead><tr>${spec.headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody></tbody></table></div></section>`);
      const form=panel.querySelector('form');
      const managers=page==='history'?(d.history?.owners||[]).map(o=>[String(o.ownerId),o.name]):d.teams.map(t=>[String(t.id),t.owner||t.name]);
      const options=(name,pairs)=>{const select=form.elements[name];pairs.forEach(([id,label])=>{const option=document.createElement('option');option.value=id;option.textContent=label;select.append(option);});select.value=params.get(name)||'';};
      options('manager',managers);options('period',[...new Set(all.map(r=>r.period))].sort((a,b)=>Number(a)-Number(b)).map(p=>[p,p]));
      if(page==='draft')options('position',[...new Set(all.map(r=>r.position))].sort().map(p=>[p,p]));
      let filtered=[];
      function render(update=false){
        const f=new FormData(form), search=String(f.get('search')||'').trim().toLowerCase();
        filtered=all.filter(r=>(!f.get('manager')||r.team===f.get('manager'))&&(!f.get('period')||r.period===f.get('period'))&&(!f.get('position')||r.position===f.get('position'))&&(!search||r.cells.join(' ').toLowerCase().includes(search)));
        panel.querySelector('[data-count]').textContent=`${filtered.length} of ${all.length} results`;
        panel.querySelector('tbody').innerHTML=filtered.length?filtered.map(r=>`<tr>${r.cells.map(c=>`<td>${esc(c??'—')}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${spec.headers.length}">No results match. Reset the filters to browse everything.</td></tr>`;
        if(update){const q=new URLSearchParams();for(const [k,v] of f)if(v)q.set(k,v);history.replaceState(null,'',`#${page}${q.size?'?'+q:''}`);}
      }
      form.onsubmit=e=>e.preventDefault();form.oninput=()=>render(true);form.onchange=()=>render(true);form.onreset=()=>{setTimeout(()=>{for(const field of form.elements)if(field.name)field.value='';render(true);},0);};
      panel.querySelector('[data-export]').onclick=()=>{const url=URL.createObjectURL(new Blob([csvText([spec.headers,...filtered.map(r=>r.cells)])],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`mfl-${page}-filtered.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
      render(); const heading=root.querySelector('.shead');if(heading)heading.after(panel);else root.prepend(panel);
      return root;
    };
  }
}
