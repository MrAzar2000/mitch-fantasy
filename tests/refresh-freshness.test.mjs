import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const refreshSource = html.slice(html.indexOf('async function refreshData(){'), html.indexOf('function startLiveRefresh(){'));
function harness(responses) {
  let rendered = 0;
  const context = vm.createContext({
    document: { hidden: false },
    loadHeartbeat() {},
    console: { error() {} },
    EXPERIENCE: { updateFreshness() { rendered++; } },
    sb: { from: () => ({ select: () => ({ eq: () => ({ single: async () => responses.shift() }) }) }) },
  });
  vm.runInContext(`let __refreshing=false, leagueRefreshError=false; const D={meta:{lastUpdated:'original'}}; ${refreshSource}`, context);
  return {
    run: () => vm.runInContext('refreshData()', context),
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
