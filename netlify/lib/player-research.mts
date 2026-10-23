type Json = Record<string, any>;
export const positions: Json = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DST",
};
export const slotNames: Json = {
  0: "QB",
  2: "RB",
  3: "RB/WR",
  4: "WR",
  5: "WR/TE",
  6: "TE",
  7: "OP",
  16: "DST",
  17: "K",
  23: "FLEX",
};
export function normalizeResearch(
  data: Json,
  schedule: Json,
  season: number,
  week: number,
) {
  if (!Array.isArray(data.players)) throw new Error("Missing player pool");
  const proTeams: Json[] = schedule?.settings?.proTeams || [];
  const teams = new Map(proTeams.map((t) => [t.id, t]));
  const counts = data.settings?.rosterSettings?.lineupSlotCounts;
  const slots = counts
    ? Object.entries(counts).flatMap(([id, count]) =>
        slotNames[id]
          ? Array.from(
              { length: Math.min(8, Math.max(0, Number(count) || 0)) },
              () => slotNames[id],
            )
          : [],
      )
    : [];
  const unsupportedSlots = counts
    ? Object.keys(counts).filter(
        (id) =>
          !slotNames[id] &&
          !["20", "21"].includes(id) &&
          Number(counts[id]) > 0,
      )
    : [];
  const players = data.players.flatMap((entry: Json) => {
    const p = entry.player || entry;
    const pos = positions[p.defaultPositionId];
    if (!pos || !Number.isInteger(p.id)) return [];
    const stats = Array.isArray(p.stats) ? p.stats : [];
    const projected = stats.find(
      (s: Json) =>
        s.seasonId === season &&
        s.statSourceId === 1 &&
        s.statSplitTypeId === 1 &&
        s.scoringPeriodId === week,
    );
    // appliedTotal is calculated by ESPN for this league. Missing is not zero.
    const proj =
      typeof projected?.appliedTotal === "number" &&
      Number.isFinite(projected.appliedTotal)
        ? projected.appliedTotal
        : null;
    const history = stats
      .filter(
        (s: Json) =>
          s.seasonId === season &&
          s.statSourceId === 0 &&
          s.statSplitTypeId === 1 &&
          s.scoringPeriodId > 0 &&
          s.scoringPeriodId < week &&
          typeof s.appliedTotal === "number" &&
          Number.isFinite(s.appliedTotal) &&
          s.stats &&
          Object.keys(s.stats).length,
      )
      .sort((a: Json, b: Json) => a.scoringPeriodId - b.scoringPeriodId);
    const pro = teams.get(p.proTeamId);
    const games = pro?.proGamesByScoringPeriod?.[String(week)] || [];
    const kickoff = games.length ? Number(games[0].date) : null;
    const avg = history.length
      ? history.reduce((sum: number, s: Json) => sum + s.appliedTotal, 0) /
        history.length
      : null;
    const l3 = history.slice(-3);
    // Availability comes only from the league response, never global ownership percent.
    const availability =
      entry.onTeamId > 0
        ? "ROSTERED"
        : ["FREEAGENT", "WAIVERS"].includes(entry.status)
          ? entry.status
          : null;
    return [
      {
        id: p.id,
        name: p.fullName,
        pos,
        pro: pro?.abbrev || "",
        owner: entry.onTeamId > 0 ? entry.onTeamId : null,
        availability,
        injury: p.injuryStatus || "",
        droppable: typeof p.droppable === "boolean" ? p.droppable : null,
        eligible: (p.eligibleSlots || [])
          .map((id: number) => slotNames[id])
          .filter(Boolean),
        proj,
        avg,
        l3: l3.length
          ? l3.reduce((sum: number, s: Json) => sum + s.appliedTotal, 0) /
            l3.length
          : null,
        games: history.length,
        log: history.map((s: Json) => ({
          week: s.scoringPeriodId,
          pts: s.appliedTotal,
        })),
        owned: p.ownership?.percentOwned ?? null,
        kickoff:
          typeof kickoff === "number" && Number.isFinite(kickoff) && kickoff > 0
            ? kickoff
            : null,
        bye: pro?.byeWeek ?? null,
      },
    ];
  });
  return {
    players,
    slots,
    unsupportedSlots,
    settingsVerified: !!counts,
    rosterLimit: counts
      ? Object.entries(counts)
          .filter(([id]) => id !== "21")
          .reduce((sum, [, n]) => sum + (Number(n) || 0), 0)
      : null,
    updatedAt: new Date().toISOString(),
    season,
    week,
  };
}
