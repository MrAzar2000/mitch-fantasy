import { createHash, timingSafeEqual } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { notificationDevices as devices, notificationEvents as events } from '../../db/schema.js';

// Verify the existing admin password on the server; the public UI flag grants no access.
const adminDigest = '4cc275ec5dd70703105f67231bb1ad73d2ea0f0e02930316a7298035ccabbe09';
const headers = { 'Cache-Control': 'no-store' };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });
export default async (req: Request) => {
  if (!['POST', 'GET'].includes(req.method)) return reply({ error: 'Method not allowed' }, 405);
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return reply({ error: 'Forbidden' }, 403);
  if (req.method === 'GET') {
    const password = req.headers.get('X-Admin-Password');
    if (!password || password.length > 1024 || !timingSafeEqual(createHash('sha256').update(password).digest(), Buffer.from(adminDigest, 'hex'))) return reply({ error: 'Enter the admin password to view tracking.' }, 401);
  }
  try {
    const db = database();
    if (req.method === 'GET') {
      const rows = await db.select({ teamId: devices.teamId, permission: devices.permission, subscribed: devices.subscribed, installedAt: devices.installedAt, bellCount: devices.bellCount, firstSeen: devices.firstSeen, lastSeen: devices.lastSeen }).from(devices).orderBy(desc(devices.lastSeen));
      const activity = await db.select({ teamId: events.teamId, event: events.event, createdAt: events.createdAt }).from(events).orderBy(desc(events.createdAt), desc(events.id)).limit(100);
      return reply({ devices: rows, activity });
    }
    if (Number(req.headers.get('content-length') || 0) > 4096) return reply({ error: 'Too large' }, 413);
    const body = await req.text();
    if (body.length > 4096) return reply({ error: 'Too large' }, 413);
    const p = JSON.parse(body);
    if (!p || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.deviceId) ||
      !(p.teamId === null || (Number.isInteger(p.teamId) && p.teamId > 0 && p.teamId < 100000)) ||
      !['granted', 'denied', 'default', 'unsupported'].includes(p.permission) ||
      typeof p.subscribed !== 'boolean' || typeof p.installed !== 'boolean' ||
      !['check', 'bell', 'enabled', 'disabled', 'installed', 'team'].includes(p.event)) return reply({ error: 'Invalid observation' }, 400);
    const [previous] = await db.select().from(devices).where(eq(devices.id, p.deviceId));
    const now = new Date();
    const subscribed = p.subscribed && p.permission === 'granted' ? 1 : 0;
    const installedAt = p.installed ? now : null;
    await db.insert(devices).values({ id: p.deviceId, teamId: p.teamId, permission: p.permission, subscribed, installedAt, bellCount: p.event === 'bell' ? 1 : 0 }).onConflictDoUpdate({
      target: devices.id,
      set: { teamId: p.teamId, permission: p.permission, subscribed, lastSeen: now,
        installedAt: sql`coalesce(${devices.installedAt}, ${installedAt})`,
        bellCount: p.event === 'bell' ? sql`${devices.bellCount} + 1` : devices.bellCount },
    });
    const changes = [];
    if (p.event === 'bell') changes.push('bell');
    if (!previous?.installedAt && p.installed) changes.push('installed');
    if ((!previous || previous.subscribed !== subscribed) && subscribed) changes.push('enabled');
    if (previous?.subscribed && !subscribed) changes.push('disabled');
    if (previous?.permission !== 'denied' && p.permission === 'denied') changes.push('blocked');
    if (previous && previous.teamId !== p.teamId) changes.push('team');
    if (changes.length) await db.insert(events).values(changes.map(event => ({ deviceId: p.deviceId, teamId: p.teamId, event })));
    return reply({ saved: true });
  } catch (error) {
    return reply({ error: error instanceof SyntaxError ? 'Invalid observation' : 'Tracking is temporarily unavailable. Try again.' }, error instanceof SyntaxError ? 400 : 503);
  }
};
export const config = { path: '/api/notification-tracking' };
