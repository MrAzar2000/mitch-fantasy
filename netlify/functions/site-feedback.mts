import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { isAdmin } from '../lib/site-activity.mjs';
// New reports notify only SwagCityBallers (ESPN team 4, the league admin's team).
const NOTIFY_TEAM_ID = 4;
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_IMAGE_BYTES = 4_000_000;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const clip = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s;
async function notifyAdminTeam(p: { kind: string; title: string; message: string; image: boolean }) {
  const secret = Netlify.env.get('NOTIFY_SECRET');
  const sender = Netlify.env.get('TRADE_DIGEST_NOTIFY_URL');
  if (!secret || !sender) return false;
  try {
    const label = p.kind === 'problem' ? 'New site problem' : 'New suggestion';
    const body = clip(p.title || p.message || (p.image ? 'Photo attached' : ''), 140) || 'Open the inbox to read it.';
    const response = await fetch(sender, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-notify-secret': secret },
      body: JSON.stringify({ title: label, body, url: '/#feedbackinbox', tag: 'feedback', teamIds: [NOTIFY_TEAM_ID] }),
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch { return false; }
}
export default async (req: Request) => {
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return reply({ error: 'Forbidden' }, 403);
  try {
    const db = getDatabase();
    if (req.method === 'GET') {
      if (!isAdmin(req)) return reply({ error: 'Enter the admin password.' }, 401);
      const params = new URL(req.url).searchParams;
      if (params.has('image')) {
        const id = Number(params.get('image'));
        if (!Number.isInteger(id) || id < 1) return reply({ error: 'Invalid image' }, 400);
        const rows = await db.sql`SELECT image_key, image_type FROM site_feedback WHERE id = ${id}`;
        if (!rows[0]?.image_key) return reply({ error: 'Photo not found' }, 404);
        const image = await getStore('feedback-photos').get(rows[0].image_key, { type: 'arrayBuffer' });
        if (!image) return reply({ error: 'Photo not found' }, 404);
        return new Response(image, { headers: { 'Content-Type': rows[0].image_type || 'image/jpeg', 'Cache-Control': 'private, no-store' } });
      }
      const before = Number(params.get('before') || 2147483647);
      if (!Number.isInteger(before) || before < 1) return reply({ error: 'Invalid cursor' }, 400);
      const status = params.get('status');
      if (status && !['open','reviewing','resolved'].includes(status)) return reply({ error: 'Invalid status' }, 400);
      return reply(status
        ? await db.sql`SELECT * FROM site_feedback WHERE id < ${before} AND status = ${status} ORDER BY id DESC LIMIT 100`
        : await db.sql`SELECT * FROM site_feedback WHERE id < ${before} ORDER BY id DESC LIMIT 100`);
    }
    if (!['POST','PATCH'].includes(req.method)) return reply({ error: 'Method not allowed' }, 405);
    if (req.method === 'PATCH' && !isAdmin(req)) return reply({ error: 'Enter the admin password.' }, 401);
    const raw = await req.text();
    if (raw.length > 6_000_000) return reply({ error: 'That photo is too large. Try a smaller one.' }, 413);
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return reply({ error: 'Invalid input' }, 400);
    if (req.method === 'PATCH') {
      if (!Number.isInteger(p.id) || !['open','reviewing','resolved'].includes(p.status)) return reply({ error: 'Invalid status' }, 400);
      const rows = await db.sql`UPDATE site_feedback SET status = ${p.status} WHERE id = ${p.id} RETURNING id`;
      return rows.length ? reply({ saved: true }) : reply({ error: 'Report not found' }, 404);
    }
    const title = typeof p.title === 'string' ? p.title.trim() : p.title == null ? '' : null;
    const message = typeof p.message === 'string' ? p.message.trim() : p.message == null ? '' : null;
    let image: { bytes: Buffer; type: string } | null = null;
    if (p.image != null) {
      const match = typeof p.image === 'string' && /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(p.image);
      if (!match) return reply({ error: 'Attach a JPEG, PNG, WebP or GIF photo.' }, 400);
      const bytes = Buffer.from(match[2], 'base64');
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return reply({ error: 'That photo is too large. Try a smaller one.' }, 413);
      image = { bytes, type: match[1] };
    }
    if (!/^[0-9a-f-]{36}$/i.test(p.requestId) || !['problem','suggestion'].includes(p.kind) || title === null || title.length > 140 || message === null || message.length > 4000 || (!message && !image) || typeof p.page !== 'string' || p.page.length > 80 || !(p.teamId === null || Number.isInteger(p.teamId) && p.teamId > 0 && p.teamId < 100000)) return reply({ error: 'Add some details or a photo, then try again.' }, 400);
    const existing = await db.sql`SELECT id FROM site_feedback WHERE request_id = ${p.requestId}`;
    if (existing.length) return reply({ id: existing[0].id }, 201);
    const imageKey = image ? `${p.requestId}.${IMAGE_TYPES[image.type]}` : null;
    if (image && imageKey) await getStore('feedback-photos').set(imageKey, new Blob([new Uint8Array(image.bytes)], { type: image.type }));
    const rows = await db.sql`INSERT INTO site_feedback (request_id, team_id, kind, title, message, page, image_key, image_type) VALUES (${p.requestId}, ${p.teamId}, ${p.kind}, ${title}, ${message}, ${p.page}, ${imageKey}, ${image?.type ?? null}) ON CONFLICT (request_id) DO UPDATE SET request_id = excluded.request_id RETURNING id`;
    const notified = await notifyAdminTeam({ kind: p.kind, title, message, image: !!image });
    return reply({ id: rows[0].id, notified }, 201);
  } catch (e) { return reply({ error: e instanceof SyntaxError ? 'Invalid input' : 'Reports temporarily unavailable. Your text is still here; please retry.' }, e instanceof SyntaxError ? 400 : 503); }
};
export const config = { path: '/api/site-feedback' };
