// League IDs are ESPN IDs; no cross-provider ID mapping is needed for portraits.
export function playerPortrait(id, name, position, pro, esc, {size=56,eager=false}={}) {
  const initials=String(name||pro||'?').trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
  const key=['QB','RB','WR','TE','K','DST'].includes(position)?position.toLowerCase():'other';
  const source=Number.isInteger(Number(id))&&Number(id)>0&&position!=='DST'
    ? `https://a.espncdn.com/i/headshots/nfl/players/full/${Number(id)}.png` : null;
  const px=Math.round(size*2);
  const src=source?`/.netlify/images?url=${encodeURIComponent(source)}&w=${px}&h=${px}&fit=cover&position=top&q=80`:null;
  return `<span class="player-portrait player-pos-${key}" aria-hidden="true"><span class="portrait-fallback">${esc(position==='DST'?(pro||'DST'):initials)}</span>${src?`<img src="${esc(src)}" alt="" width="${size}" height="${size}" loading="${eager?'eager':'lazy'}" decoding="async" referrerpolicy="no-referrer">`:''}</span>`;
}
// Keep initials visible when a headshot is unavailable, including offline visits.
if(typeof document!=='undefined')document.addEventListener('error',event=>{
  const img=event.target;
  if(img instanceof HTMLImageElement&&img.closest('.player-portrait'))img.hidden=true;
},true);

export function shortPlayerName(name) {
  const parts=String(name||'').trim().split(/\s+/);
  return parts.length>1?`${parts[0][0]}. ${parts.slice(1).join(' ')}`:parts[0];
}
export function playerStatLine(pos,stats) {
  if(!stats)return '';
  const n=key=>Number.isFinite(stats[key])?stats[key]:null;
  const out=[];
  const add=(key,label)=>{if(n(key)!==null)out.push(`${n(key)} ${label}`);};
  if(pos==='QB') {
    if(n(1)!==null&&n(0)!==null)out.push(`${n(1)}/${n(0)} CMP`);
    add(3,'PASS YD');add(4,'TD');add(20,'INT');add(23,'CAR');add(24,'RUSH YD');
  }else if(['RB','WR','TE'].includes(pos)) {
    add(23,'CAR');add(24,'RUSH YD');add(25,'RUSH TD');
    if(n(41)!==null&&n(58)!==null)out.push(`${n(41)}/${n(58)} REC`);else add(41,'REC');
    add(42,'REC YD');add(43,'REC TD');
  }else if(pos==='K'){add(83,'FG');add(86,'XP');}
  else if(pos==='DST'){add(99,'SACK');add(95,'INT');add(96,'FR');add(120,'PA');}
  return out.join(', ');
}
