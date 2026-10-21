import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { addedPlayers, easternClock } from '../netlify/lib/trade-digest.mts';

const row = (available, openTo = [], extra = {}) => ({ listing: { available, openTo, ...extra } });
test('only newly listed players count; edits, removals, and status switches stay quiet', () => {
  assert.deepEqual(addedPlayers(row([1, 2], [3]), null), [1, 2, 3]);
  assert.deepEqual(addedPlayers(row([1], [2], { note: 'new note', needs: ['RB'] }), row([1, 2])), []);
  assert.deepEqual(addedPlayers(row([1]), row([1, 2])), []);
  assert.deepEqual(addedPlayers(row([1, 3], [3, 4]), row([1, 2])), [3, 4]);
  assert.deepEqual(addedPlayers(row([null, 'bad', -1, 0]), null), []);
});
test('Eastern cutoff tracks summer, winter, and both daylight saving transitions', () => {
  for (const stamp of ['2026-07-02T01:30:00Z', '2026-01-02T02:30:00Z', '2026-03-09T01:30:00Z', '2026-11-02T02:30:00Z']) assert.equal(easternClock(new Date(stamp)).time, '21:30');
  assert.equal(easternClock(new Date('2026-07-02T02:30:00Z')).time, '22:30');
  assert.equal(easternClock(new Date('2026-01-02T01:30:00Z')).time, '20:30');
  assert.equal(easternClock(new Date('2026-07-02T01:30:00Z')).day, '2026-07-01');
});
const source = readFileSync(new URL('../netlify/functions/trade-block-digest.mts', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '').replace('export default async', 'const handler = async').replace('export const config', 'const config'));
function harness({ count = 2, previous = false, time = '21:30', failure = false } = {}) {
  const queries = [], messages = [];
  const client = { query: async (query, params) => {
    queries.push(query);
    if (query.includes('pg_try')) return { rows: [{ locked: true }] };
    if (query.startsWith('SELECT day')) return { rows: previous ? [{ day: '2026-07-01' }] : [] };
    if (query.includes('count(DISTINCT')) return { rows: [{ count }] };
    return { rows: [] };
  }, release() {} };
  const ctx = vm.createContext({ Date, AbortSignal, Netlify: { env: { get: key => key === 'NOTIFY_SECRET' ? 'test-only-secret' : 'https://sender.test' } }, easternClock: () => ({ day: '2026-07-01', time }), getDatabase: () => ({ pool: { connect: async () => client } }), fetch: async (url, options) => { messages.push(JSON.parse(options.body)); return { ok: !failure, json: async () => ({ sent: 3, failed: 0 }) }; } });
  vm.runInContext(js, ctx);
  return { run: () => vm.runInContext('handler', ctx)(), queries, messages };
}
test('nightly digest sends one combined push, then records delivery', async () => {
  const h = harness(); await h.run();
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0].body, /2 new players/);
  assert.equal(h.messages[0].url, '/#block');
  assert.ok(h.queries.some(q => q.startsWith('UPDATE trade_digest_additions')));
  assert.ok(h.queries.some(q => q.startsWith('INSERT INTO trade_digest_runs')));
  assert.equal(h.queries.at(-1), 'COMMIT');
});
test('quiet days, duplicate invocations, and the wrong UTC slot send no push', async () => {
  for (const settings of [{ count: 0 }, { previous: true }, { time: '22:30' }]) {
    const h = harness(settings); await h.run(); assert.equal(h.messages.length, 0);
  }
});
test('sender failure leaves additions pending', async () => {
  const h = harness({ failure: true });
  await assert.rejects(h.run(), /delivery failed/);
  assert.equal(h.queries.at(-1), 'ROLLBACK');
  assert.ok(!h.queries.some(q => q.startsWith('UPDATE trade_digest_additions')));
});

test('queue authenticates, rejects missing UPDATE history, and deduplicates webhook deliveries', async () => {
  const { createHash, timingSafeEqual } = await import('node:crypto');
  const source = readFileSync(new URL('../netlify/functions/trade-block-events.mts', import.meta.url), 'utf8');
  const js = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '').replace('export default async', 'const handler = async'));
  const saved = new Map();
  const ctx = vm.createContext({ createHash, timingSafeEqual, addedPlayers, Response, Netlify: { env: { get: () => 'test-only-secret' } }, tradeDigestAdditions: {}, database: () => ({ insert: () => ({ values: rows => ({ onConflictDoNothing: async () => rows.forEach(r => saved.set(r.id, r)) }) }) }) });
  vm.runInContext(js, ctx);
  const handler = vm.runInContext('handler', ctx);
  const event = { table: 'trade_block', type: 'UPDATE', record: { ...row([1, 2]), team_id: 1, updated_at: '2026-07-01T20:00:00Z' }, old_record: row([1]) };
  const request = (body, secret = 'test-only-secret') => new Request('https://league.test/queue', { method: 'POST', headers: { 'x-notify-secret': secret }, body: JSON.stringify(body) });
  assert.equal((await handler(request(event, 'incorrect'))).status, 401);
  assert.equal((await handler(request({ ...event, old_record: { team_id: 1 } }))).status, 400);
  assert.equal(saved.size, 0);
  for (let i = 0; i < 2; i++) assert.equal((await handler(request(event))).status, 200);
  assert.equal(saved.size, 1);
  assert.equal([...saved.values()][0].playerId, 2);
  await handler(request({ ...event, record: { ...event.record, listing: { available: [1], note: 'changed' } } }));
  assert.equal(saved.size, 1);
});
