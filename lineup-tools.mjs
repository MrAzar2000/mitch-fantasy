export const STARTER_SLOTS = ['QB','RB','RB','WR','WR','TE','FLEX','DST','K'];
// Exact assignment: each rostered player can occupy one eligible starting slot.
export function optimalLineup(players, slots = STARTER_SLOTS) {
  const states = new Map([[0, { total: 0, picks: [] }]]);
  for (const player of players) {
    if (!Number.isFinite(player.value)) continue;
    for (const [mask, state] of [...states]) {
      slots.forEach((slot, i) => {
        if (mask & (1 << i) || !(player.eligible || [player.pos]).includes(slot) && !(slot === 'FLEX' && ['RB','WR','TE'].includes(player.pos))) return;
        const next = mask | (1 << i), total = state.total + player.value;
        if (!states.has(next) || total > states.get(next).total) states.set(next, { total, picks: [...state.picks, { ...player, assignedSlot: slot, slotIndex: i }] });
      });
    }
  }
  // Fill as many slots as possible before maximizing the score.
  const best = [...states.values()].sort((a,b) => b.picks.length-a.picks.length || b.total-a.total)[0];
  return { ...best, picks: best.picks.sort((a,b) => a.slotIndex-b.slotIndex), complete: best.picks.length === slots.length };
}
export function estimatedCeiling(projection, points) {
  if (!Number.isFinite(projection) || points.length < 3) return null;
  const mean = points.reduce((s,n)=>s+n,0)/points.length;
  const sd = Math.sqrt(points.reduce((s,n)=>s+(n-mean)**2,0)/points.length);
  return projection + 1.28 * sd;
}
export function eliminationNumber(team, cut, remaining) {
  // Additional cutoff wins + chasing-team losses to put the cutoff strictly out of reach.
  // Ties count as half a win; PF can still decide equal records.
  const gap = remaining + team.w + (team.tie || 0)/2 - cut.w - (cut.tie || 0)/2;
  return Math.max(0, Math.floor(gap) + 1);
}
