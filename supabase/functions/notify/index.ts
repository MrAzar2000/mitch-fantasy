// Mitch Fantasy League — Web Push sender (Supabase Edge Function).
//
// Called by:
//   • Supabase Database Webhooks on INSERT to chat_messages and INSERT/UPDATE to
//     trade_block  → broadcasts a push to everyone subscribed.
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
  if (table === "chat_messages" && p?.type === "INSERT") {
    return { title: "League chat", body: clip(`${rec.alias ?? "Someone"}: ${rec.body ?? ""}`), url: "/#chat", tag: "chat" };
  }
  if (table === "trade_block" && (p?.type === "INSERT" || p?.type === "UPDATE")) {
    return { title: "Trade Block", body: "New activity on the Trade Block — tap to see who's shopping.", url: "/#block", tag: "tradeblock" };
  }
  return null;
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
    if (req.headers.get("x-notify-secret") !== NOTIFY_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }

    let payload: any = {};
    try { payload = await req.json(); } catch { /* empty / non-JSON body */ }

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

    const message = JSON.stringify({ title: note.title, body: note.body, url: note.url ?? "/", tag: note.tag });
    let sent = 0, removed = 0;
    await Promise.all(targets.map(async (r: any) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, message);
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", r.endpoint);
          removed++;
        }
      }
    }));

    return new Response(JSON.stringify({ sent, removed, total: targets.length }), {
      headers: { "content-type": "application/json" },
    });
  },
};
