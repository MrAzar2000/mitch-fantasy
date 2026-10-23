import { getDatabase } from "@netlify/database";
import { allowsNotification } from "../lib/notification-policy.mjs";
export default async (req: Request) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const secret = Netlify.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret)
    return new Response("Unauthorized", { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > 40000) return new Response("Too large", { status: 413 });
    const p = JSON.parse(raw);
    if (
      !p ||
      !["league", "matchup", "trade"].includes(p.category) ||
      !Array.isArray(p.hashes) ||
      p.hashes.length > 500 ||
      !p.hashes.every(
        (h: unknown) => typeof h === "string" && /^[a-f0-9]{64}$/.test(h),
      )
    )
      return new Response("Invalid request", { status: 400 });
    const db = getDatabase();
    const rows =
      await db.sql`SELECT subscription_hash,alert_categories,quiet_start,quiet_end,utc_offset FROM manager_preferences WHERE subscription_hash IN (SELECT jsonb_array_elements_text(${JSON.stringify(p.hashes)}::jsonb)) ORDER BY updated_at DESC`;
    const seen = new Set<string>(),
      blocked = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.subscription_hash)) continue;
      seen.add(row.subscription_hash);
      if (!allowsNotification(row, p.category))
        blocked.add(row.subscription_hash);
    }
    return Response.json(
      { allowed: p.hashes.filter((h: string) => !blocked.has(h)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Notification preferences unavailable" },
      { status: 503 },
    );
  }
};
export const config = { path: "/api/push-policy" };
