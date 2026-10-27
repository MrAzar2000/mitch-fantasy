export function normalizeInboxReport(detail: string) {
  let p;
  try { p = JSON.parse(detail); } catch { return null; }
  if (!p || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 256 || typeof p.body !== 'string' || p.body.length > 3500) return null;
  const teams = p.teams === 'everyone' || p.teams == null || (Array.isArray(p.teams) && !p.teams.length) ? null : p.teams;
  if (teams !== null && (!Array.isArray(teams) || teams.length > 1000 || !teams.every((id: unknown) => Number.isInteger(id) && Number(id) > 0 && Number(id) < 100000))) return null;
  const title = p.title.trim();
  let url = /trade/i.test(title) ? '/#block' : /parlay|pick reminder/i.test(title) ? '/#parlay' : /lineup|roster|injur/i.test(title) ? '/#myteam' : /match|score|kickoff/i.test(title) ? '/#matchup' : '/';
  if (typeof p.url === 'string' && p.url.startsWith('/') && !p.url.startsWith('//')) {
    try { const u = new URL(p.url, 'https://inbox.invalid'); if (u.origin === 'https://inbox.invalid' && u.pathname === '/') url = '/' + u.search + u.hash; } catch {}
  }
  return { title, body: p.body, url, teams: teams === null ? null : [...new Set(teams)] };
}
