import { getDatabase } from "@netlify/database";

// Account-free team research, shared by everyone selecting the same team.
export default async (req: Request) => {
  const reply = (body: unknown, status = 200) => Response.json(body, {
    status, headers: { "Cache-Control": "no-store" },
  });
  const url = new URL(req.url);
  if (req.headers.get("origin") && req.headers.get("origin") !== url.origin)
    return reply({ error: "Forbidden" }, 403);
  if (!["GET", "POST", "DELETE"].includes(req.method))
    return reply({ error: "Method not allowed" }, 405);
  const league = url.searchParams.get("league") || "";
  const season = Number(url.searchParams.get("season"));
  const team = Number(url.searchParams.get("team"));
  if (!/^\d{1,12}$/.test(league) || !Number.isInteger(season) || season < 2020 || season > 2100 ||
      !Number.isInteger(team) || team < 1 || team > 100)
    return reply({ error: "Select a valid team" }, 400);
  try {
    const db = getDatabase();
    if (req.method !== "GET") {
      const raw = await req.text();
      if (raw.length > 200) return reply({ error: "Request too large" }, 413);
      const p = JSON.parse(raw);
      if (!Number.isInteger(p?.player) || p.player < 1 || p.player > 2147483647)
        return reply({ error: "Invalid player" }, 400);
      if (req.method === "POST") {
        await db.sql`INSERT INTO team_watchlist (league_id, season, team_id, player_id) VALUES (${league}, ${season}, ${team}, ${p.player}) ON CONFLICT DO NOTHING`;
      } else {
        await db.sql`DELETE FROM team_watchlist WHERE league_id=${league} AND season=${season} AND team_id=${team} AND player_id=${p.player}`;
      }
    }
    const rows = await db.sql`SELECT player_id FROM team_watchlist WHERE league_id=${league} AND season=${season} AND team_id=${team} ORDER BY created_at`;
    return reply({ watched_players: rows.map((r) => r.player_id) });
  } catch (e) {
    return reply({ error: e instanceof SyntaxError ? "Invalid request" : "Watchlist unavailable. Please retry." }, e instanceof SyntaxError ? 400 : 503);
  }
};
export const config = { path: "/api/team-watchlist" };
