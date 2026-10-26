import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const refreshSource = html.slice(html.indexOf('async function refreshData(preloaded){'), html.indexOf('function startLiveRefresh(){'));
function harness(responses) {
  let rendered = 0;
  const saved = [];
  const context = vm.createContext({
    document: { hidden: false, getElementById: () => null },
    navigator: { onLine: true },
    addEventListener() {},
    loadHeartbeat() {},
    saveCachedLeague(d) { saved.push(d); },
    console: { error() {} },
    EXPERIENCE: { updateFreshness() { rendered++; } },
    sb: { from: () => ({ select: () => ({ eq: () => ({ single: async () => responses.shift() }) }) }) },
  });
  vm.runInContext(`let __refreshing=false, leagueRefreshError=false; const D={meta:{lastUpdated:'original'}}; ${refreshSource}`, context);
  return {
    run: (preloaded) => { context.__pre = preloaded; return vm.runInContext('refreshData(__pre)', context); },
    saved: () => saved,
    state: () => vm.runInContext('({error:leagueRefreshError,busy:__refreshing,stamp:D.meta.lastUpdated})', context),
    renders: () => rendered,
  };
}
test('a failed full league download preserves old data and immediately updates freshness warnings', async () => {
  const h = harness([{ data: { lu: 'changed' } }, { error: new Error('Unavailable') }]);
  await h.run();
  assert.equal(h.state().error, true);
  assert.equal(h.state().stamp, 'original');
  assert.equal(h.state().busy, false);
  assert.equal(h.renders(), 1);
});
test('missing update metadata reports failure; a successful unchanged check clears it', async () => {
  const h = harness([{ data: {} }, { data: { lu: 'original' } }]);
  await h.run();
  assert.equal(h.state().error, true);
  await h.run();
  assert.equal(h.state().error, false);
  assert.equal(h.renders(), 2);
});
test('data loaded at startup is applied without another download and saved for the next open', async () => {
  const h = harness([]);
  const fresh = { meta: { lastUpdated: 'original' } };
  await h.run(fresh);
  assert.equal(h.state().error, false);
  assert.equal(h.saved().length, 0); // unchanged data is not rewritten
  assert.equal(h.renders(), 1);
});
