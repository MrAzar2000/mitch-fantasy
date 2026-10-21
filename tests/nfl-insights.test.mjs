import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/nfl-insights.mts';

function fixtureFetch({ privateLeague = false, outage = false } = {}) {
  const weekly = (team, yards, week = 1) => ({ seasonId: 2026, statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: week, proTeamId: team, stats: { 3: yards } });
  const players = [
    { id: 101, defaultPositionId: 1, ownership: { percentOwned: 0, percentStarted: 0 }, stats: [weekly(1, 200), weekly(1, 999, 2)] },
    { id: 102, defaultPositionId: 1, ownership: { percentOwned: 98, percentStarted: 90 }, stats: [weekly(2, 300)] },
  ];
  const game = { homeProTeamId: 1, awayProTeamId: 2, statsOfficial: true };
  const teams = [{ id: 1, abbrev: 'KC', proGamesByScoringPeriod: { 1: [game] } }, { id: 2, abbrev: 'NE', proGamesByScoringPeriod: { 1: [game] } }];
  return async url => {
    if (outage) return new Response('', { status: 503 });
    if (url.includes('/players?')) return Response.json(players);
    if (url.includes('proTeamSchedules')) return Response.json({ settings: { proTeams: teams } });
    if (url.includes('mSettings')) return privateLeague ? new Response('', { status: 401 }) : Response.json({ settings: { scoringSettings: { scoringItems: [{ statId: 3, points: .04 }] } } });
    return Response.json({ news: [{ headline: 'Update', links: { web: { href: 'https://www.espn.com/nfl/story' } } }, { headline: 'Unsafe link', links: { web: { href: 'javascript:alert(1)' } } }] });
  };
}
const request = ids => new Request(`https://league.test/api/nfl-insights?season=2026&week=2&league=123&ppr=1&ids=${ids}`);

test('uses league scoring and completed weeks; ranks defenses by points allowed to the opposing position', async () => {
  const original = globalThis.fetch; globalThis.fetch = fixtureFetch();
  try {
    const response = await handler(request('101,102')), data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.exact, true);
    assert.equal(data.players[101].points, 8); // Week 2 must not leak into completed-week totals.
    assert.equal(data.players[101].positionRank, 2); assert.equal(data.players[102].rank, 1);
    assert.equal(data.players[101].owned, 0); assert.equal(data.players[101].started, 0);
    assert.equal(data.defense.NE.QB.avg, 8); assert.equal(data.defense.NE.QB.rank, 1);
    assert.equal(data.defense.KC.QB.avg, 12); assert.equal(data.defense.KC.QB.games, 1);
  } finally { globalThis.fetch = original; }
});
test('labels fallback scoring when league settings are inaccessible and filters news links', async () => {
  const original = globalThis.fetch; globalThis.fetch = fixtureFetch({ privateLeague: true });
  try {
    const data = await (await handler(request('101'))).json();
    assert.equal(data.exact, false); assert.match(data.scoring, /League settings unavailable/);
    assert.equal(data.news.length, 1); assert.equal(data.news[0].headline, 'Update');
  } finally { globalThis.fetch = original; }
});
test('returns an explicit unavailable response when the provider fails', async () => {
  const original = globalThis.fetch; globalThis.fetch = fixtureFetch({ outage: true });
  try { assert.equal((await handler(request('101'))).status, 502); }
  finally { globalThis.fetch = original; }
});
test('rejects invalid seasons and unsupported methods', async () => {
  assert.equal((await handler(new Request('https://league.test/api/nfl-insights?season=bad'))).status, 400);
  assert.equal((await handler(new Request('https://league.test/api/nfl-insights', { method: 'POST' }))).status, 405);
});
