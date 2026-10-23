import { getDatabase } from "@netlify/database";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export default async (req: Request) => {
  const origin = new URL(req.url).origin;
  if (req.headers.get("origin") && req.headers.get("origin") !== origin)
    return reply({ error: "Forbidden" }, 403);
  if (!["GET", "PUT"].includes(req.method))
    return reply({ error: "Method not allowed" }, 405);
  // Anonymous, per-browser preferences only. This ID never grants team-edit permissions.
  const device = (req.headers.get("cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("mfl_preferences="))
    ?.slice(16);
  if (!device || !/^[a-f0-9-]{36}$/i.test(device))
    return reply({ error: "Browser preferences unavailable" }, 400);
  try {
    const db = getDatabase();
    if (req.method === "GET") {
      const rows =
        await db.sql`SELECT watched_players, favorite_pages, alert_categories, quiet_start, quiet_end, utc_offset, subscription_hash, saved_trades FROM manager_preferences WHERE device_id=${device}`;
      let delivery_controls = false;
      try {
        const sender = Netlify.env.get("TRADE_DIGEST_NOTIFY_URL");
        if (sender) {
          const r = await fetch(sender, { signal: AbortSignal.timeout(3000) });
          if (r.ok) delivery_controls = (await r.json()).preferences === true;
        }
      } catch {}
      return reply({
        ...(rows[0] || {
          watched_players: [],
          favorite_pages: [],
          alert_categories: ["league", "matchup", "trade"],
          quiet_start: null,
          quiet_end: null,
          utc_offset: 0,
          subscription_hash: null,
          saved_trades: [],
        }),
        delivery_controls,
      });
    }
    const raw = await req.text();
    if (raw.length > 6000)
      return reply({ error: "Preferences too large" }, 413);
    const p = JSON.parse(raw);
    const pages = [
      "dash",
      "myteam",
      "players",
      "matchup",
      "scoreboard",
      "standings",
      "block",
      "trade",
      "faab",
      "odds",
      "history",
      "analytics",
      "records",
      "draft",
      "outlook",
      "h2h",
      "power",
    ];
    if (
      !p ||
      !Array.isArray(p.saved_trades) ||
      p.saved_trades.length > 8 ||
      !p.saved_trades.every(
        (t: any) =>
          t &&
          typeof t.label === "string" &&
          t.label.length > 0 &&
          t.label.length <= 100 &&
          Number.isInteger(t.a) &&
          t.a > 0 &&
          Number.isInteger(t.b) &&
          t.b > 0 &&
          t.a !== t.b &&
          Array.isArray(t.picks) &&
          t.picks.length <= 40 &&
          t.picks.every(
            (id: unknown) => Number.isInteger(id) && Number(id) > 0,
          ),
      ) ||
      !(
        p.subscription_hash === null ||
        (typeof p.subscription_hash === "string" &&
          /^[a-f0-9]{64}$/.test(p.subscription_hash))
      ) ||
      !Array.isArray(p.watched_players) ||
      p.watched_players.length > 100 ||
      !p.watched_players.every(
        (id: unknown) => Number.isInteger(id) && Number(id) > 0,
      ) ||
      !Array.isArray(p.favorite_pages) ||
      p.favorite_pages.length > 6 ||
      !p.favorite_pages.every((id: string) => pages.includes(id)) ||
      !Array.isArray(p.alert_categories) ||
      p.alert_categories.length > 3 ||
      !p.alert_categories.every((id: string) =>
        ["league", "matchup", "trade"].includes(id),
      ) ||
      ![p.quiet_start, p.quiet_end].every(
        (h) => h === null || (Number.isInteger(h) && h >= 0 && h <= 23),
      ) ||
      (p.quiet_start === null) !== (p.quiet_end === null) ||
      !Number.isInteger(p.utc_offset) ||
      Math.abs(p.utc_offset) > 840
    )
      return reply({ error: "Check preference values" }, 400);
    await db.sql`INSERT INTO manager_preferences (device_id,watched_players,favorite_pages,alert_categories,quiet_start,quiet_end,utc_offset,subscription_hash,saved_trades) VALUES (${device},${JSON.stringify([...new Set(p.watched_players)])}::jsonb,${JSON.stringify([...new Set(p.favorite_pages)])}::jsonb,${JSON.stringify([...new Set(p.alert_categories)])}::jsonb,${p.quiet_start},${p.quiet_end},${p.utc_offset},${p.subscription_hash},${JSON.stringify(p.saved_trades)}::jsonb) ON CONFLICT (device_id) DO UPDATE SET watched_players=excluded.watched_players,favorite_pages=excluded.favorite_pages,alert_categories=excluded.alert_categories,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,utc_offset=excluded.utc_offset,subscription_hash=excluded.subscription_hash,saved_trades=excluded.saved_trades,updated_at=now()`;
    return reply({ saved: true });
  } catch (e) {
    return reply(
      {
        error:
          e instanceof SyntaxError
            ? "Invalid preferences"
            : "Preferences could not be saved. Please retry.",
      },
      e instanceof SyntaxError ? 400 : 503,
    );
  }
};
export const config = { path: "/api/manager-preferences" };
