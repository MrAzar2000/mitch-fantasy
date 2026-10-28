import { getDatabase } from '@netlify/database';
import { isAdmin } from '../lib/site-activity.mjs';
const reply = (body: unknown, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
export default async (req: Request) => {
  const url = new URL(req.url);
  if (req.headers.get('origin') && req.headers.get('origin') !== url.origin) return reply({error:'Forbidden'},403);
  if (!['GET','PUT','DELETE'].includes(req.method)) return reply({error:'Method not allowed'},405);
  const team = Number(url.searchParams.get('team'));
  if (!Number.isInteger(team) || team < 1 || team >= 100000) return reply({error:'Choose a team'},400);
  if (req.method !== 'GET' && !isAdmin(req)) return reply({error:'Enter the admin password.'},401);
  try {
    const db = getDatabase();
    if (req.method === 'PUT') {
      const raw = await req.text();
      if (raw.length > 1000) return reply({error:'Too large'},413);
      const p = JSON.parse(raw);
      if (!p || !Number.isInteger(p.seconds) || p.seconds < 1 || p.seconds > 31536000) return reply({error:'Choose a duration between 1 second and 365 days.'},400);
      await db.sql`INSERT INTO manager_timeouts (team_id, expires_at) VALUES (${team}, now() + ${p.seconds} * interval '1 second')
        ON CONFLICT (team_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, updated_at = now()`;
    } else if (req.method === 'DELETE') await db.sql`DELETE FROM manager_timeouts WHERE team_id = ${team}`;
    const [row] = await db.sql`SELECT expires_at FROM manager_timeouts WHERE team_id = ${team} AND expires_at > now()`;
    return reply({team, expiresAt:row?.expires_at ?? null, serverNow:new Date().toISOString()});
  } catch (e) { return reply({error:e instanceof SyntaxError?'Invalid request':'Could not load timeout. Try again.'},e instanceof SyntaxError?400:503); }
};
export const config = {path:'/api/manager-timeouts'};
