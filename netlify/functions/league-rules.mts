import { normalizeRules } from '../lib/league-rules.mjs';

// League settings straight from ESPN, so the Rules page always matches the league.
export default async (req: Request) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const q = new URL(req.url).searchParams;
  const season = Number(q.get('season')), league = q.get('league');
  if (!Number.isInteger(season) || season < 2020 || season > 2100 || !league || !/^\d+$/.test(league))
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  try {
    const r = await fetch(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${league}?view=mSettings`,
      { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Provider unavailable');
    const raw = await r.json();
    if (!raw?.settings) throw new Error('Missing settings');
    return Response.json({ ...normalizeRules(raw), fetchedAt: new Date().toISOString() }, {
      headers: {
        'Cache-Control': 'public, max-age=600',
        'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return Response.json({ error: 'ESPN league settings are unavailable right now.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: '/api/league-rules' };
