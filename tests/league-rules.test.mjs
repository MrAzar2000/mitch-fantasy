import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRules } from '../netlify/lib/league-rules.mts';

const raw = {
  seasonId: 2026,
  status: { finalScoringPeriod: 17, waiverLastExecutionDate: 1792998800748 },
  settings: {
    name: 'League', size: 12,
    scheduleSettings: { matchupPeriodCount: 14, playoffTeamCount: 6, playoffSeedingRule: 'TOTAL_POINTS_SCORED', playoffReseed: false, consolationLadderDisabled: true },
    tradeSettings: { deadlineDate: 1796835600000, revisionHours: 24, vetoVotesRequired: 0, max: -1 },
    acquisitionSettings: { acquisitionType: 'WAIVERS_TRADITIONAL', isUsingAcquisitionBudget: true, acquisitionBudget: 100, minimumBid: 0, waiverHours: 24, waiverProcessDays: ['WEDNESDAY'], acquisitionLimit: -1 },
    rosterSettings: { lineupSlotCounts: { 0: 1, 2: 2, 4: 2, 6: 1, 16: 1, 17: 1, 20: 6, 21: 1, 23: 1 }, positionLimits: { 1: 4, 5: 3, 7: -1 }, lineupLocktimeType: 'INDIVIDUAL_GAME' },
    draftSettings: { type: 'OFFLINE', keeperCount: 1 },
    scoringSettings: { scoringType: 'H2H_POINTS', matchupTieRule: 'NONE', scoringItems: [
      { statId: 53, points: 0.5 },
      { statId: 122, points: 2, pointsOverrides: { 16: -1 } },   // D/ST-only: the D/ST value counts
      { statId: 95, points: 0, pointsOverrides: { 16: 2 } },
      { statId: 101, points: 6, pointsOverrides: { 16: 6 } },    // same for everyone
      { statId: 132, points: -2, pointsOverrides: { 16: 0 } },   // worth nothing to a D/ST: hidden
      { statId: 77, points: 3 }, { statId: 80, points: 3 },
    ] },
  },
};

test('rules use ESPN labels, the D/ST value for defensive stats, and drop zero-point settings', () => {
  const r = normalizeRules(raw);
  const group = (name) => r.scoring.find((g) => g.group === name)?.items;
  assert.deepEqual(group('Receiving'), [{ label: 'Each reception', points: 0.5, dst: null }]);
  assert.deepEqual(group('D/ST points allowed'), [{ label: '22–27 points allowed', points: -1, dst: null }]);
  assert.equal(group('D/ST yards allowed'), undefined);
  assert.deepEqual(group('Defense & special teams').map((i) => [i.label, i.points]), [['Each interception', 2], ['Kickoff return TD', 6]]);
  assert.deepEqual(group('Kicking').map((i) => i.label), ['FG made (0–39 yards)', 'FG made (40–49 yards)']);
});

test('dates, playoffs, waivers and roster are summarized for managers', () => {
  const r = normalizeRules(raw);
  assert.equal(r.trades.deadline, 1796835600000);
  assert.equal(r.trades.maxTrades, null);
  assert.deepEqual([r.playoffs.teams, r.playoffs.startWeek, r.playoffs.seedingTiebreaker, r.playoffs.consolation], [6, 15, 'Total points scored', false]);
  assert.deepEqual([r.waivers.type, r.waivers.budget, r.waivers.processDays[0], r.waivers.acquisitionLimit], ['Waivers (traditional order)', 100, 'Wednesday', null]);
  assert.deepEqual(r.roster.lineup.map((x) => x.slot), ['QB', 'RB', 'WR', 'TE', 'FLEX (RB/WR/TE)', 'D/ST', 'K', 'Bench', 'IR']);
  assert.deepEqual(r.roster.limits, [{ position: 'QB', max: 4 }, { position: 'K', max: 3 }]);
  assert.equal(r.format.scoringType, 'Head-to-head points');
});
