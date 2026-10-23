export const STARTER_SLOTS = [
  "QB",
  "RB",
  "RB",
  "WR",
  "WR",
  "TE",
  "FLEX",
  "DST",
  "K",
];
export const ESPN_SLOTS = {
  0: "QB",
  2: "RB",
  4: "WR",
  6: "TE",
  7: "OP",
  16: "DST",
  17: "K",
  20: "BE",
  21: "IR",
  23: "FLEX",
  3: "RB/WR",
  5: "WR/TE",
};
export function eligibleFor(player, slot) {
  if (Array.isArray(player.eligible) && player.eligible.length)
    return player.eligible.includes(slot);
  return (
    player.pos === slot ||
    (slot === "FLEX" && ["RB", "WR", "TE"].includes(player.pos)) ||
    (slot === "OP" && ["QB", "RB", "WR", "TE"].includes(player.pos)) ||
    (slot === "RB/WR" && ["RB", "WR"].includes(player.pos)) ||
    (slot === "WR/TE" && ["WR", "TE"].includes(player.pos))
  );
}
// Exact assignment: each rostered player can occupy one eligible starting slot.
export function optimalLineup(players, slots = STARTER_SLOTS) {
  const states = new Map([[0, { total: 0, picks: [] }]]);
  for (const player of players) {
    if (!Number.isFinite(player.value)) continue;
    for (const [mask, state] of [...states]) {
      slots.forEach((slot, i) => {
        if (mask & (1 << i) || !eligibleFor(player, slot)) return;
        const next = mask | (1 << i),
          total = state.total + player.value;
        if (!states.has(next) || total > states.get(next).total)
          states.set(next, {
            total,
            picks: [
              ...state.picks,
              { ...player, assignedSlot: slot, slotIndex: i },
            ],
          });
      });
    }
  }
  // Fill as many slots as possible before maximizing the score.
  const best = [...states.values()].sort(
    (a, b) => b.picks.length - a.picks.length || b.total - a.total,
  )[0];
  return {
    ...best,
    picks: best.picks.sort((a, b) => a.slotIndex - b.slotIndex),
    complete: best.picks.length === slots.length,
  };
}
// Freeze starters in their actual slots. Locked bench players cannot enter a lineup.
export function legalLineup(players, slots = STARTER_SLOTS) {
  const remaining = slots.map((slot, i) => ({ slot, i })),
    pinned = [];
  for (const p of players.filter(
    (p) => p.locked && !["BE", "IR"].includes(p.slot),
  )) {
    const ix = remaining.findIndex((s) => s.slot === p.slot);
    if (ix < 0)
      return {
        total: 0,
        picks: [],
        complete: false,
        invalid: true,
        missing: 0,
      };
    const [{ i, slot }] = remaining.splice(ix, 1);
    pinned.push({ ...p, assignedSlot: slot, slotIndex: i });
  }
  const pool = players.filter(
    (p) => !p.locked && !p.unavailable && p.slot !== "IR",
  );
  const result = optimalLineup(
    pool,
    remaining.map((s) => s.slot),
  );
  const picks = [
    ...pinned,
    ...result.picks.map((p) => ({ ...p, slotIndex: remaining[p.slotIndex].i })),
  ].sort((a, b) => a.slotIndex - b.slotIndex);
  const missing = picks.filter((p) => !Number.isFinite(p.value)).length;
  return {
    total: picks.reduce(
      (sum, p) => sum + (Number.isFinite(p.value) ? p.value : 0),
      0,
    ),
    picks,
    complete: picks.length === slots.length && !missing,
    missing,
    invalid: false,
  };
}
export function kickoffTime(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function coverage(players, slots = STARTER_SLOTS) {
  const result = optimalLineup(
    players
      .filter((p) => p.slot !== "IR" && !p.unavailable)
      .map((p) => ({ ...p, value: 1 })),
    slots,
  );
  return slots.filter((_, i) => !result.picks.some((p) => p.slotIndex === i));
}
export function csvText(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let text = String(value ?? "");
          if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
          return '"' + text.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}
export function estimatedCeiling(projection, points) {
  if (!Number.isFinite(projection) || points.length < 3) return null;
  const mean = points.reduce((s, n) => s + n, 0) / points.length;
  const sd = Math.sqrt(
    points.reduce((s, n) => s + (n - mean) ** 2, 0) / points.length,
  );
  return projection + 1.28 * sd;
}
export function eliminationNumber(team, cut, remaining) {
  // Additional cutoff wins + chasing-team losses to put the cutoff strictly out of reach.
  // Ties count as half a win; PF can still decide equal records.
  const gap =
    remaining + team.w + (team.tie || 0) / 2 - cut.w - (cut.tie || 0) / 2;
  return Math.max(0, Math.floor(gap) + 1);
}
