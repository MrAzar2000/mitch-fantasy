// ESPN stat IDs; preserve missing observations rather than inventing zeroes.
const positionStats = {
  QB: [['Passing yards','3'],['Passing TDs','4'],['Interceptions','20'],['Rushing yards','24']],
  RB: [['Rushing yards','24'],['Rushing TDs','25'],['Receptions','41'],['Receiving yards','42']],
  WR: [['Receiving yards','42'],['Receptions','41'],['Receiving TDs','43']],
  TE: [['Receiving yards','42'],['Receptions','41'],['Receiving TDs','43']],
  K: [['Field goals made','83'],['Extra points made','86']],
  DST: [['Sacks','99'],['Interceptions','95'],['Fumble recoveries','96']],
};
export function positionCharts(player, esc) {
  const log = player?.log || [];
  const charts = (positionStats[player?.pos] || []).map(([label,key]) => {
    const rows=log.filter(r=>Number.isFinite(r.stats?.[key]));
    if(!rows.length)return '';
    const lo=Math.min(0,...rows.map(r=>r.stats[key])),hi=Math.max(1,...rows.map(r=>r.stats[key]));
    const y=v=>110-(v-lo)/(hi-lo)*88,x=i=>35+(rows.length===1?140:i*280/(rows.length-1));
    return `<figure class="position-chart"><figcaption>${esc(label)}</figcaption><svg viewBox="0 0 340 140" role="img" aria-label="${esc(label)} by week"><text x="2" y="22">${hi}</text><text x="2" y="114">${lo}</text><line x1="30" y1="110" x2="325" y2="110" stroke="var(--line)"/><path d="${rows.map((r,i)=>`${i?'L':'M'}${x(i)} ${y(r.stats[key])}`).join(' ')}" fill="none" stroke="var(--t-blue)" stroke-width="2"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.stats[key])}" r="4" fill="var(--t-blue)"><title>Week ${r.week}: ${r.stats[key]} ${esc(label)}</title></circle><text x="${x(i)}" y="132" text-anchor="middle">W${r.week}</text>`).join('')}</svg><details><summary>Weekly values</summary><dl>${rows.map(r=>`<div><dt>Week ${r.week}</dt><dd>${r.stats[key]}</dd></div>`).join('')}</dl></details></figure>`;
  }).filter(Boolean);
  return charts.length?`<section class="position-charts"><h3>${esc(player.pos)} weekly stats</h3>${charts.join('')}</section>`:'<p class="metricnote">Position stats are unavailable for the recorded games.</p>';
}
