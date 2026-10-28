export function remainingTimeout(expiresAt, now = Date.now()) {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000)) || 0;
}
export function countdownText(seconds) {
  const days=Math.floor(seconds/86400), hours=Math.floor(seconds%86400/3600), minutes=Math.floor(seconds%3600/60), secs=seconds%60;
  return `${days?days+'d ':''}${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}
export function installManagerTimeouts(api) {
  let selected=null, expiresAt=null, offset=0, busy=false, epoch=0, lastCheck=0, popup=null, previousFocus=null;
  function clearPopup(){if(popup){popup.close();popup.remove();popup=null;if(previousFocus?.isConnected)previousFocus.focus();previousFocus=null;}}
  function paint(){
    const team=api.getTeam(), seconds=remainingTimeout(expiresAt,Date.now()+offset);
    if(team?.id!==selected||!seconds||api.isAdmin()){clearPopup();return;}
    if(!popup){
      previousFocus=document.activeElement;
      popup=document.createElement('dialog');popup.className='manager-timeout-dialog';
      popup.setAttribute('aria-labelledby','timeoutTitle');popup.setAttribute('aria-describedby','timeoutDescription');
      popup.innerHTML=`<div class="eyebrow">Manager timeout</div><h2 id="timeoutTitle">${api.esc(team.name)}</h2><p id="timeoutDescription">The admin has put your team in timeout. This popup closes automatically when the countdown ends.</p><div class="timeout-countdown" role="timer" aria-label="Time remaining"></div><p class="metricnote">Time remaining · hours : minutes : seconds</p>`;
      popup.addEventListener('cancel',e=>e.preventDefault());document.body.append(popup);popup.showModal();
    }
    popup.querySelector('[role="timer"]').textContent=countdownText(seconds);
  }
  async function refresh(force=false){
    const team=api.getTeam()?.id??null;
    if(team!==selected){selected=team;expiresAt=null;offset=0;epoch++;busy=false;lastCheck=0;clearPopup();}
    if(team===null||busy||(!force&&Date.now()-lastCheck<15000))return;
    const token=++epoch;busy=true;lastCheck=Date.now();
    try{
      const r=await fetch(`/api/manager-timeouts?team=${team}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!r.ok)throw Error();const data=await r.json();
      if(token!==epoch||api.getTeam()?.id!==team||data.team!==team)return;
      offset=Date.parse(data.serverNow)-Date.now();if(!Number.isFinite(offset))offset=0;
      expiresAt=data.expiresAt;paint();
    }catch{/* Keep a known countdown running during a connection interruption. */}
    finally{if(token===epoch)busy=false;}
  }
  function openAdmin(){
    if(!api.isAdmin())return;
    const dialog=document.createElement('dialog');dialog.className='manager-timeout-dialog timeout-admin';
    dialog.setAttribute('aria-labelledby','timeoutAdminTitle');
    dialog.innerHTML=`<div class="timeout-admin-heading"><h2 id="timeoutAdminTitle">Manager timeouts</h2><button type="button" class="btn ghost" data-close aria-label="Close manager timeouts">Close</button></div><form><label>Manager<select name="team" required>${api.getTeams().map(t=>`<option value="${t.id}">${api.esc(t.owner||t.name)} · ${api.esc(t.name)}</option>`).join('')}</select></label><div class="timeout-duration"><label>Duration<input name="duration" type="number" min="1" max="31536000" step="1" value="5" required></label><label>Unit<select name="unit"><option value="1">Seconds</option><option value="60" selected>Minutes</option><option value="3600">Hours</option><option value="86400">Days</option></select></label></div><label>Verify admin password<input name="password" type="password" autocomplete="current-password" maxlength="1024" required></label><p class="metricnote">Set a custom duration up to 365 days, replace an existing timeout, or end it early.</p><p data-status role="status">Checking timeout…</p><div class="timeout-admin-actions"><button type="submit" class="btn">Start timeout</button><button type="button" class="btn ghost" data-end>End timeout</button></div></form>`;
    document.body.append(dialog);dialog.showModal();
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
    const form=dialog.querySelector('form'),status=dialog.querySelector('[data-status]'),select=form.elements.team;
    let loading=0,saving=false;
    async function load(){const n=++loading,id=select.value;status.textContent='Checking timeout…';try{const r=await fetch(`/api/manager-timeouts?team=${id}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const d=await r.json();if(n!==loading)return;status.textContent=d.expiresAt?`Active until ${new Date(d.expiresAt).toLocaleString()}`:'No active timeout.';}catch{if(n===loading)status.textContent='Could not check timeout. Try selecting the manager again.';}}
    select.onchange=load;void load();
    async function save(end){
      if(saving||!(end?form.elements.password.reportValidity():form.reportValidity()))return;
      const seconds=Number(form.elements.duration.value)*Number(form.elements.unit.value);
      if(!end&&(!Number.isInteger(seconds)||seconds<1||seconds>31536000)){status.textContent='Choose a duration between 1 second and 365 days.';return;}
      saving=true;loading++;const id=select.value;form.querySelectorAll('button,select,input').forEach(b=>b.disabled=true);status.textContent='Saving…';
      try{const r=await fetch(`/api/manager-timeouts?team=${id}`,{method:end?'DELETE':'PUT',headers:{'Content-Type':'application/json','X-Admin-Password':form.elements.password.value},...(end?{}:{body:JSON.stringify({seconds})}),signal:AbortSignal.timeout(10000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save timeout. Try again.');status.textContent=d.expiresAt?`Timeout started. Ends ${new Date(d.expiresAt).toLocaleString()}`:'Timeout ended.';form.elements.password.value='';void refresh(true);}
      catch(e){status.textContent=e.name==='TimeoutError'?'Request timed out. Check the manager’s current timeout before retrying.':e.message;}
      finally{saving=false;form.querySelectorAll('button,select,input').forEach(b=>b.disabled=false);}
    }
    form.onsubmit=e=>{e.preventDefault();void save(false);};form.querySelector('[data-end]').onclick=()=>void save(true);
  }
  setInterval(()=>{paint();if(!document.hidden)void refresh();},1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true);});
  window.addEventListener('online',()=>void refresh(true));void refresh(true);
  return {openAdmin,refresh};
}
