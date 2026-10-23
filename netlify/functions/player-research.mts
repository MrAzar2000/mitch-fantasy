import { normalizeResearch } from "../lib/player-research.mjs";
export default async (req: Request) => {
  if (req.method !== "GET")
    return new Response("Method not allowed", { status: 405 });
  const q = new URL(req.url).searchParams,
    season = Number(q.get("season")),
    week = Number(q.get("week")),
    league = q.get("league") || "";
  if (
    !Number.isInteger(season) ||
    season < 2020 ||
    season > 2100 ||
    !Number.isInteger(week) ||
    week < 1 ||
    week > 22 ||
    !/^\d{1,12}$/.test(league)
  )
    return Response.json({ error: "Invalid request" }, { status: 400 });
  try {
    const root = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}`;
    const filter = {
      players: {
        limit: 2000,
        sortPercOwned: { sortAsc: false, sortPriority: 1 },
        filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
        filterStatsForScoringPeriodIds: {
          value: Array.from({ length: week }, (_, i) => i + 1),
        },
      },
    };
    const get = async (url: string, headers?: Record<string, string>) => {
      const r = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(18000),
      });
      if (!r.ok) throw new Error();
      return r.json();
    };
    const [data, schedule] = await Promise.all([
      get(
        `${root}/segments/0/leagues/${league}?view=kona_player_info&view=mSettings&scoringPeriodId=${week}`,
        { "X-Fantasy-Filter": JSON.stringify(filter) },
      ),
      get(`${root}?view=proTeamSchedules_wl`),
    ]);
    return Response.json(normalizeResearch(data, schedule, season, week), {
      headers: { "Cache-Control": "public, max-age=120, s-maxage=300" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Player research is unavailable. Current league rosters remain available; retry shortly.",
      },
      { status: 502 },
    );
  }
};
export const config = { path: "/api/player-research" };
