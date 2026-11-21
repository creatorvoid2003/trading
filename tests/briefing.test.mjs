import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBriefing } from '../server/briefing.mjs';

test('parses fenced/wrapped JSON and sanitises fields', () => {
  const txt = 'Here you go:\n```json\n' + JSON.stringify({
    summary: 'Fed week.', risk_level: 'extreme',
    events: [
      { title: 'US CPI', status: 'upcoming', when_utc: '2026-11-25T13:30:00Z', category: 'data', impact: 'high',
        gold: { bias: 'bearish', why: 'Hot CPI lifts yields.' }, stocks: { bias: 'wat', why: 'x' }, scenario: 'Hot: down. Soft: up.', source: 'javascript:alert(1)' },
      { title: '', impact: 'high' },
      { title: 'Bad date', when_utc: 'not a date', source: 'https://example.com/x' },
    ],
    watch_out: ['a', 'b', 'c', 'd'],
  }) + '\n```';
  const b = parseBriefing(txt);
  assert.equal(b.risk_level, 'medium'); // invalid enum falls back
  assert.equal(b.events.length, 2); // empty title dropped
  assert.equal(b.events[0].when_utc, '2026-11-25T13:30:00.000Z');
  assert.equal(b.events[0].stocks.bias, 'neutral');
  assert.equal(b.events[0].source, null); // non-http link rejected
  assert.equal(b.events[1].when_utc, null);
  assert.equal(b.events[1].source, 'https://example.com/x');
  assert.equal(b.watch_out.length, 3);
});

test('caps events at 8 and truncates long text', () => {
  const events = Array.from({ length: 12 }, (_, i) => ({ title: 'E' + i, scenario: 'x'.repeat(1000) }));
  const b = parseBriefing(JSON.stringify({ summary: 's', events }));
  assert.equal(b.events.length, 8);
  assert.equal(b.events[0].scenario.length, 280);
});

test('throws when no JSON present', () => {
  assert.throws(() => parseBriefing('sorry, no data'));
});
