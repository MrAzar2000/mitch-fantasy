import type {} from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { isAdmin, recordActivity } from '../lib/site-activity.mjs';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export default async (req: Request) => {
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return reply({ error: 'Forbidden' }, 403);
  try {
    const db = getDatabase();
    if (req.method === 'GET') {
      if (!isAdmin(req)) return reply({ error: 'Enter the admin password.' }, 401);
      const url = new URL(req.url), category = url.searchParams.get('category') || '';
      const before = Number(url.searchParams.get('before') || 2147483647);
      if (!Number.isInteger(before) || before < 1) return reply({ error: 'Invalid cursor' }, 400);
      const rows = await db.sql`SELECT * FROM site_activity WHERE id < ${before} AND (${category} = '' OR category = ${category}) ORDER BY id DESC LIMIT 100`;
      const managers = await db.sql`SELECT team_id, count(*) FILTER (WHERE action = 'app_open')::int AS opens, count(DISTINCT session_id)::int AS sessions, count(*) FILTER (WHERE category = 'activity' AND action <> 'app_open')::int AS actions, max(created_at) AS last_seen FROM site_activity WHERE category = 'activity' AND created_at >= now() - interval '30 days' GROUP BY team_id ORDER BY opens DESC`;
      return reply({ rows, managers });
    }
    if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    const raw = await req.text();
    if (raw.length > 6000) return reply({ error: 'Too large' }, 413);
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return reply({ error: 'Invalid input' }, 400);
    // Delivery reports come from the existing push sender, never a browser claim.
    if (p.category === 'notification') {
      const secret = Netlify.env.get('NOTIFY_SECRET');
      if (!secret || req.headers.get('x-notify-secret') !== secret) return reply({ error: 'Forbidden' }, 403);
      if (typeof p.detail !== 'string' || p.detail.length > 4000) return reply({ error: 'Invalid report' }, 400);
      await recordActivity('notification', 'push_delivery', p.detail);
      return reply({ saved: true });
    }
    const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    if (!uuid(p.eventId) || !uuid(p.deviceId) || !uuid(p.sessionId) || !(p.teamId === null || Number.isInteger(p.teamId) && p.teamId > 0 && p.teamId < 100000) || !['activity','change'].includes(p.category) || !['app_open','page_view','team_view','player_view','lineup_view','interaction','content_change','notification_queued'].includes(p.action) || typeof p.detail !== 'string' || p.detail.length > 2000) return reply({ error: 'Invalid activity' }, 400);
    await db.sql`INSERT INTO site_activity (event_id, category, action, team_id, device_id, session_id, detail) VALUES (${p.eventId}, ${p.category}, ${p.action}, ${p.teamId}, ${p.deviceId}, ${p.sessionId}, ${p.detail}) ON CONFLICT (event_id) DO NOTHING`;
    return reply({ saved: true });
  } catch (e) { return reply({ error: e instanceof SyntaxError ? 'Invalid input' : 'Activity log temporarily unavailable.' }, e instanceof SyntaxError ? 400 : 503); }
};
export const config = { path: '/api/site-activity' };
