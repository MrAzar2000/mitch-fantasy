// Presentation-only state lasts for this visit; league records remain in their existing stores.
const viewStates = new Map();
const detailKey = (node, index) => node.dataset.sectionKey || `${index}:${node.querySelector('summary')?.textContent.trim()}`;
export function rememberView(page, root) {
  if (!root?.querySelector('.view')) return;
  viewStates.set(page, {
    y: window.scrollY,
    details: new Map([...root.querySelectorAll('details')].map((d,i)=>[detailKey(d,i),d.open])),
    fields: [...root.querySelectorAll('[data-remember]')].map(n=>[n.dataset.remember,n.value]),
  });
}
export function restoreView(page, root, scroll) {
  const state=viewStates.get(page);if(!state)return;
  root.querySelectorAll('details').forEach((d,i)=>{const saved=state.details.get(detailKey(d,i));if(saved!=null)d.open=saved;});
  for(const [key,value] of state.fields) {
    const n=[...root.querySelectorAll('[data-remember]')].find(n=>n.dataset.remember===key);
    if(n){n.value=value;n.dispatchEvent(new Event('input'));}
  }
  if(scroll)window.scrollTo({top:state.y,behavior:'instant'});
}
function foldNodes(nodes,title,open=false) {
  const list=nodes.filter(Boolean);if(!list.length)return null;
  const fold=document.createElement('details');fold.className='fold manager-fold';fold.open=open;
  const summary=document.createElement('summary');summary.textContent=title;fold.append(summary);
  list[0].before(fold);list.forEach(n=>fold.append(n));return fold;
}
function sectionFolds(view, firstOpen=false) {
  const headings=[...view.children].filter(n=>n.matches('.sub-h'));
  headings.forEach((heading,i)=>{
    const nodes=[];let n=heading.nextElementSibling;
    while(n&&!n.matches('.sub-h,.mx-page-tools')){nodes.push(n);n=n.nextElementSibling;}
    const fold=foldNodes([heading,...nodes],heading.textContent.trim(),firstOpen&&i===0);
    if(fold)heading.hidden=true;
  });
}
export function teamLayout(container) {
  if(!container||container.dataset.organized)return;
  container.dataset.organized='true';
  const grid=[...container.children].find(n=>n.matches('.grid.g-2'));
  const roster=grid?.querySelector('.rrow')?.closest('.card');
  if(!roster)return;
  const lineup=container.querySelector('.mx-lineup')||container.querySelector('[data-lineup-mode]')?.closest('section');
  const alerts=[...container.children].filter(n=>n.matches('.alertbox,.lineup-alerts,.lalert'));
  const others=[...container.children].filter(n=>n!==grid&&n!==lineup&&!alerts.includes(n)&&!n.matches('.manager-fold'));
  foldNodes(others,'Season summary & history');
  if(lineup)container.prepend(lineup);
  container.insertBefore(roster,lineup?.nextSibling||container.firstChild);
  alerts.reverse().forEach(n=>container.prepend(n));
  // Keep schedule and any coverage content, but remove the desktop two-column shell.
  if(grid){grid.classList.remove('grid','g-2');foldNodes([...grid.children],'Schedule & roster coverage');}
}
function weekPicker(root,selector) {
  const seg=root.querySelector(selector);if(!seg)return;
  const buttons=[...seg.querySelectorAll('button')];if(!buttons.length)return;
  const active=Math.max(0,buttons.findIndex(b=>b.classList.contains('on')));
  const group=document.createElement('div');group.className='manager-week';
  const prev=document.createElement('button'),next=document.createElement('button'),select=document.createElement('select');
  prev.type=next.type='button';prev.className=next.className='btn ghost';
  prev.textContent='‹';next.textContent='›';prev.setAttribute('aria-label','Previous week');next.setAttribute('aria-label','Next week');
  prev.disabled=active===0;next.disabled=active===buttons.length-1;select.setAttribute('aria-label','Matchup week');
  buttons.forEach((b,i)=>{const o=new Option(`Week ${b.dataset.w}`,String(i),false,i===active);select.add(o);});
  select.onchange=()=>buttons[Number(select.value)].click();prev.onclick=()=>buttons[active-1]?.click();next.onclick=()=>buttons[active+1]?.click();
  group.append(prev,select,next);seg.replaceWith(group);
}
export function enhanceManagerLayout(root,{page,team,data,setTab,esc,feedbackPage}) {
  const view=root.querySelector('.view');if(!view||view.dataset.layoutReady)return;
  view.dataset.layoutReady='true';
  const shortcuts={
    dash:[['parlay','Parlay'],['standings','Standings'],['scoreboard','Scoreboard'],['faab','Waivers'],['players','Players']],
    myteam:[['players','Players'],['faab','Waivers'],['trade','Trade tools']],
    matchup:[['scoreboard','Scoreboard'],['myteam','My lineup'],['h2h','Head-to-head']],
    analytics:[['standings','Standings'],['power','Power rankings'],['odds','Playoff odds'],['outlook','Outlook']],
    players:[['myteam','My team'],['faab','Waivers'],['trade','Trade tools']],
    faab:[['players','Players'],['myteam','My team']],
    trade:[['block','Trade block'],['players','Players']],
    scoreboard:[['matchup','My matchup'],['standings','Standings']],
    block:[['trade','Trade analyzer'],['myteam','My team']],
    history:[['records','Record book'],['h2h','Head-to-head']],
    standings:[['scoreboard','Scoreboard'],['power','Power rankings'],['odds','Playoff odds']],
    power:[['standings','Standings'],['odds','Playoff odds'],['analytics','Stats']],
    odds:[['standings','Standings'],['power','Power rankings'],['matchup','My matchup']],
    teams:[['myteam','My team'],['players','Players'],['trade','Trade tools']],
    outlook:[['myteam','My team'],['faab','Waivers'],['analytics','Stats']],
    h2h:[['matchup','My matchup'],['history','History'],['records','Record book']],
    records:[['history','History'],['analytics','Stats'],['shame','Hall of Shame']],
    draft:[['myteam','My team'],['players','Players'],['history','History']],
    corrections:[['matchup','My matchup'],['scoreboard','Scoreboard'],['analytics','Stats']],
    parlay:[['dash','Home'],['matchup','My matchup'],['other','Games']],
    other:[['dash','Home'],['parlay','Parlay'],['shame','Hall of Shame']],
    shame:[['records','Record book'],['history','History'],['defense','Manager D']],
    defense:[['analytics','Stats'],['shame','Hall of Shame'],['standings','Standings']],
    more:[['dash','Home'],['parlay','Parlay'],['players','Players']],
    feedback:[['dash','Home'],['more','More']],
    siteactivity:[['dash','Home'],['feedback','Feedback']]
  };
  if(shortcuts[page]){
    const bar=document.createElement('nav');bar.className='manager-quick-actions';bar.setAttribute('aria-label','Quick actions');
    shortcuts[page].forEach(([id,label])=>{const b=document.createElement('button');b.type='button';b.className='btn ghost';b.textContent=label;b.onclick=()=>setTab(id);bar.append(b);});
    const hero=view.querySelector('.hero.hx');
    if(['dash','matchup'].includes(page)&&hero)view.prepend(hero);
    view.prepend(bar);
    if(page==='matchup'){
      const calculator=view.querySelector('[data-open]');
      if(calculator){const oldActions=calculator.parentElement;bar.append(calculator);oldActions.remove();}
    }

  }
  if(page==='dash'){
    // Remove the old duplicate shortcut strip; quick actions now stay near the score.
    view.querySelectorAll(':scope > .mx-actions').forEach(n=>n.remove());
  }

  if(page==='myteam') {
    view.querySelector('.g-kpi')?.remove();
    const detail=view.querySelector('#teamDetail');
    const trend=detail?.querySelector('.team-season-trend');
    if(trend)view.querySelector('.hero.hm')?.after(trend);
    teamLayout(detail);
  }
  if(page==='teams')teamLayout(view.querySelector('#teamDetail'));
  if(page==='dash') {
    const updates=view.querySelector('#updBanner');
    if(updates){const items=[...updates.querySelectorAll('.ub-i')];if(items.length>1)foldNodes(items.slice(1),'Older announcements');}
  }
  if(page==='matchup'||page==='scoreboard')weekPicker(view,page==='matchup'?'#mxseg':'#wkseg');
  if(page==='matchup') {
    const bench=view.querySelector('.lx-bench');if(bench)foldNodes([bench.previousElementSibling,bench],'Bench & IR');
  }
  if(page==='standings') {
    view.classList.add('manager-standings');
    const table=view.querySelector('table');
    if(table){
      [...table.rows].forEach(r=>[...r.cells].forEach((c,i)=>{if([4,5,7,8,9,10,11].includes(i))c.classList.add('manager-extra-col');}));
      const btn=document.createElement('button');btn.type='button';btn.className='btn ghost';btn.textContent='More statistics';btn.setAttribute('aria-expanded','false');
      btn.onclick=()=>{const expanded=view.classList.toggle('manager-expanded');btn.textContent=expanded?'Essential statistics':'More statistics';btn.setAttribute('aria-expanded',String(expanded));};table.closest('.twrap').before(btn);
    }
  }
  if(page==='trade') {
    const grid=view.querySelector('.trade-grid');
    grid?.querySelectorAll(':scope > .card').forEach((card,i)=>{
      const heading=card.querySelector('.sub-h');if(heading)heading.textContent=(i===0?'You give':'You receive')+' · '+(heading.textContent||'').replace(/ gives$/,'');
      const label=document.createElement('label');label.className='manager-search';label.textContent='Find a player';
      const input=document.createElement('input');input.type='search';input.className='txt';input.placeholder='Name or position';input.dataset.remember=`trade-search-${i}`;label.append(input);
      card.querySelector('select')?.after(label);
      input.oninput=()=>card.querySelectorAll('.tp').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(input.value.toLowerCase()));
    });
    const impact=[...view.children].find(n=>n.matches('.card')&&n.textContent.startsWith('Starting lineup change:'));
    if(impact&&grid)grid.before(impact);
    const table=view.querySelector(':scope > .twrap');
    if(table)foldNodes([table.previousElementSibling,table],'Detailed trade comparison');
    const impactHeading=[...view.children].find(n=>n.matches('.sub-h')&&n.textContent.startsWith('Starting Lineup Impact'));
    if(impactHeading&&grid){const cards=impactHeading.nextElementSibling;grid.before(impactHeading);if(cards)grid.before(cards);}
    // Searchable selectors remain available while the chosen package is summarized above them.
    if(grid){const selected=[...grid.querySelectorAll('input[type=checkbox]:checked')];if(selected.length){
      const summary=document.createElement('div');summary.className='card card-p manager-package';
      summary.innerHTML='<h3>Selected package</h3>'+[...grid.children].map(c=>`<p><b>${esc(c.querySelector('.sub-h')?.textContent||'')}</b><br>${[...c.querySelectorAll('.tp')].filter(r=>r.querySelector('input')?.checked).map(r=>esc(r.querySelector('.pn')?.textContent||'')).join(', ')||'No players selected'}</p>`).join('');grid.before(summary);
    }}
  }
  if(['outlook','analytics','records','history','h2h','shame','defense'].includes(page))sectionFolds(view,page==='analytics');
  if(page==='outlook'&&team>=0) {
    const label=document.createElement('label');label.className='manager-search';label.textContent='Outlook for';
    const select=document.createElement('select');select.innerHTML='<option value="mine">My team</option><option value="all">All league</option>';select.dataset.remember='outlook-scope';label.append(select);
    const upcoming=(data.rosters?.[team]||[]).filter(p=>{const bye=data.meta.byeWeeks?.[p.proTeam];return bye>=data.meta.currentScoringPeriod&&bye<=data.meta.currentScoringPeriod+2;});
    const status=document.createElement('p');status.className='metricnote';status.textContent=upcoming.length?'Upcoming byes: '+upcoming.map(p=>`${p.name} · W${data.meta.byeWeeks[p.proTeam]}`).join(', '):'No roster byes in the current week or next two weeks in the available schedule.';
    view.querySelector('.shead')?.after(label,status);
    const rows=[...view.querySelectorAll('tbody tr')];
    select.oninput=()=>rows.forEach(row=>{const target=row.querySelector(`[data-tid="${Number(team)}"]`);row.classList.toggle('me',!!target);row.hidden=select.value==='mine'&&!target;});select.oninput();
  }
  if(page==='analytics') {
    const folds=[...view.querySelectorAll(':scope > .manager-fold')];
    if(folds.length){const label=document.createElement('label');label.className='manager-search';label.textContent='Explore a metric';const select=document.createElement('select');select.dataset.remember='analytics-section';
    folds.forEach((f,i)=>select.add(new Option(f.querySelector('summary').textContent,String(i))));select.oninput=()=>folds.forEach((f,i)=>f.open=i===Number(select.value));label.append(select);view.querySelector('.shead')?.after(label);}
  }
  if(page==='corrections') {
    const rows=[...view.querySelectorAll('.corr-row')];
    if(rows.length){const control=document.createElement('label');control.className='manager-search';control.textContent='Show corrections';
      const select=document.createElement('select');select.innerHTML='<option value="mine">My team</option><option value="all">All league</option>';select.value=team>=0?'mine':'all';if(team<0)select.options[0].disabled=true;
      const status=document.createElement('p');status.className='metricnote';status.setAttribute('role','status');
      select.onchange=()=>{let count=0;rows.forEach(r=>{r.hidden=select.value==='mine'&&!r.querySelector(`[data-tid="${Number(team)}"]`);if(!r.hidden)count++;});status.textContent=count?`${count} corrections`:'No corrections for your team.';};control.append(select);view.querySelector('.shead')?.after(control,status);select.onchange();}
  }
  if(page==='feedback'){const input=view.querySelector('[name="page"]');if(input&&!input.value)input.value=feedbackPage;}
  view.querySelectorAll('[data-mid]:not(button):not(a)').forEach(n=>{n.tabIndex=0;n.setAttribute('role','button');n.setAttribute('aria-label','Open matchup details');n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();n.click();}};});
  view.querySelectorAll('a[data-goto]:not([href])').forEach(n=>{n.href='#'+n.dataset.goto;});

}
export function installDialogAccess() {
  const observer=new MutationObserver(()=>{
    const sheet=document.querySelector('#mdl .player-sheet');if(!sheet||sheet.dataset.organized)return;
    sheet.dataset.organized='true';
    const news=sheet.querySelector('#playerNews')?.closest('section');
    const context=[...sheet.querySelectorAll('section')].find(n=>n.querySelector('.player-context'));
    const top=sheet.querySelector('.mdl-top');if(context)top?.after(context);if(news)(context||top)?.after(news);
    const metrics=sheet.querySelector('#playerRanks');if(metrics)foldNodes([metrics,sheet.querySelector('#playerRankNote')],'NFL ranks & ownership');
    sheet.querySelectorAll('section.player-section').forEach(n=>{if(n!==news&&n!==context)foldNodes([n],n.querySelector('h3')?.textContent||'Player history');});
    const value=sheet.querySelector('.power-profile');if(value)foldNodes([value],'League trade value');
  });observer.observe(document.body,{childList:true,subtree:true});
  const connection=document.createElement('div');connection.className='manager-connection';connection.setAttribute('role','status');connection.hidden=navigator.onLine;connection.textContent='Connection lost. Displayed data may be out of date. Reconnect and refresh before making changes.';document.body.append(connection);
  window.addEventListener('offline',()=>connection.hidden=false);window.addEventListener('online',()=>connection.hidden=true);
}
