import test from 'node:test';
import assert from 'node:assert/strict';
import { upcomingAlerts } from '../src/alerts.ts';
import { holidayName, earlyCloseName } from '../src/holidays.ts';
import { zoneAt, zonedToUtc, marketOpen, windowsAround, stockView, goldView } from '../src/sessions.ts';

const utc = (s: string) => Date.parse(s);

test('London+NY overlap is PRIME in winter (13:00-17:00 UTC)', () => {
  const z = zoneAt(utc('2026-01-14T14:00:00Z'));
  assert.equal(z.level, 'prime');
  assert.deepEqual(z.active.sort(), ['london', 'newyork']);
});

test('overlap shifts in summer: 12:00-16:00 UTC', () => {
  assert.equal(zoneAt(utc('2026-07-15T12:30:00Z')).level, 'prime');
  assert.notEqual(zoneAt(utc('2026-07-15T16:30:00Z')).level, 'prime');
});

test('DST gap weeks: US switched, UK not (Mar 2026)', () => {
  // US DST began Mar 8; UK on Mar 29. NY open 08:00 EDT = 12:00 UTC, London close 17:00 GMT = 17:00 UTC.
  const z = zoneAt(utc('2026-03-16T12:30:00Z'));
  assert.equal(z.level, 'prime');
});

test('zonedToUtc handles offsets', () => {
  assert.equal(zonedToUtc('America/New_York', 2026, 0, 14, 8, 0), utc('2026-01-14T13:00:00Z'));
  assert.equal(zonedToUtc('America/New_York', 2026, 6, 14, 8, 0), utc('2026-07-14T12:00:00Z'));
  assert.equal(zonedToUtc('Asia/Tokyo', 2026, 0, 14, 9, 0), utc('2026-01-14T00:00:00Z'));
});

test('weekend closed', () => {
  assert.equal(marketOpen(utc('2026-01-17T12:00:00Z')), false); // Sat
  assert.equal(marketOpen(utc('2026-01-16T23:00:00Z')), false); // Fri 18:00 NY
  assert.equal(marketOpen(utc('2026-01-18T23:00:00Z')), true); // Sun 18:00 NY
  assert.equal(zoneAt(utc('2026-01-17T12:00:00Z')).level, 'closed');
});

test('rollover caution and next change', () => {
  const z = zoneAt(utc('2026-01-14T22:10:00Z')); // 17:10 NY
  assert.ok(z.caution);
  const p = zoneAt(utc('2026-01-14T14:00:00Z'));
  assert.ok(p.nextChangeAt! > utc('2026-01-14T14:00:00Z'));
});

test('windows cover multiple days', () => {
  assert.ok(windowsAround(utc('2026-01-14T00:00:00Z')).length >= 20);
});

test('gold rating follows zone', () => {
  assert.equal(zoneAt(utc('2026-01-14T14:00:00Z')).gold.rating, 'best');
  assert.equal(goldView('quiet').rating, 'avoid');
});

test('stock phases (NY time, winter)', () => {
  assert.equal(stockView(utc('2026-01-14T14:35:00Z')).phase, 'opening'); // 09:35 ET
  assert.equal(stockView(utc('2026-01-14T17:00:00Z')).phase, 'midday'); // 12:00 ET
  assert.equal(stockView(utc('2026-01-14T20:30:00Z')).phase, 'power'); // 15:30 ET
  assert.equal(stockView(utc('2026-01-17T15:00:00Z')).phase, 'closed'); // Sat
  const v = stockView(utc('2026-01-14T14:35:00Z'));
  assert.equal(v.nextAt, utc('2026-01-14T15:00:00Z'));
});

test('stocks closed Friday night, reopen Monday pre-market', () => {
  const v = stockView(utc('2026-01-17T15:00:00Z'));
  assert.equal(v.nextAt, utc('2026-01-20T09:00:00Z')); // Mon Jan 19 is MLK Day -> Tue 04:00 ET
});

test('NYSE holidays 2026', () => {
  assert.equal(holidayName(2026, 10, 26), 'Thanksgiving');
  assert.equal(holidayName(2026, 3, 3), 'Good Friday'); // Apr 3 2026
  assert.equal(holidayName(2026, 6, 3), 'Independence Day'); // Jul 4 is Sat -> Fri Jul 3
  assert.equal(holidayName(2026, 11, 25), 'Christmas');
  assert.equal(holidayName(2026, 0, 1), "New Year's Day");
  assert.equal(holidayName(2026, 0, 19), 'Martin Luther King Jr. Day');
  assert.equal(holidayName(2026, 4, 25), 'Memorial Day');
  assert.equal(holidayName(2026, 8, 7), 'Labor Day');
  assert.equal(earlyCloseName(2026, 10, 27), 'Day after Thanksgiving');
  assert.equal(earlyCloseName(2026, 11, 24), 'Christmas Eve');
  assert.equal(holidayName(2022, 11, 31), null); // NYSE did not close Dec 31 2021 for New Year's on Sat
  assert.equal(holidayName(2027, 11, 31), null);
});

test('stocks closed on Thanksgiving, early close next day', () => {
  assert.equal(stockView(utc('2026-11-26T15:00:00Z')).phase, 'closed');
  assert.match(stockView(utc('2026-11-26T15:00:00Z')).note!, /Thanksgiving/);
  assert.equal(stockView(utc('2026-11-27T17:00:00Z')).phase, 'midday'); // 12:00 ET
  assert.equal(stockView(utc('2026-11-27T18:30:00Z')).phase, 'afterhours'); // 13:30 ET
  assert.equal(stockView(utc('2026-11-27T22:30:00Z')).phase, 'closed'); // 17:30 ET
});

test('alerts: sorted, in the future, skip holidays', () => {
  const now = utc('2026-11-24T00:00:00Z');
  const a = upcomingAlerts(now, 4);
  assert.ok(a.length > 0);
  assert.ok(a.every((x, i) => x.at > now && (i === 0 || a[i - 1].at <= x.at)));
  const thanks = a.filter((x) => x.title.startsWith('US stocks') && Math.abs(x.eventAt - utc('2026-11-26T14:30:00Z')) < 3600_000);
  assert.equal(thanks.length, 0);
  assert.ok(a.some((x) => x.title === 'US stocks: opening drive'));
  assert.ok(a.some((x) => x.title === 'Prime zone starts'));
});
