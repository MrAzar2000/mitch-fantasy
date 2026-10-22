import { getDatabase } from '@netlify/database';
import { createHash, timingSafeEqual } from 'node:crypto';
export function isAdmin(req: Request) {
  const password = req.headers.get('X-Admin-Password');
  return !!password && password.length <= 1024 && timingSafeEqual(createHash('sha256').update(password).digest(), Buffer.from('4cc275ec5dd70703105f67231bb1ad73d2ea0f0e02930316a7298035ccabbe09', 'hex'));
}
export async function recordActivity(category: string, action: string, detail: string, eventId: string = crypto.randomUUID()) {
  await getDatabase().sql`INSERT INTO site_activity (event_id, category, action, detail) VALUES (${eventId}, ${category}, ${action}, ${detail}) ON CONFLICT (event_id) DO NOTHING`;
}
