import { and, desc, eq, inArray } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { parlayLegs, parlayWeeks } from '../../db/schema.js';
export default async (req: Request) => {
  const url = new URL(req.url);
  const season = Number(url.searchParams.get('season'));
  if (!Number.isInteger(season) || season < 2020 || season > 2100) return Response.json({ error: 'Invalid season' }, { status: 400 });
  try {
    if (req.method === 'GET') {
      if (url.searchParams.get('details') === 'weeks') {
        const rows = await database().select().from(parlayWeeks).where(eq(parlayWeeks.season, season));
        return Response.json(rows, { headers: { 'Cache-Control': 'no-store' } });
      }
      const team = url.searchParams.get('team');
      if (team !== null && (!Number.isInteger(Number(team)) || Number(team) < 0)) return Response.json({ error: 'Invalid team' }, { status: 400 });
      const db = database();
      const where = team === null ? eq(parlayLegs.season, season) : and(eq(parlayLegs.season, season), eq(parlayLegs.teamId, Number(team)));
      const rows = await db.select().from(parlayLegs).where(where).orderBy(desc(parlayLegs.createdAt)).limit(2000);
      return Response.json(rows.map(r => ({ ...r, created_at: r.createdAt })), { headers: { 'Cache-Control': 'no-store' } });
    }
    if (req.headers.get('origin') && req.headers.get('origin') !== url.origin) return new Response('Forbidden', { status: 403 });

    if (req.method === 'PATCH') {
      const input = await req.json();
      if (!input || typeof input !== 'object') throw new Error('Invalid input');
      const db = database();
      if (input.weekDetails) {
        const { week, participants, totalOdds } = input.weekDetails;
        if (!Number.isInteger(week) || week < 1 || week > 22 || typeof participants !== 'string' || participants.length > 2000 || (totalOdds !== null && (typeof totalOdds !== 'string' || totalOdds.length > 40))) return Response.json({ error: 'Invalid week details' }, { status: 400 });
        const details = { participants: participants.trim(), totalOdds: totalOdds?.trim() || null };
        const [saved] = await db.insert(parlayWeeks).values({ season, week, ...details }).onConflictDoUpdate({ target: [parlayWeeks.season, parlayWeeks.week], set: details }).returning();
        return Response.json(saved);
      }
      if (Array.isArray(input.grades)) {
        const valid = ['won', 'lost', 'void', 'pending'];
        const grades = input.grades.filter((g: any) => g && Number.isInteger(g.id) && valid.includes(g.result));
        if (grades.length !== input.grades.length || grades.length > 500 || !grades.length) return Response.json({ error: 'No valid grades' }, { status: 400 });
        const results: any[] = [];
        for (const g of grades) {
          const [updated] = await db.update(parlayLegs).set({ result: g.result }).where(and(eq(parlayLegs.id, g.id), eq(parlayLegs.season, season))).returning();
          if (updated) results.push({ ...updated, created_at: updated.createdAt });
        }
        return Response.json(results);
      }
      if (Number.isInteger(input.id)) {
        const updates: any = {};
        if (input.result !== undefined) {
          if (!['pending', 'won', 'lost', 'void'].includes(input.result)) return Response.json({ error: 'Invalid result' }, { status: 400 });
          updates.result = input.result;
        }
        if (input.pick !== undefined) {
          if (typeof input.pick !== 'string' || !input.pick.trim() || input.pick.length > 160) return Response.json({ error: 'Invalid pick' }, { status: 400 });
          updates.pick = input.pick.trim();
        }
        if (input.odds !== undefined) updates.odds = (typeof input.odds === 'string' && input.odds.trim()) ? input.odds.trim().slice(0, 14) : null;
        if (!Object.keys(updates).length) return Response.json({ error: 'Nothing to update' }, { status: 400 });
        const [updated] = await db.update(parlayLegs).set(updates).where(and(eq(parlayLegs.id, input.id), eq(parlayLegs.season, season))).returning();
        return updated ? Response.json({ ...updated, created_at: updated.createdAt }) : Response.json({ error: 'Not found' }, { status: 404 });
      }
      return Response.json({ error: 'Invalid input' }, { status: 400 });
    }

    if (req.method === 'DELETE') {
      const input = await req.json();
      if (!input || !Number.isInteger(input.id)) return Response.json({ error: 'Invalid id' }, { status: 400 });
      const db = database();
      const [deleted] = await db.delete(parlayLegs).where(and(eq(parlayLegs.id, input.id), eq(parlayLegs.season, season))).returning();
      return deleted ? Response.json({ deleted: true }) : Response.json({ error: 'Not found' }, { status: 404 });
    }

    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
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
    if (e instanceof Error && (e.message === 'Invalid pick' || e.message === 'Invalid input' || e instanceof SyntaxError)) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: 'Parlay history is temporarily unavailable. Please try again.' }, { status: 503 });
  }
};
export const config = { path: '/api/parlay' };
