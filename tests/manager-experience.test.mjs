import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import {
  legalLineup,
  coverage,
  kickoffTime,
  csvText,
  optimalLineup,
} from "../lineup-tools.mjs";
import { normalizeResearch } from "../netlify/lib/player-research.mts";
import { allowsNotification } from "../netlify/lib/notification-policy.mts";

test("locked starters stay in their original slots and locked bench players cannot enter", () => {
  const result = legalLineup(
    [
      { id: 1, pos: "RB", slot: "RB", locked: true, value: 3 },
      { id: 2, pos: "RB", slot: "BE", locked: true, value: 40 },
      { id: 3, pos: "WR", slot: "WR", value: 12 },
      { id: 4, pos: "RB", slot: "BE", value: 15 },
    ],
    ["RB", "FLEX"],
  );
  assert.equal(result.total, 18);
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.picks.map((p) => p.id),
    [1, 4],
  );
  assert.equal(result.picks[0].assignedSlot, "RB");
});
test("unavailable locked starters are preserved; missing projections make totals partial", () => {
  const result = legalLineup(
    [
      {
        id: 1,
        pos: "QB",
        slot: "QB",
        locked: true,
        unavailable: true,
        value: null,
      },
      { id: 2, pos: "QB", slot: "BE", value: 25 },
    ],
    ["QB"],
  );
  assert.equal(result.picks[0].id, 1);
  assert.equal(result.complete, false);
  assert.equal(result.missing, 1);
});
test("explicit eligibility is authoritative and FLEX competes for roster coverage", () => {
  const result = optimalLineup(
    [
      { id: 1, pos: "RB", eligible: ["FLEX"], value: 15 },
      { id: 2, pos: "WR", value: 10 },
    ],
    ["RB", "FLEX"],
  );
  assert.equal(result.complete, false);
  assert.equal(result.picks[0].assignedSlot, "FLEX");
  assert.equal(
    coverage(
      [
        { id: 1, pos: "RB" },
        { id: 2, pos: "WR" },
      ],
      ["RB", "WR", "FLEX"],
    ).length,
    1,
  );
});
test("kickoff parsing accepts timestamps and ISO dates while keeping missing times unknown", () => {
  assert.equal(kickoffTime("2026-10-25T17:00:00Z"), Date.UTC(2026, 9, 25, 17));
  assert.equal(kickoffTime(Date.UTC(2026, 9, 25)), Date.UTC(2026, 9, 25));
  for (const v of [null, "", undefined, "not-a-time", 0])
    assert.equal(kickoffTime(v), null);
});
test("CSV escapes quotes and formulas from user-controlled team names", () => {
  assert.equal(
    csvText([["=SUM(A1)", 'A "name"', "line\nbreak"]]),
    '"\'=SUM(A1)","A ""name""","line\nbreak"',
  );
});
test("research uses league availability and league-applied weekly points without treating unknown as free agent", () => {
  const stat = (week, points, source = 0) => ({
    seasonId: 2026,
    scoringPeriodId: week,
    statSourceId: source,
    statSplitTypeId: 1,
    appliedTotal: points,
    stats: { 1: 1 },
  });
  const base = {
    id: 10,
    fullName: "Runner",
    defaultPositionId: 2,
    eligibleSlots: [2, 23],
    proTeamId: 1,
    stats: [stat(1, 12), stat(2, 0), stat(3, 99), stat(3, 15, 1)],
  };
  const result = normalizeResearch(
    {
      settings: {
        rosterSettings: { lineupSlotCounts: { 2: 2, 23: 1, 20: 6, 21: 1 } },
      },
      players: [
        { player: base, onTeamId: 0, status: "FREEAGENT" },
        { player: { ...base, id: 11 }, status: "WAIVERS" },
        { player: { ...base, id: 12 }, onTeamId: 2, status: "ONTEAM" },
        { player: { ...base, id: 13 }, onTeamId: 0 },
      ],
    },
    {
      settings: {
        proTeams: [
          {
            id: 1,
            abbrev: "KC",
            byeWeek: 6,
            proGamesByScoringPeriod: { 3: [{ date: Date.UTC(2026, 8, 20) }] },
          },
        ],
      },
    },
    2026,
    3,
  );
  assert.deepEqual(result.slots, ["RB", "RB", "FLEX"]);
  assert.equal(result.settingsVerified, true);
  assert.deepEqual(
    result.players.map((p) => p.availability),
    ["FREEAGENT", "WAIVERS", "ROSTERED", null],
  );
  assert.equal(result.players[0].avg, 6);
  assert.equal(result.players[0].games, 2);
  assert.equal(result.players[0].proj, 15);
  assert.equal(result.players[0].log.length, 2);
  assert.deepEqual(result.players[0].eligible, ["RB", "FLEX"]);
});
test("quiet hours handle overnight and same-day windows in the browser time-zone offset", () => {
  const p = {
    alert_categories: ["league"],
    quiet_start: 22,
    quiet_end: 8,
    utc_offset: 240,
  };
  assert.equal(allowsNotification(p, "trade"), false);
  assert.equal(
    allowsNotification(p, "league", Date.UTC(2026, 9, 24, 3)),
    false,
  );
  assert.equal(
    allowsNotification(p, "league", Date.UTC(2026, 9, 24, 12)),
    true,
  );
  assert.equal(
    allowsNotification(
      { ...p, quiet_start: 9, quiet_end: 17 },
      "league",
      Date.UTC(2026, 9, 24, 16),
    ),
    false,
  );
});
function preferenceHarness() {
  const writes = [];
  const source = readFileSync(
    new URL("../netlify/functions/manager-preferences.mts", import.meta.url),
    "utf8",
  );
  const js = stripTypeScriptTypes(
    source
      .replace(/^import .*;\n/gm, "")
      .replace("export default async", "const handler=async")
      .replace("export const config", "const config"),
  );
  const ctx = vm.createContext({
    Response,
    URL,
    getDatabase: () => ({
      sql: async (strings, ...params) => {
        writes.push({ query: strings.join("?"), params });
        return [];
      },
    }),
  });
  vm.runInContext(js, ctx);
  return { handler: vm.runInContext("handler", ctx), writes };
}
const device = crypto.randomUUID();
const prefRequest = (body, headers = {}) =>
  new Request("https://league.test/api/manager-preferences", {
    method: "PUT",
    headers: { cookie: "mfl_preferences=" + device, ...headers },
    body: JSON.stringify(body),
  });
const preferences = {
  saved_trades: [],
  watched_players: [123],
  favorite_pages: ["players"],
  alert_categories: ["trade"],
  quiet_start: 22,
  quiet_end: 8,
  utc_offset: 240,
  subscription_hash: null,
};
test("preferences reject malformed, cross-origin and excessive writes before touching the database", async () => {
  const h = preferenceHarness();
  for (const body of [
    null,
    {},
    { ...preferences, watched_players: Array(101).fill(1) },
    { ...preferences, favorite_pages: ["siteactivity"] },
    { ...preferences, quiet_start: 25 },
    { ...preferences, subscription_hash: "invalid" },
  ])
    assert.equal((await h.handler(prefRequest(body))).status, 400);
  assert.equal(
    (
      await h.handler(
        prefRequest(preferences, { origin: "https://other.test" }),
      )
    ).status,
    403,
  );
  assert.equal(h.writes.length, 0);
});
test("anonymous preferences persist per browser without creating accounts or team write authority", async () => {
  const h = preferenceHarness();
  const r = await h.handler(prefRequest(preferences));
  assert.equal(r.status, 200);
  assert.match(h.writes[0].query, /ON CONFLICT/);
  assert.equal(h.writes[0].params[0], device);
});

test("notification policy requires the sender credential and honors opted-out categories", async () => {
  const source = readFileSync(
    new URL("../netlify/functions/push-policy.mts", import.meta.url),
    "utf8",
  );
  const js = stripTypeScriptTypes(
    source
      .replace(/^import .*;\n/gm, "")
      .replace("export default async", "const handler=async")
      .replace("export const config", "const config"),
  );
  const credential = crypto.randomUUID(),
    hash = "a".repeat(64);
  let reads = 0;
  const ctx = vm.createContext({
    Response,
    URL,
    Netlify: { env: { get: () => credential } },
    allowsNotification,
    getDatabase: () => ({
      sql: async () => {
        reads++;
        return [
          {
            subscription_hash: hash,
            alert_categories: ["league"],
            quiet_start: null,
            quiet_end: null,
          },
        ];
      },
    }),
  });
  vm.runInContext(js, ctx);
  const handler = vm.runInContext("handler", ctx);
  const request = (
    headers = {},
    body = { category: "trade", hashes: [hash] },
  ) =>
    new Request("https://league.test/api/push-policy", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  assert.equal((await handler(request())).status, 401);
  assert.equal(reads, 0);
  assert.equal(
    (
      await handler(
        request(
          { "x-notify-secret": credential },
          { category: "trade", hashes: ["invalid"] },
        ),
      )
    ).status,
    400,
  );
  assert.equal(reads, 0);
  const result = await handler(request({ "x-notify-secret": credential }));
  assert.deepEqual((await result.json()).allowed, []);
  assert.equal(reads, 1);
});
