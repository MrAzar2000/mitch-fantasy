import { and, desc, eq } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { parlayLegs } from '../../db/schema.js';
export default async (req: Request) => {
  const url = new URL(req.url);
  const season = Number(url.searchParams.get('season'));
  if (!Number.isInteger(season) || season < 2020 || season > 2100) return Response.json({ error: 'Invalid season' }, { status: 400 });
  try {
    if (req.method === 'GET') {
      const team = url.searchParams.get('team');
      if (team !== null && (!Number.isInteger(Number(team)) || Number(team) < 0)) return Response.json({ error: 'Invalid team' }, { status: 400 });
      const db = database();
      const where = team === null ? eq(parlayLegs.season, season) : and(eq(parlayLegs.season, season), eq(parlayLegs.teamId, Number(team)));
      const rows = await db.select().from(parlayLegs).where(where).orderBy(desc(parlayLegs.createdAt)).limit(2000);
      return Response.json(rows.map(r => ({ ...r, created_at: r.createdAt })), { headers: { 'Cache-Control': 'no-store' } });
    }
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (req.headers.get('origin') && req.headers.get('origin') !== url.origin) return new Response('Forbidden', { status: 403 });
    if (Number(req.headers.get('content-length') || 0) > 100000) return new Response('Too large', { status: 413 });
    const input = await req.json();
    if (!input || typeof input !== 'object' || (Array.isArray(input.legacy) && input.legacy.length > 500)) throw new Error('Invalid pick');
    const values = Array.isArray(input.legacy) ? input.legacy.slice(0, 500) : [input];
    const rows = values.map((p: any) => {
      if (!p || typeof p !== 'object' || !Number.isInteger(p.week) || p.week < 1 || p.week > 22 || !Number.isInteger(p.teamId) || p.teamId < 0 || typeof p.manager !== 'string' || !p.manager.trim() || p.manager.length > 100 || typeof p.pick !== 'string' || !p.pick.trim() || p.pick.length > 160 || (p.odds != null && (typeof p.odds !== 'string' || p.odds.length > 14))) throw new Error('Invalid pick');
      const sourceId = Array.isArray(input.legacy) && typeof p.sourceId === 'string' && /^legacy-\d+-[a-zA-Z0-9-]{1,80}$/.test(p.sourceId) ? p.sourceId : null;
      return { season, week: p.week, teamId: p.teamId, manager: p.manager.trim(), pick: p.pick.trim(), odds: p.odds || null,
        sourceId, ...(sourceId && p.created_at && Number.isFinite(Date.parse(p.created_at)) ? { createdAt: new Date(p.created_at) } : {}) };
    });
    if (!rows.length) return Response.json([]);
    const db = database();
    const saved = await db.insert(parlayLegs).values(rows).onConflictDoNothing({ target: parlayLegs.sourceId }).returning();
    return Response.json(saved.map(r => ({ ...r, created_at: r.createdAt })), { status: 201 });
  } catch (e) {
    if (e instanceof Error && (e.message === 'Invalid pick' || e instanceof SyntaxError)) return Response.json({ error: 'Invalid pick' }, { status: 400 });
    return Response.json({ error: 'Parlay history is temporarily unavailable. Please try again.' }, { status: 503 });
  }
};
export const config = { path: '/api/parlay' };
