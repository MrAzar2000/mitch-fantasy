type Json = Record<string, any>;
async function get(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(18000) });
  if (!r.ok) throw new Error('Provider unavailable');
  return r.json();
}
export default async (req: Request) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const q = new URL(req.url).searchParams;
  const season = Number(q.get('season')), week = Number(q.get('week')), league = q.get('league');
  const ids = (q.get('ids') || '').split(',').filter(x => /^\d+$/.test(x)).slice(0, 200).map(Number);
  if (!Number.isInteger(season) || season < 2020 || season > 2100 || !Number.isInteger(week) || week < 1 || week > 22 || !league || !/^\d+$/.test(league)) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const root = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}`;
  try {
    const [players, schedule, settings] = await Promise.all([
      get(`${root}/players?view=kona_player_info&filter=${encodeURIComponent(JSON.stringify({ players: { limit: 20000 } }))}`),
      get(`${root}?view=proTeamSchedules_wl`),
      get(`${root}/segments/0/leagues/${league}?view=mSettings`).catch(() => null),
    ]);
    const rules = settings?.settings?.scoringSettings?.scoringItems;
    const teams: Json[] = schedule?.settings?.proTeams || [];
    if (!Array.isArray(players) || !teams.length) throw new Error('Missing provider data');
    const ppr = Math.min(2, Math.max(0, Number(q.get('ppr')) || 0));
    // ESPN stat IDs. Fallback is explicitly labeled when league rules are private.
    const fallback = [{ statId: 3, points: .04 }, { statId: 4, points: 4 }, { statId: 20, points: -2 }, { statId: 24, points: .1 }, { statId: 25, points: 6 }, { statId: 42, points: .1 }, { statId: 43, points: 6 }, { statId: 53, points: ppr }, { statId: 72, points: -2 }];
    const scoring = Array.isArray(rules) && rules.length ? rules : fallback;
    const exact = scoring === rules;
    const score = (s: Json, pos: number) => scoring.reduce((n: number, rule: Json) => {
      const override = rule.pointsOverrides?.[String(pos)];
      return n + (Number(s[String(rule.statId)]) || 0) * (Number(override ?? rule.points) || 0);
    }, 0);
    const positions: Json = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST' };
    const games = new Map<string, { opp: number; week: number }>();
    const defense: Json = {};
    for (const t of teams) {
      if (!t.id || t.id === 0) continue;
      defense[t.abbrev] = {};
      for (const pos of Object.values(positions) as string[]) defense[t.abbrev][pos] = { total: 0, games: 0, avg: null, rank: null };
      for (const [w, gs] of Object.entries(t.proGamesByScoringPeriod || {}) as [string, Json[]][]) {
        if (+w >= week) continue;
        for (const g of gs) if (g.statsOfficial) {
          const opp = g.homeProTeamId === t.id ? g.awayProTeamId : g.homeProTeamId;
          games.set(`${t.id}:${w}`, { opp, week: +w });
          for (const pos of Object.values(positions) as string[]) defense[t.abbrev][pos].games++;
        }
      }
    }
    const byId = new Map(teams.map(t => [t.id, t.abbrev]));
    const totals: Json[] = [];
    for (const p of players) {
      const pos = positions[p.defaultPositionId];
      if (!pos || !Array.isArray(p.stats) || (!exact && ['K', 'DST'].includes(pos))) continue;
      let total = 0, gp = 0;
      for (const st of p.stats) {
        if (st.seasonId !== season || st.statSourceId !== 0 || st.statSplitTypeId !== 1 || st.scoringPeriodId >= week || !st.stats || !Object.keys(st.stats).length) continue;
        const game = games.get(`${st.proTeamId}:${st.scoringPeriodId}`);
        if (!game) continue;
        const points = score(st.stats, p.defaultPositionId); total += points; gp++;
        const opp = byId.get(game.opp);
        if (opp && defense[opp]?.[pos]) defense[opp][pos].total += points;
      }
      if (gp) totals.push({ id: p.id, total, pos, ownership: p.ownership || {} });
    }
    totals.sort((a, b) => b.total - a.total || a.id - b.id);
    const out: Json = {}, positionCounts: Json = {};
    totals.forEach((p, i) => {
      positionCounts[p.pos] = (positionCounts[p.pos] || 0) + 1;
      if (ids.includes(p.id)) out[p.id] = { rank: i + 1, positionRank: positionCounts[p.pos], points: p.total, owned: p.ownership.percentOwned ?? null, started: p.ownership.percentStarted ?? null };
    });
    for (const id of ids) if (!out[id]) {
      const p = players.find((p: Json) => p.id === id);
      if (p) out[id] = { rank: null, positionRank: null, owned: p.ownership?.percentOwned ?? null, started: p.ownership?.percentStarted ?? null };
    }
    for (const pos of Object.values(positions) as string[]) {
      const sorted = Object.keys(defense).filter(t => defense[t][pos].games).sort((a, b) => defense[a][pos].total / defense[a][pos].games - defense[b][pos].total / defense[b][pos].games);
      sorted.forEach((t, i) => { const v = defense[t][pos]; v.avg = v.total / v.games; v.rank = i + 1; });
    }
    const pid = ids.length === 1 ? ids[0] : null;
    let news: Json[] = [];
    if (pid) {
      const overview = await get(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${pid}/overview`).catch(() => null);
      news = (overview?.news || []).slice(0, 3).map((n: Json) => ({ headline: n.headline, date: n.lastModified || n.published, url: n.links?.web?.href })).filter((n: Json) => typeof n.url === 'string' && /^https:\/\/(www\.)?espn\.com\//.test(n.url));
    }
    return Response.json({ players: out, defense, news, throughWeek: week - 1, scoring: exact ? 'League scoring' : `Basic ${ppr} PPR scoring: yards, TDs, receptions, interceptions and lost fumbles. League settings unavailable; K/DST ranks excluded.`, exact, updatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=900' } });
  } catch {
    return Response.json({ error: 'NFL analysis is temporarily unavailable' }, { status: 502 });
  }
};
export const config = { path: '/api/nfl-insights' };
