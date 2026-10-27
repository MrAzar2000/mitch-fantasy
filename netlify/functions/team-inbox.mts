import { getDatabase } from '@netlify/database';
const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control':'no-store'}});
export default async (req: Request) => {
  if (!['GET','PATCH'].includes(req.method)) return reply({error:'Method not allowed'},405);
  const url = new URL(req.url);
  if (req.headers.get('origin') && req.headers.get('origin') !== url.origin) return reply({error:'Forbidden'},403);
  const team = Number(url.searchParams.get('team'));
  if (!Number.isInteger(team) || team < 1 || team >= 100000) return reply({error:'Choose a team'},400);
  // This public league uses team selection, not manager authentication. Receipts
  // belong to this browser and selected team and never authorize team edits.
  const device = (req.headers.get('cookie') || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('mfl_preferences='))?.slice(16);
  if (!device || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(device)) return reply({error:'Browser preferences unavailable'},400);
  try {
    const before = Number(url.searchParams.get('before') || 2147483647);
    if (!Number.isInteger(before) || before < 1 || before > 2147483647) return reply({error:'Invalid cursor'},400);
    const db = getDatabase(), audience = JSON.stringify([team]);
    if (req.method === 'PATCH') {
      const raw = await req.text();
      if (raw.length > 2000) return reply({error:'Too large'},413);
      const p = JSON.parse(raw);
      if (!p || !['read','read_all'].includes(p.action) || !Number.isInteger(p.id) || p.id < 1 || p.id > 2147483647) return reply({error:'Invalid read receipt'},400);
      await db.sql`INSERT INTO team_inbox_reads (device_id, team_id, message_id)
        SELECT ${device}, ${team}, id FROM team_inbox_messages
        WHERE (team_ids IS NULL OR team_ids @> ${audience}::jsonb)
          AND ((${p.action} = 'read' AND id = ${p.id}) OR (${p.action} = 'read_all' AND id <= ${p.id}))
        ON CONFLICT DO NOTHING`;
    }
    const rows = await db.sql`SELECT m.id, m.title, m.body, m.url, m.created_at, (r.message_id IS NOT NULL) AS read
      FROM team_inbox_messages m LEFT JOIN team_inbox_reads r
        ON r.message_id = m.id AND r.team_id = ${team} AND r.device_id = ${device}
      WHERE (m.team_ids IS NULL OR m.team_ids @> ${audience}::jsonb) AND m.id < ${before}
      ORDER BY m.id DESC LIMIT 51`;
    const [counts] = await db.sql`SELECT count(*) FILTER (WHERE r.message_id IS NULL)::int AS unread, coalesce(max(m.id),0)::int AS latest
      FROM team_inbox_messages m LEFT JOIN team_inbox_reads r
        ON r.message_id = m.id AND r.team_id = ${team} AND r.device_id = ${device}
      WHERE m.team_ids IS NULL OR m.team_ids @> ${audience}::jsonb`;
    return reply({team, rows:rows.slice(0,50), unread:counts?.unread || 0, latest:counts?.latest || 0, next:rows.length>50 ? rows[49].id : null});
  } catch (e) { return reply({error:e instanceof SyntaxError?'Invalid request':'Inbox temporarily unavailable. Try again.'},e instanceof SyntaxError?400:503); }
};
export const config = { path:'/api/team-inbox' };
