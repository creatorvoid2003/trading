import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(v.nextAt, utc('2026-01-19T09:00:00Z')); // Mon 04:00 ET
});
