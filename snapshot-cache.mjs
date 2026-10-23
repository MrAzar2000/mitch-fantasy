// Cache only the public league response, never credentials or user submissions.
const CACHE = 'mfl-public-snapshot-v1';
const KEY = '/__mfl-public-league-snapshot';
export async function saveSnapshot(data) {
  try {
    if (!data?.meta?.lastUpdated || !Array.isArray(data.teams)) return;
    const cache = await caches.open(CACHE);
    await cache.put(KEY, new Response(JSON.stringify(data), {headers:{'Content-Type':'application/json'}}));
  } catch { /* Browsing still works when storage is unavailable. */ }
}
export async function readSnapshot() {
  try {
    const cache = await caches.open(CACHE), response = await cache.match(KEY);
    if (!response) return null;
    const data = await response.json();
    return data?.meta?.lastUpdated && Array.isArray(data.teams) ? data : null;
  } catch { return null; }
}
