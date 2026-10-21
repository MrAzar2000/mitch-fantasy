import type {} from '@netlify/functions';
import { createHash, timingSafeEqual } from 'node:crypto';
import { database } from '../../db/index.js';
import { tradeDigestAdditions } from '../../db/schema.js';
import { addedPlayers } from '../lib/trade-digest.mjs';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Netlify.env.get('NOTIFY_SECRET');
  if (!secret) return new Response('Notification queue is not configured', { status: 503 });
  const supplied = req.headers.get('x-notify-secret') || '';
  const digest = (s: string) => createHash('sha256').update(s).digest();
  if (!timingSafeEqual(digest(secret), digest(supplied))) return new Response('Unauthorized', { status: 401 });
  const raw = await req.text();
  if (raw.length > 65536) return new Response('Payload too large', { status: 413 });
  let p;
  try { p = JSON.parse(raw); } catch { return new Response('Invalid JSON', { status: 400 }); }
  if (p?.table !== 'trade_block' || !['INSERT', 'UPDATE'].includes(p.type)) return Response.json({ skipped: true });
  // UPDATE webhooks need the previous listing to distinguish edits from additions.
  if (!Number.isSafeInteger(p.record?.team_id) || !p.record?.updated_at || (p.type === 'UPDATE' && !p.old_record?.listing)) return new Response('Missing listing history', { status: 400 });
  const ids = addedPlayers(p.record, p.type === 'INSERT' ? null : p.old_record);
  if (ids.length) {
    const db = database();
    await db.insert(tradeDigestAdditions).values(ids.map(playerId => ({
      id: createHash('sha256').update(JSON.stringify([p.record.team_id, p.record.updated_at, playerId])).digest('hex'),
      teamId: p.record.team_id, playerId,
    }))).onConflictDoNothing();
  }
  return Response.json({ queued: ids.length });
};
