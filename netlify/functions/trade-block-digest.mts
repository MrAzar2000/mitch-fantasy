import type {} from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { easternClock } from '../lib/trade-digest.mjs';

export default async () => {
  const now = new Date();
  const { day, time } = easternClock(now);
  if (time !== '21:30') return;
  const secret = Netlify.env.get('NOTIFY_SECRET');
  const sender = Netlify.env.get('TRADE_DIGEST_NOTIFY_URL');
  if (!secret || !sender) throw new Error('Trade digest notification settings are missing');
  const client = await getDatabase().pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize overlapping runs, including a scheduler retry.
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(9302130) AS locked');
    if (!lock.rows[0].locked) { await client.query('ROLLBACK'); return; }
    const previous = await client.query('SELECT day FROM trade_digest_runs WHERE day = $1', [day]);
    if (previous.rows.length) { await client.query('ROLLBACK'); return; }
    const pending = await client.query('SELECT count(DISTINCT (team_id, player_id))::int AS count FROM trade_digest_additions WHERE sent_at IS NULL AND created_at <= $1', [now]);
    const count = pending.rows[0].count;
    if (count > 0) {
      const response = await fetch(sender, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-notify-secret': secret },
        body: JSON.stringify({ title: 'Trade Block', body: `${count} new player${count === 1 ? ' has' : 's have'} been added to the Trade Block — tap to see who's available.`, url: '/#block', tag: `tradeblock-${day}` }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Trade digest delivery failed');
      const result = await response.json();
      if (result.failed > 0 || typeof result.sent !== 'number') throw new Error('Trade digest delivery was incomplete');
      await client.query('INSERT INTO site_activity (event_id, category, action, detail) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING', [`digest-${day}`, 'notification', 'digest_delivery', JSON.stringify({ day, players: count, sent: result.sent, failed: result.failed, source: 'nightly trade digest' })]);
      await client.query('UPDATE trade_digest_additions SET sent_at = $1 WHERE sent_at IS NULL AND created_at <= $1', [now]);
    }
    await client.query('INSERT INTO trade_digest_runs (day) VALUES ($1)', [day]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};
// 9:30 pm Eastern is 01:30 UTC in summer and 02:30 UTC in winter.
export const config = { schedule: '30 1,2 * * *' };
