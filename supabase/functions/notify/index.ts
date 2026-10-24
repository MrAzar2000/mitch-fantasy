// Mitch Fantasy League — Web Push sender (Supabase Edge Function).
//
// Called by:
//   • Supabase Database Webhooks on INSERT/UPDATE to
//     trade_block  → queues additions for the nightly Netlify digest.
//   • The data cron (later) for "your matchup is live" → targeted by team_id.
//
// Auth: every caller must send header  x-notify-secret: <NOTIFY_SECRET>.
//
// Required function secrets:
//   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (e.g. mailto:you@example.com),
//   NOTIFY_SECRET.  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:mitch.azar@gmail.com";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const clip = (s: unknown, n = 120): string => {
  const t = (s ?? "").toString().trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

type Note = { title: string; body: string; url?: string; tag?: string; teamIds?: number[] };

function buildNote(p: any): Note | null {
  // Direct event (cron / manual test): a ready-made notification.
  if (p && typeof p.title === "string") {
    return { title: p.title, body: p.body ?? "", url: p.url, tag: p.tag, teamIds: p.teamIds };
  }
  // Supabase database webhook payload: { type, table, record, old_record, schema }.
  const table = p?.table;
  const rec = p?.record ?? {};
  if (table === "push_queue" && p?.type === "INSERT") {
    return { title: rec.title || "League notification", body: rec.body || "", teamIds: rec.team_ids || undefined, url: rec.url, tag: rec.tag };
  }
  if (table === "league_updates" && p?.type === "INSERT") {
    if (rec.active === false) return null;
    return { title: "League announcement", body: clip(rec.message ?? ""), url: "/", tag: "update" };
  }
  return null;
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "GET") return new Response(JSON.stringify({ preferences: true }), {headers:{"content-type":"application/json","cache-control":"no-store"}});
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
    if (req.headers.get("x-notify-secret") !== NOTIFY_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }

    let payload: any = {};
    try { payload = await req.json(); } catch { /* empty / non-JSON body */ }

    // Keep the existing database webhook, but queue trade events instead of pushing.
    if (payload?.table === "trade_block") {
      const response = await fetch("https://mitch-fantasy.netlify.app/.netlify/functions/trade-block-events", {
        method: "POST",
        headers: { "content-type": "application/json", "x-notify-secret": NOTIFY_SECRET },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      return new Response(JSON.stringify({ queued: response.ok }), {
        status: response.ok ? 200 : 502, headers: { "content-type": "application/json" },
      });
    }

    const note = buildNote(payload);
    if (!note) {
      return new Response(JSON.stringify({ skipped: true }), { headers: { "content-type": "application/json" } });
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth,team_id");
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    let targets = subs ?? [];
    if (Array.isArray(note.teamIds) && note.teamIds.length) {
      targets = targets.filter((r: any) => note.teamIds!.includes(r.team_id));
    }

    // Resolve browser preferences before sending a user-visible push.
    // Raw subscription endpoints never leave the existing push sender.
    let suppressed = 0;
    try {
      const tag = String(note.tag || "").toLowerCase();
      const category = /trade|block/.test(tag) ? "trade" : /match|score|lineup|kickoff/.test(tag) ? "matchup" : "league";
      const hashes = await Promise.all(targets.map(async (r: any) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(r.endpoint)))).map(n => n.toString(16).padStart(2, "0")).join("")));
      const allowed = new Set<string>();
      for (let offset = 0; offset < hashes.length; offset += 500) {
        const policy = await fetch("https://mitch-fantasy.netlify.app/api/push-policy", {
          method: "POST", headers: { "content-type": "application/json", "x-notify-secret": NOTIFY_SECRET },
          body: JSON.stringify({ hashes: hashes.slice(offset, offset + 500), category }), signal: AbortSignal.timeout(8000),
        });
        if (!policy.ok) throw new Error("Preferences unavailable");
        const result = await policy.json();
        if (!Array.isArray(result.allowed)) throw new Error("Invalid preferences response");
        result.allowed.forEach((h: string) => allowed.add(h));
      }
      const filtered = targets.filter((_: any, i: number) => allowed.has(hashes[i]));
      suppressed = targets.length - filtered.length; targets = filtered;
    } catch { /* Preserve existing delivery if the preferences service is unavailable. */ }

    const message = JSON.stringify({ title: note.title, body: note.body, url: note.url ?? "/", tag: note.tag });
    let sent = 0, removed = 0, failed = 0;
    await Promise.all(targets.map(async (r: any) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, message);
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", r.endpoint);
          removed++;
        } else { failed++; }
      }
    }));

    // Keep delivery outcomes in the Netlify site log. Never send subscription endpoints or keys.
    let logged = false;
    try {
      const report = await fetch("https://mitch-fantasy.netlify.app/api/site-activity", {
        method: "POST",
        headers: { "content-type": "application/json", "x-notify-secret": NOTIFY_SECRET },
        body: JSON.stringify({ category: "notification", detail: JSON.stringify({ title: note.title, body: note.body, teams: note.teamIds || "everyone", sent, removed, failed, suppressed, total: targets.length }) }),
        signal: AbortSignal.timeout(10000),
      });
      logged = report.ok;
    } catch { /* Delivery already happened; do not retry pushes because logging failed. */ }
    return new Response(JSON.stringify({ sent, removed, failed, suppressed, total: targets.length, logged }), {
      headers: { "content-type": "application/json" },
    });
  },
};
