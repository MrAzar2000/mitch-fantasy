import { getDatabase } from '@netlify/database';
import { isAdmin } from '../lib/site-activity.mjs';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export default async (req: Request) => {
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return reply({ error: 'Forbidden' }, 403);
  try {
    const db = getDatabase();
    if (req.method === 'GET') {
      if (!isAdmin(req)) return reply({ error: 'Enter the admin password.' }, 401);
      const before = Number(new URL(req.url).searchParams.get('before') || 2147483647);
      if (!Number.isInteger(before) || before < 1) return reply({ error: 'Invalid cursor' }, 400);
      return reply(await db.sql`SELECT * FROM site_feedback WHERE id < ${before} ORDER BY id DESC LIMIT 100`);
    }
    if (!['POST','PATCH'].includes(req.method)) return reply({ error: 'Method not allowed' }, 405);
    if (req.method === 'PATCH' && !isAdmin(req)) return reply({ error: 'Enter the admin password.' }, 401);
    const raw = await req.text();
    if (raw.length > 12000) return reply({ error: 'Too large' }, 413);
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return reply({ error: 'Invalid input' }, 400);
    if (req.method === 'PATCH') {
      if (!Number.isInteger(p.id) || !['open','reviewing','resolved'].includes(p.status)) return reply({ error: 'Invalid status' }, 400);
      const rows = await db.sql`UPDATE site_feedback SET status = ${p.status} WHERE id = ${p.id} RETURNING id`;
      return rows.length ? reply({ saved: true }) : reply({ error: 'Report not found' }, 404);
    }
    if (!p || !/^[0-9a-f-]{36}$/i.test(p.requestId) || !['problem','suggestion'].includes(p.kind) || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 140 || typeof p.message !== 'string' || !p.message.trim() || p.message.length > 4000 || typeof p.page !== 'string' || p.page.length > 80 || !(p.teamId === null || Number.isInteger(p.teamId) && p.teamId > 0 && p.teamId < 100000)) return reply({ error: 'Check your report fields.' }, 400);
    const rows = await db.sql`INSERT INTO site_feedback (request_id, team_id, kind, title, message, page) VALUES (${p.requestId}, ${p.teamId}, ${p.kind}, ${p.title.trim()}, ${p.message.trim()}, ${p.page}) ON CONFLICT (request_id) DO UPDATE SET request_id = excluded.request_id RETURNING id`;
    return reply({ id: rows[0].id }, 201);
  } catch (e) { return reply({ error: e instanceof SyntaxError ? 'Invalid input' : 'Reports temporarily unavailable. Your text is still here; please retry.' }, e instanceof SyntaxError ? 400 : 503); }
};
export const config = { path: '/api/site-feedback' };
