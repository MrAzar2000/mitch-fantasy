import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../netlify/functions/notification-tracking.mts', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '').replace('export default async', 'const handler = async').replace('export const config', 'const config'));
function harness(previous) {
  const writes = [];
  const db = {
    select: () => ({ from: () => ({ where: async () => previous ? [previous] : [] }) }),
    insert: table => ({ values: values => { writes.push({ table, values }); return { onConflictDoUpdate: async () => {} }; } }),
  };
  const ctx = vm.createContext({ createHash, timingSafeEqual, Buffer, Response, URL, database: () => db, devices: { id: 'id', installedAt: 'installed', bellCount: 'bells' }, events: 'events', sql: () => ({}), eq: () => ({}), desc: () => ({}) });
  vm.runInContext(js, ctx);
  return { handler: req => vm.runInContext('handler', ctx)(req), writes };
}
const payload = { deviceId: 'fda6534a-f613-4919-9ef2-60cd061589fb', teamId: 1, permission: 'granted', subscribed: true, installed: true, event: 'check' };
const post = body => new Request('https://league.test/api/notification-tracking', { method: 'POST', body: JSON.stringify(body) });
test('admin tracking rejects missing passwords, wrong passwords, and the public UI hash', async () => {
  const { handler, writes } = harness();
  const hash = html.match(/const ADMIN_HASH="([^"]+)"/)[1];
  for (const value of ['', 'incorrect-password', hash]) {
    const response = await handler(new Request('https://league.test/api/notification-tracking', { headers: { 'X-Admin-Password': value } }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(writes.length, 0);
});
test('tracking rejects malformed and cross-origin observations without writing data', async () => {
  const { handler, writes } = harness();
  for (const bad of [{ ...payload, deviceId: 'guessable' }, { ...payload, teamId: -1 }, { ...payload, subscribed: 'true' }, { ...payload, event: 'arbitrary' }]) assert.equal((await handler(post(bad))).status, 400);
  const req = post(payload);req.headers.set('origin', 'https://other.test');
  assert.equal((await handler(req)).status, 403);
  assert.equal(writes.length, 0);
});
test('first observed setup logs installation and enabling; repeat checks do not duplicate milestones', async () => {
  let h = harness();assert.equal((await h.handler(post(payload))).status, 200);
  assert.deepEqual(Array.from(h.writes[1].values, v => v.event), ['installed', 'enabled']);
  h = harness({ subscribed: 1, permission: 'granted', teamId: 1, installedAt: new Date() });
  await h.handler(post(payload));assert.equal(h.writes.length, 1);
  await h.handler(post({ ...payload, subscribed: false, permission: 'denied', event: 'bell' }));
  assert.deepEqual(Array.from(h.writes.at(-1).values, v => v.event), ['bell', 'disabled', 'blocked']);
});
test('team checklist preserves on status across devices and distinguishes unknown from off', () => {
  const ctx = vm.createContext({});
  vm.runInContext(html.slice(html.indexOf('function notificationTeamStatus('), html.indexOf('function adminNotificationChecklist(')), ctx);
  assert.equal(ctx.notificationTeamStatus([]).status, 'Not observed');
  const off = { subscribed: 0, permission: 'denied', bellCount: 2, installedAt: null };
  const on = { subscribed: 1, permission: 'granted', bellCount: 1, installedAt: '2026-10-21' };
  const status = ctx.notificationTeamStatus([off, on]);
  assert.equal(status.status, 'On');assert.equal(status.enabled, 1);assert.equal(status.bells, 3);assert.equal(status.installed, true);
  assert.equal(ctx.notificationTeamStatus([off]).status, 'Blocked / off');
});
