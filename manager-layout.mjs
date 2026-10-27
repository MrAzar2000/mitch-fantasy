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
export function forgetView(page) { viewStates.delete(page); }
export function restoreView(page, root, scroll) {
  const state=viewStates.get(page);if(!state)return;
  root.querySelectorAll('details').forEach((d,i)=>{const saved=state.details.get(detailKey(d,i));if(saved!=null)d.open=saved;});
  for(const [key,value] of state.fields) {
    const n=[...root.querySelectorAll('[data-remember]')].find(n=>n.dataset.remember===key);
    if(n){n.value=value;n.dispatchEvent(new Event('input'));}
  }
  if(scroll)window.scrollTo({top:state.y,behavior:'instant'});
}
function foldNodes(nodes,title,open=true) {
  const list=nodes.filter(Boolean);if(!list.length)return null;
  const fold=document.createElement('details');fold.className='fold manager-fold';fold.open=open;
  const summary=document.createElement('summary');summary.textContent=title;fold.append(summary);
  list[0].before(fold);list.forEach(n=>fold.append(n));return fold;
}
function sectionFolds(view, firstOpen=true) {
  const headings=[...view.children].filter(n=>n.matches('.sub-h'));
  headings.forEach((heading,i)=>{
    const nodes=[];let n=heading.nextElementSibling;
    while(n&&!n.matches('.sub-h,.mx-page-tools')){nodes.push(n);n=n.nextElementSibling;}
    const fold=foldNodes([heading,...nodes],heading.textContent.trim(),firstOpen);
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
  view.querySelectorAll('details').forEach(fold=>{if(fold.matches('[data-lineup-mode]')||fold.querySelector('table,svg,.rank-history-list,[data-lineup-mode]'))fold.open=true;});
  const shortcuts={
    dash:[['parlay','Parlay'],['standings','Standings'],['scoreboard','Scoreboard'],['faab','Waivers'],['players','Players']],
    myteam:[['standings','Standings'],['players','Players'],['faab','Waivers'],['block','Trade block']],
    matchup:[['scoreboard','Scoreboard'],['myteam','My lineup'],['h2h','Head-to-head']],
    analytics:[['standings','Standings'],['power','Power rankings'],['odds','Playoff odds'],['outlook','Outlook']],
    players:[['myteam','My team'],['faab','Waivers'],['block','Trade block']],
    faab:[['players','Players'],['myteam','My team']],
    scoreboard:[['matchup','My matchup'],['standings','Standings']],
    block:[['teams','All teams'],['myteam','My team']],
    history:[['records','Record book'],['h2h','Head-to-head']],
    standings:[['scoreboard','Scoreboard'],['power','Power rankings'],['odds','Playoff odds']],
    power:[['standings','Standings'],['odds','Playoff odds'],['analytics','Stats']],
    odds:[['standings','Standings'],['power','Power rankings'],['matchup','My matchup']],
    teams:[['myteam','My team'],['players','Players'],['block','Trade block']],
    outlook:[['myteam','My team'],['faab','Waivers'],['analytics','Stats']],
    h2h:[['matchup','My matchup'],['history','History'],['records','Record book']],
    records:[['history','History'],['analytics','Stats'],['shame','Hall of Shame']],
    draft:[['myteam','My team'],['players','Players'],['history','History']],
    parlay:[['dash','Home'],['matchup','My matchup'],['rules','Rules']],
    useless:[['dash','Home'],['parlay','Parlay'],['shame','Hall of Shame']],
    rules:[['standings','Standings'],['faab','Waivers'],['parlay','Parlay']],
    shame:[['records','Record book'],['history','History'],['defense','Manager D']],
    defense:[['analytics','Stats'],['shame','Hall of Shame'],['standings','Standings']],
    feedback:[['dash','Home'],['more','More']],
    siteactivity:[['dash','Home'],['feedbackinbox','P&S Inbox']],
    feedbackinbox:[['more','More'],['siteactivity','Site Log']]
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
    // Season stats sit right under the team header, ahead of the trend chart.
    const detail=view.querySelector('#teamDetail');
    const kpis=view.querySelector(':scope > .g-kpi');
    const trend=detail?.querySelector('.team-season-trend');
    if(trend)(kpis||view.querySelector('.hero.hm'))?.after(trend);
    teamLayout(detail);
    // Every section starts collapsed so the page opens as a short list of headings.
    const collapse=(card,title)=>{
      if(!card||card.closest('details'))return;
      const heading=card.firstElementChild;if(heading?.matches('.sub-h'))heading.hidden=true;
      foldNodes([card],title,false);
    };
    collapse(trend,'Weekly scores');
    if(detail){
      const lineup=detail.querySelector(':scope > .mx-lineup');
      collapse(lineup,lineup?.querySelector('h3')?.textContent.trim()||'Lineup Lab');
      const roster=[...detail.children].find(n=>n.querySelector('.rrow'));
      collapse(roster,roster?.querySelector('.sub-h')?.textContent.replace(/\s+/g,' ').trim()||'Roster');
    }
    view.querySelectorAll(':scope > details, #teamDetail > details, #teamDetail > div > .manager-fold').forEach(d=>{d.open=false;});
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
  }

  if(['outlook','records','history','h2h','shame','defense'].includes(page))sectionFolds(view);
  if(page==='outlook'&&team>=0) {
    const label=document.createElement('label');label.className='manager-search';label.textContent='Outlook for';
    const select=document.createElement('select');select.innerHTML='<option value="mine">My team</option><option value="all">All league</option>';select.dataset.remember='outlook-scope';label.append(select);
    const upcoming=(data.rosters?.[team]||[]).filter(p=>{const bye=data.meta.byeWeeks?.[p.proTeam];return bye>=data.meta.currentScoringPeriod&&bye<=data.meta.currentScoringPeriod+2;});
    const status=document.createElement('p');status.className='metricnote';status.textContent=upcoming.length?'Upcoming byes: '+upcoming.map(p=>`${p.name} · W${data.meta.byeWeeks[p.proTeam]}`).join(', '):'No roster byes in the current week or next two weeks in the available schedule.';
    view.querySelector('.shead')?.after(label,status);
    const rows=[...view.querySelectorAll('tbody tr')];
    select.oninput=()=>rows.forEach(row=>{const target=row.querySelector(`[data-tid="${Number(team)}"]`);row.classList.toggle('me',!!target);row.hidden=select.value==='mine'&&!target;});select.oninput();
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

// Split the identity from the label so horizontal scrolling pins only the badge.
export function enhanceStatTables(root) {
  root.querySelectorAll('.twrap table').forEach(table=>{
    if(table.dataset.mobileReady)return;
    table.dataset.mobileReady='true';
    table.classList.add('manager-stat-table');
    const rows=[...table.rows];
    const bodyRows=rows.filter(row=>row.closest('tbody'));
    const first=bodyRows.find(row=>row.querySelector('.teamline .tb'));
    if(!first)return;
    const index=[...first.cells].findIndex(cell=>cell.querySelector('.teamline .tb'));
    // Matrix and grouped headers keep their column structure.
    if(rows.some(row=>[...row.cells].some(cell=>cell.colSpan>1||cell.rowSpan>1)))return;
    if(bodyRows.some(row=>!row.cells[index]?.querySelector('.teamline .tb')))return;
    rows.forEach(row=>{
      const cell=row.cells[index];if(!cell)return;
      const pinned=document.createElement(cell.tagName.toLowerCase());
      pinned.className='manager-team-badge';
      const badge=cell.querySelector('.teamline .tb');
      if(badge){
        const label=cell.querySelector('.nm')?.textContent||badge.title;
        badge.setAttribute('aria-label',label);pinned.append(badge);
      }else{pinned.textContent='Team';pinned.scope='col';}
      row.prepend(pinned);
      cell.classList.add('manager-team-name');
    });
  });
}
