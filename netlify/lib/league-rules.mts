type Json = Record<string, any>;

// ESPN scoring stat IDs → the labels ESPN uses on its league settings page.
const STATS: Record<number, [group: string, label: string]> = {
  0: ['Passing', 'Each pass attempted'], 1: ['Passing', 'Each pass completed'], 2: ['Passing', 'Each incomplete pass'],
  3: ['Passing', 'Passing yards'], 4: ['Passing', 'TD pass'], 5: ['Passing', 'Every 5 passing yards'],
  6: ['Passing', 'Every 10 passing yards'], 7: ['Passing', 'Every 20 passing yards'], 8: ['Passing', 'Every 25 passing yards'],
  9: ['Passing', 'Every 50 passing yards'], 10: ['Passing', 'Every 100 passing yards'], 15: ['Passing', '40+ yard TD pass bonus'],
  16: ['Passing', '50+ yard TD pass bonus'], 17: ['Passing', '300–399 yard passing game'], 18: ['Passing', '400+ yard passing game'],
  19: ['Passing', '2-pt passing conversion'], 20: ['Passing', 'Interception thrown'], 64: ['Passing', 'Times sacked'],
  23: ['Rushing', 'Rushing attempts'], 24: ['Rushing', 'Rushing yards'], 25: ['Rushing', 'TD rush'],
  26: ['Rushing', '2-pt rushing conversion'], 27: ['Rushing', 'Every 5 rushing yards'], 28: ['Rushing', 'Every 10 rushing yards'],
  35: ['Rushing', '40+ yard TD rush bonus'], 36: ['Rushing', '50+ yard TD rush bonus'], 37: ['Rushing', '100–199 yard rushing game'],
  38: ['Rushing', '200+ yard rushing game'],
  41: ['Receiving', 'Each reception'], 42: ['Receiving', 'Receiving yards'], 43: ['Receiving', 'TD reception'],
  44: ['Receiving', '2-pt receiving conversion'], 45: ['Receiving', '40+ yard TD reception bonus'], 46: ['Receiving', '50+ yard TD reception bonus'],
  47: ['Receiving', 'Every 5 receiving yards'], 48: ['Receiving', 'Every 10 receiving yards'], 53: ['Receiving', 'Each reception'],
  56: ['Receiving', '100–199 yard receiving game'], 57: ['Receiving', '200+ yard receiving game'], 58: ['Receiving', 'Each target'],
  62: ['Miscellaneous', 'Any 2-pt conversion'], 63: ['Miscellaneous', 'Fumble recovered for TD'], 68: ['Miscellaneous', 'Each fumble'],
  72: ['Miscellaneous', 'Fumble lost'], 73: ['Miscellaneous', 'Each turnover'],
  74: ['Kicking', 'FG made (50+ yards)'], 77: ['Kicking', 'FG made (40–49 yards)'], 80: ['Kicking', 'FG made (0–39 yards)'],
  83: ['Kicking', 'Each FG made'], 85: ['Kicking', 'Each FG missed'], 86: ['Kicking', 'Each PAT made'], 88: ['Kicking', 'Each PAT missed'],
  198: ['Kicking', 'FG made (50–59 yards)'], 201: ['Kicking', 'FG made (60+ yards)'],
  76: ['Kicking', 'FG missed (50+ yards)'], 79: ['Kicking', 'FG missed (40–49 yards)'], 82: ['Kicking', 'FG missed (0–39 yards)'],
  89: ['D/ST points allowed', '0 points allowed'], 90: ['D/ST points allowed', '1–6 points allowed'],
  91: ['D/ST points allowed', '7–13 points allowed'], 92: ['D/ST points allowed', '14–17 points allowed'],
  121: ['D/ST points allowed', '18–21 points allowed'], 122: ['D/ST points allowed', '22–27 points allowed'],
  123: ['D/ST points allowed', '28–34 points allowed'], 124: ['D/ST points allowed', '35–45 points allowed'],
  125: ['D/ST points allowed', '46+ points allowed'], 120: ['D/ST points allowed', 'Each point allowed'],
  127: ['D/ST yards allowed', 'Each yard allowed'], 128: ['D/ST yards allowed', 'Under 100 yards allowed'],
  129: ['D/ST yards allowed', '100–199 yards allowed'], 130: ['D/ST yards allowed', '200–299 yards allowed'],
  131: ['D/ST yards allowed', '300–349 yards allowed'], 132: ['D/ST yards allowed', '350–399 yards allowed'],
  133: ['D/ST yards allowed', '400–449 yards allowed'], 134: ['D/ST yards allowed', '450–499 yards allowed'],
  135: ['D/ST yards allowed', '500–549 yards allowed'], 136: ['D/ST yards allowed', '550+ yards allowed'],
  93: ['Defense & special teams', 'Blocked punt or FG returned for TD'], 94: ['Defense & special teams', 'Defensive TD'],
  95: ['Defense & special teams', 'Each interception'], 96: ['Defense & special teams', 'Each fumble recovered'],
  97: ['Defense & special teams', 'Blocked punt, PAT or FG'], 98: ['Defense & special teams', 'Each safety'],
  99: ['Defense & special teams', 'Each sack'], 101: ['Defense & special teams', 'Kickoff return TD'],
  102: ['Defense & special teams', 'Punt return TD'], 103: ['Defense & special teams', 'Interception return TD'],
  104: ['Defense & special teams', 'Fumble return TD'], 105: ['Defense & special teams', 'Any return TD'],
  106: ['Defense & special teams', 'Each forced fumble'], 107: ['Defense & special teams', 'Assisted tackle'],
  108: ['Defense & special teams', 'Solo tackle'], 113: ['Defense & special teams', 'Pass defended'],
  114: ['Defense & special teams', 'Kickoff return yards'], 115: ['Defense & special teams', 'Punt return yards'],
  205: ['Defense & special teams', 'Defensive 2-pt return'], 206: ['Defense & special teams', '2-pt return'],
  209: ['Defense & special teams', '1-pt safety'],
};
const GROUPS = ['Passing', 'Rushing', 'Receiving', 'Kicking', 'Miscellaneous', 'Defense & special teams', 'D/ST points allowed', 'D/ST yards allowed'];
// Stats only a D/ST can record; their D/ST value is the one that counts.
const DST_ONLY = new Set(['D/ST points allowed', 'D/ST yards allowed']);

// ESPN lineup slot IDs → labels, in the order ESPN shows them.
const SLOTS: [number, string][] = [[0, 'QB'], [2, 'RB'], [3, 'RB/WR'], [4, 'WR'], [5, 'WR/TE'], [6, 'TE'], [23, 'FLEX (RB/WR/TE)'],
  [7, 'OP'], [16, 'D/ST'], [17, 'K'], [18, 'P'], [19, 'Head coach'], [20, 'Bench'], [21, 'IR']];
// positionLimits use ESPN's player position IDs.
const POSITIONS: Record<string, string> = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST' };

// Kicking reads best short → long; everything else follows ESPN's stat order.
const RANK: Record<number, number> = { 80: 1, 77: 2, 74: 3, 198: 4, 201: 5, 86: 6, 85: 7, 88: 8 };
const TYPES: Record<string, string> = { H2H_POINTS: 'Head-to-head points', H2H_CATEGORY: 'Head-to-head categories', TOTAL_POINTS: 'Total points',
  WAIVERS_TRADITIONAL: 'Waivers (traditional order)', WAIVERS_CONTINUAL: 'Waivers (rolling order)', FREE_AGENCY: 'Free agency', OFFLINE: 'Offline', SNAKE: 'Snake', AUCTION: 'Auction',
  TOTAL_POINTS_SCORED: 'Total points scored', H2H_RECORD: 'Head-to-head record', INDIVIDUAL_GAME: 'Individual game', DAILY: 'Daily', WEEKLY: 'Weekly' };
const words = (s: unknown) => TYPES[String(s)] || String(s || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function normalizeRules(raw: Json) {
  const s: Json = raw?.settings || {};
  const st: Json = raw?.status || {};
  const sched: Json = s.scheduleSettings || {};
  const acq: Json = s.acquisitionSettings || {};
  const trade: Json = s.tradeSettings || {};
  const draft: Json = s.draftSettings || {};
  const roster: Json = s.rosterSettings || {};
  const scoring: Json = s.scoringSettings || {};

  const scoringGroups = new Map<string, { id: number; label: string; points: number; dst: number | null }[]>();
  for (const item of scoring.scoringItems || []) {
    const id = Number(item.statId);
    const [group, label] = STATS[id] || ['Other', `ESPN stat ${id}`];
    const base = Number(item.points) || 0;
    const override = item.pointsOverrides && item.pointsOverrides['16'] != null ? Number(item.pointsOverrides['16']) : null;
    const dstOnly = DST_ONLY.has(group) || (group === 'Defense & special teams' && base === 0 && override != null);
    const points = dstOnly && override != null ? override : base;
    const dst = !dstOnly && override != null && override !== base ? override : null;
    if (!points && !dst) continue; // 0-point settings don't affect scoring
    if (!scoringGroups.has(group)) scoringGroups.set(group, []);
    scoringGroups.get(group)!.push({ id, label, points, dst });
  }
  const order = [...GROUPS, 'Other'];
  const scoringOut = [...scoringGroups.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([group, items]) => ({
      group,
      items: items.sort((a, b) => (RANK[a.id] ?? 100 + a.id) - (RANK[b.id] ?? 100 + b.id)).map(({ id, ...rest }) => rest),
    }));

  const counts: Json = roster.lineupSlotCounts || {};
  const lineup = SLOTS.filter(([id]) => Number(counts[id]) > 0).map(([id, label]) => ({ slot: label, count: Number(counts[id]) }));
  const limits = Object.entries(roster.positionLimits || {})
    .filter(([id, n]) => POSITIONS[id] && Number(n) > 0)
    .map(([id, n]) => ({ position: POSITIONS[id], max: Number(n) }));

  const regularWeeks = num(sched.matchupPeriodCount);
  const deadline = num(trade.deadlineDate);
  return {
    name: s.name || null,
    season: num(raw?.seasonId),
    size: num(s.size),
    isPublic: !!s.isPublic,
    format: {
      scoringType: words(raw?.settings?.scoringSettings?.scoringType || 'H2H_POINTS'),
      regularSeasonWeeks: regularWeeks,
      finalScoringPeriod: num(st.finalScoringPeriod),
      matchupTieRule: words(scoring.matchupTieRule || 'NONE'),
      playoffMatchupTieRule: words(scoring.playoffMatchupTieRule || 'NONE'),
      homeTeamBonus: num(scoring.homeTeamBonus) || 0,
    },
    playoffs: {
      teams: num(sched.playoffTeamCount),
      startWeek: regularWeeks != null ? regularWeeks + 1 : null,
      roundLength: num(sched.playoffMatchupPeriodLength) || 1,
      seedingTiebreaker: words(sched.playoffSeedingRule),
      reseed: !!sched.playoffReseed,
      consolation: !sched.consolationLadderDisabled,
    },
    trades: {
      deadline,
      reviewHours: num(trade.revisionHours),
      vetoVotesRequired: num(trade.vetoVotesRequired),
      maxTrades: num(trade.max) != null && trade.max >= 0 ? trade.max : null,
    },
    waivers: {
      type: words(acq.acquisitionType),
      faab: !!acq.isUsingAcquisitionBudget,
      budget: num(acq.acquisitionBudget),
      minimumBid: num(acq.minimumBid),
      waiverHours: num(acq.waiverHours),
      processDays: Array.isArray(acq.waiverProcessDays) ? acq.waiverProcessDays.map(words) : [],
      lastProcessed: num(st.waiverLastExecutionDate),
      acquisitionLimit: num(acq.acquisitionLimit) != null && acq.acquisitionLimit >= 0 ? acq.acquisitionLimit : null,
      orderResets: !!acq.waiverOrderReset,
    },
    roster: {
      lineup,
      limits,
      lockType: words(roster.lineupLocktimeType),
      benchUnlimited: !!roster.isBenchUnlimited,
      undroppableList: !!roster.isUsingUndroppableList,
    },
    draft: {
      type: words(draft.type),
      keepers: num(draft.keeperCount),
      orderType: words(draft.orderType),
      secondsPerPick: num(draft.timePerSelection),
    },
    scoring: scoringOut,
  };
}
