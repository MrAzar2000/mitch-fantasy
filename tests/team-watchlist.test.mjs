import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

function harness() {
  const rows = new Map();
  const source = stripTypeScriptTypes(readFileSync(new URL('../netlify/functions/team-watchlist.mts', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export default async', 'const handler = async').replace('export const config', 'const config'));
  const ctx = vm.createContext({ Response, URL, getDatabase: () => ({ sql: async (s, ...p) => {
    const key = p.slice(0, 3).join(':');
    const ids = rows.get(key) || new Set();
    if (s[0].startsWith('INSERT')) ids.add(p[3]);
    if (s[0].startsWith('DELETE')) ids.delete(p[3]);
    rows.set(key, ids);
    return [...ids].map(player_id => ({ player_id }));
  } }) });
  vm.runInContext(source, ctx);
  return vm.runInContext('handler', ctx);
}
const request = (method = 'GET', team = 1, player = 123, extra = '') => new Request(`https://league.test/api/team-watchlist?league=42&season=2026&team=${team}${extra}`, {
  method, ...(method === 'GET' ? {} : { body: JSON.stringify({ player }) }),
});
test('watchlist follows team across browsers, isolates teams and seasons, and removes individual players', async () => {
  const handler = harness();
  assert.deepEqual((await (await handler(request('POST'))).json()).watched_players, [123]);
  assert.deepEqual((await (await handler(request())).json()).watched_players, [123]);
  assert.deepEqual((await (await handler(request('GET', 2))).json()).watched_players, []);
  const otherSeason = new Request('https://league.test/api/team-watchlist?league=42&season=2027&team=1');
  assert.deepEqual((await (await handler(otherSeason)).json()).watched_players, []);
  await handler(request('POST', 1, 456));
  await handler(request('POST', 1, 456));
  assert.deepEqual((await (await handler(request('DELETE'))).json()).watched_players, [456]);
});
test('watchlist rejects invalid scopes, players, cross-origin writes and malformed JSON', async () => {
  const handler = harness();
  assert.equal((await handler(request('POST', 0))).status, 400);
  assert.equal((await handler(request('POST', 1, -1))).status, 400);
  assert.equal((await handler(new Request(request('POST'), { headers: { origin: 'https://other.test' } }))).status, 403);
  assert.equal((await handler(new Request(request(), { method: 'POST', body: '{' }))).status, 400);
});
