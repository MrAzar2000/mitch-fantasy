export function safeInboxUrl(value) {
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//'))return '/';
  try{const u=new URL(value,'https://inbox.invalid');return u.origin==='https://inbox.invalid'&&u.pathname==='/'?'/'+u.search+u.hash:'/';}catch{return '/';}
}
export function installTeamInbox(api) {
  const {views,el,esc,setTab}=api;
  let team=null,rows=[],unread=0,latest=0,next=null,error='',busy=false,reading=false,stamp=0,epoch=0,controller=null;
  const selected=()=>api.getTeam()?.id??null;
  function paintBadges(){
    const count=selected()===team?unread:0;
    document.querySelectorAll('[data-inbox-count]').forEach(n=>{n.hidden=!count;n.textContent=count>99?'99+':String(count);n.setAttribute('aria-label',`${count} unread notifications`);});
    const b=document.getElementById('meBtn');if(b&&api.getTeam()){b.setAttribute('aria-label',`${api.getTeam().name}, ${count} unread notifications. Open inbox.`);b.title='Open team inbox';}
  }
  function reset(){if(selected()===team)return;controller?.abort();epoch++;team=selected();rows=[];unread=latest=0;next=null;error='';busy=reading=false;stamp=0;paintBadges();}
  function cookie(){const id=api.getDevice();if(id)document.cookie=`mfl_preferences=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Strict${location.protocol==='https:'?'; Secure':''}`;}
  function apply(data,append=false){
    if(data.team!==team||!Array.isArray(data.rows))throw Error();
    rows=append?[...new Map([...rows,...data.rows].map(n=>[n.id,n])).values()]:data.rows;
    unread=data.unread;latest=data.latest;next=data.next;error='';stamp=Date.now();paintBadges();
  }
  function render(){if(api.getCurrent()==='inbox')setTab('inbox');}
  async function refresh(force=false,append=false){
    reset();if(team===null||reading||busy||(!force&&Date.now()-stamp<20000))return;
    cookie();const id=team,token=++epoch;controller=new AbortController();busy=true;
    try{const r=await fetch(`/api/team-inbox?team=${id}${append&&next?'&before='+next:''}`,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();const data=await r.json();if(token!==epoch||id!==selected())return;apply(data,append);}
    catch(e){if(token!==epoch||e.name==='AbortError')return;error='Your inbox is temporarily unavailable. Try again.';stamp=Date.now();}
    finally{if(token===epoch){busy=false;render();}}
  }
  async function mark(id,all=false){
    reset();if(team===null||reading)return false;
    controller?.abort();const token=++epoch,t=team;busy=false;reading=true;cookie();
    try{const r=await fetch(`/api/team-inbox?team=${t}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:all?'read_all':'read',id})});if(!r.ok)throw Error();const data=await r.json();if(token!==epoch||t!==selected())return false;apply(data);return true;}
    catch{if(token===epoch){error='Could not mark notifications read. Try again.';api.showToast(error);}return false;}
    finally{if(token===epoch){reading=false;render();}}
  }
  views.inbox=()=>{
    reset();const t=api.getTeam();
    if(!t){const v=el('<div class="shead"><h2>Team inbox</h2></div><p>Choose your team to see its notifications.</p><button class="btn" data-inbox-pick>Choose team</button>');v.querySelector('button').onclick=api.pickTeam;return v;}
    void refresh();
    const v=el(`<div class="shead"><div><div class="eyebrow">${esc(t.name)}</div><h2>Inbox <span data-inbox-count class="inbox-badge" hidden></span></h2></div><button class="btn ghost" data-inbox-pick>Switch team</button></div><div class="inbox-toolbar"><p class="metricnote">${unread} unread · read status saved for this team on this device</p><button class="btn ghost" data-inbox-all ${!unread||reading?'disabled':''}>Mark all read</button></div>${error?`<p class="inbox-error" role="status">${error} <button class="btn ghost" data-inbox-retry>Retry</button></p>`:''}<div class="inbox-list" aria-busy="${busy}">${rows.map(n=>`<article class="inbox-message ${n.read?'':'unread'}"><div class="inbox-message-top"><h3>${esc(n.title)}</h3>${n.read?'<span class="inbox-read-status">Read</span>':`<button class="inbox-read-button" data-inbox-read="${n.id}" ${reading?'disabled':''}>Mark read</button>`}</div><time datetime="${esc(n.created_at)}">${esc(new Date(n.created_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}))}</time><p>${esc(n.body)}</p><a href="${esc(safeInboxUrl(n.url))}" data-inbox-open="${n.id}">Open related page <span aria-hidden="true">›</span></a></article>`).join('')||`<div class="card card-p inbox-empty" role="status">${busy?'Loading notifications…':error?'':'No notifications yet. New league and team alerts appear here, even if push notifications are turned off.'}</div>`}</div>${next?`<button class="btn ghost" data-inbox-more ${busy?'disabled':''}>Older notifications</button>`:''}`);
    v.querySelector('[data-inbox-pick]').onclick=api.pickTeam;
    v.querySelector('[data-inbox-all]').onclick=()=>{if(latest)void mark(latest,true);};
    v.querySelector('[data-inbox-retry]')?.addEventListener('click',()=>void refresh(true));
    v.querySelector('[data-inbox-more]')?.addEventListener('click',()=>void refresh(true,true));
    v.querySelectorAll('[data-inbox-read]').forEach(b=>b.onclick=()=>void mark(Number(b.dataset.inboxRead)));
    v.querySelectorAll('[data-inbox-open]').forEach(a=>a.onclick=async e=>{e.preventDefault();const href=safeInboxUrl(a.getAttribute('href'));if(await mark(Number(a.dataset.inboxOpen))){if(href===location.pathname+location.search+location.hash)setTab(href.split('#')[1]?.split('?')[0]||'dash');else location.assign(href);}});
    paintBadges();queueMicrotask(paintBadges);return v;
  };
  setInterval(()=>{if(!document.hidden)void refresh(true);},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true);});
  navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='inbox-updated')setTimeout(()=>void refresh(true),2000);});
  window.addEventListener('online',()=>void refresh(true));
  return {refresh,paintBadges};
}
