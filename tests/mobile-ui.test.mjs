import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function part(start, end) { const a = html.indexOf(start); assert(a >= 0); const b = html.indexOf(end, a); assert(b > a); return html.slice(a, b); }

test('Trade Value uses absolute production and scarcity, with ties and missing projections', () => {
  const stats = { 1: { gp: 6, avg: 30, l3: 30, proj: null }, 2: { gp: 6, avg: 10, l3: 10, proj: null }, 3: { gp: 6, avg: 10, l3: 10, proj: null }, 4: { gp: 0, avg: 0, l3: 0, proj: 8 } };
  const ctx = vm.createContext({ D: { meta: { lastUpdated: 'test' }, teams: [{}, {}], rosters: { 1: [{ playerId: 1, pos: 'QB' }, { playerId: 3, pos: 'QB' }], 2: [{ playerId: 2, pos: 'QB' }, { playerId: 4, pos: 'K' }] } }, ST: { weeks: [1, 2] }, NFL_INSIGHTS: null, playerSeason: id => stats[id] });
  vm.runInContext(part('function playerTradeValue(', 'function tradeValueText('), ctx);
  assert(ctx.playerTradeValue(1).score > ctx.playerTradeValue(2).score);
  assert.equal(ctx.playerTradeValue(2).score, ctx.playerTradeValue(3).score);
  assert.equal(ctx.playerTradeValue(4), null);
  assert(ctx.playerTradeValue(1).score > 10000);
  assert.equal(ctx.playerTradeValue(2).score, 1000);
  ctx.NFL_INSIGHTS = { players: { 2: { owned: 90, started: 50 } } };
  assert.equal(ctx.playerTradeValue(2).score, 1760);
  stats[1].avg = 40; stats[1].l3 = 40; ctx.D.meta.lastUpdated = 'new';
  assert(ctx.playerTradeValue(1).score > 14000);
});

test('compact matchup context preserves rank and average without the repeated explanatory line', () => {
  const ctx = vm.createContext({ D: { meta: { currentScoringPeriod: 3, nflGames: { KC: { opp: 'NE' } } } }, NFL_INSIGHTS: { exact: true, defense: { NE: { QB: { rank: 2, avg: 15.3, games: 2 } } } }, esc: String, fmt: (n, d) => n.toFixed(d) });
  vm.runInContext(part('function opponentContext(', 'function playerGameContext('), ctx);
  const output = ctx.opponentContext('KC', 'QB', 3);
  assert(output.includes('NE #2')); assert(output.includes('15.3 FPA'));
  assert(!output.includes('#1 =')); assert.equal(ctx.opponentContext('KC', 'QB', 2), '');
});

test('weekly power ranking history starts expanded and uses list rows', () => {
  const state = { started: true, weeks: [1, 2], S: { 1: { weekly: { 1: 100, 2: 110 } } } };
  const ctx = vm.createContext({ ST: state, document: { body: { classList: { contains: () => true } } }, window: { innerWidth: 390 }, computeStats: () => state, powerRanks: () => [{ team: { id: 1 }, rank: 2 }], fmt: (n, d) => n.toFixed(d) });
  vm.runInContext(part('function teamTrend(', '/* ---------- draft report card'), ctx);
  const output = ctx.teamTrend(1);
  assert(output.includes('<details class="fold rank-history" open>'));
  assert(output.includes('<ol class="rank-history-list fold-b"><li>'));
  assert(output.indexOf('<span>Week 2</span>') < output.indexOf('<span>Week 1</span>'));
  assert(!output.includes('class="rankchips"'));
});

function swipeHarness(modal = true) {
  const handlers = {}; let closed = 0; const navigation = [];
  const sheet = { style: {}, classList: { add() {}, remove() {} } };
  const panel = { querySelector: () => sheet };
  const ctx = vm.createContext({ document: { addEventListener: (name, fn) => { handlers[name] = fn; }, getElementById: () => modal ? panel : null, querySelector: () => null }, closeMatchup: () => closed++, cur: 'myteam', VIEW_BACK: ['dash', 'standings'], swipingBack: false, setTab: id => navigation.push(id) });
  vm.runInContext(part('function initSwipeNavigation(', 'function initPullRefresh('), ctx); ctx.initSwipeNavigation();
  const event = (x, y, header = false) => ({ touches: [{ clientX: x, clientY: y }], target: { closest: selector => selector === '.mdl-top' && header ? {} : null }, cancelable: true, preventDefault() {} });
  return { handlers, sheet, event, closed: () => closed, navigation };
}
test('swipe dismisses panels horizontally or down from the header; cancellation and scrolling do not', () => {
  const h = swipeHarness();
  h.handlers.touchstart(h.event(70, 50)); h.handlers.touchmove(h.event(190, 53)); h.handlers.touchend(); assert.equal(h.closed(), 1);
  h.handlers.touchstart(h.event(70, 50)); h.handlers.touchmove(h.event(190, 53)); h.handlers.touchcancel(); h.handlers.touchend(); assert.equal(h.closed(), 1); assert.equal(h.sheet.style.transform, '');
  h.handlers.touchstart(h.event(70, 50, true)); h.handlers.touchmove(h.event(72, 180, true)); h.handlers.touchend(); assert.equal(h.closed(), 2);
  h.handlers.touchstart(h.event(70, 50)); h.handlers.touchmove(h.event(72, 180)); h.handlers.touchend(); assert.equal(h.closed(), 2);
});
test('page edge swipe returns to the previous view, not every horizontal scroll', () => {
  const h = swipeHarness(false);
  h.handlers.touchstart(h.event(90, 50)); h.handlers.touchmove(h.event(210, 50)); h.handlers.touchend(); assert.equal(h.navigation.length, 0);
  h.handlers.touchstart(h.event(10, 50)); h.handlers.touchmove(h.event(140, 50)); h.handlers.touchend(); assert.deepEqual(h.navigation, ['standings']);
});

 test('My Team roster omits trade ratings while preserving production and projections', () => {
  const row = part('function rosterRow(', '/* ---- DRAFT ---- */');
  assert(!row.includes('playerTradeValue'));
  assert(!row.includes('POWER'));
  assert(row.includes('PPG')); assert(row.includes('PROJ'));
  assert(!html.includes('h+=powerGuide()'));
});

test('kickoff schedule retains later games on the same day and filters invalid times', () => {
  const first = Date.UTC(2026, 9, 25, 17), later = first + 3 * 3600000;
  const ctx = vm.createContext({ D: { meta: { nflKickoffs: [first, first, 'invalid'], proGames: { KC: later, NE: later } } }, fallbackKickoffs: () => [123] });
  vm.runInContext(part('function kickoffSlots(', '// NFL games kicking'), ctx);
  assert.deepEqual(Array.from(ctx.kickoffSlots()), [first, later]);
  ctx.D.meta = {}; assert.deepEqual(Array.from(ctx.kickoffSlots()), [123]);
});

test('kickoff countdown includes days, hours, minutes and seconds and clamps expired times', () => {
  const ctx = vm.createContext({});
  vm.runInContext(part('function cdParts(', 'function exactStamp('), ctx);
  const output = ctx.cdParts((86400 + 2 * 3600 + 3 * 60 + 4) * 1000);
  assert.equal(output, '1<span class="u">d</span>02<span class="u">h</span>03<span class="u">m</span>04<span class="u">s</span>');
  assert.equal(ctx.cdParts(-1000), '00<span class="u">h</span>00<span class="u">m</span>00<span class="u">s</span>');
});
