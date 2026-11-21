import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvents, matchEvents, eventsText } from './events.mjs';
import { main as cliMain } from './cli.mjs';

const days = (from, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));

test('parseEvents: header, one-day events, quoted labels, comments; errors name the line', () => {
  const e = parseEvents('start,end,label\n# a comment\n2025-03-13,2025-03-27,"March 2025 core update"\n2025-06-30,,release 2.0\n2025-07-01,price, up 10%\n');
  assert.deepEqual(e, [
    { start: '2025-03-13', end: '2025-03-27', label: 'March 2025 core update' },
    { start: '2025-06-30', end: '2025-06-30', label: 'release 2.0' },
    { start: '2025-07-01', end: '2025-07-01', label: 'price, up 10%' },
  ]);
  assert.throws(() => parseEvents('2025-03-13,2025-03-01,x'), /line 1: the end 2025-03-01 is before/);
  assert.throws(() => parseEvents('2025-01-01,a\nMarch,b'), /line 2: the first field must be a date/);
  assert.throws(() => parseEvents('start,end\n'), /no events/);
});

test('matchEvents: overlap with the 95% range, slack, the chance figure and events with no change', () => {
  const labels = days('2025-01-01', 100); // 2025-01-01 .. 2025-04-10
  const events = parseEvents('2025-02-10,2025-02-19,A\n2025-03-20,,B\n2026-01-01,,outside\n');
  const changes = [
    { index: 38, label: labels[38], range95: { fromIndex: 37, toIndex: 40 } }, // 02-07 .. 02-10: touches A
    { index: 76, label: labels[76], range95: { fromIndex: 76, toIndex: 76 } }, // 03-18: misses B by 2 days
  ];
  const r = matchEvents({ labels, changes, events });
  assert.deepEqual(r.changes.map((c) => c.events.map((e) => e.label)), [['A'], []]);
  assert.equal(r.eventsInSeries, 2);
  assert.equal(r.coveredShare, 0.11); // 10 days of A and 1 of B in 100
  // Width 3: places 0..96 (97); A is indices 40..49, so starts 37..49 overlap it (13); B is 78: starts 75..78 (4) = 17
  assert.equal(r.changes[0].chance, Number((17 / 97).toFixed(3)));
  assert.equal(r.changes[1].chance, 0.11);
  assert.deepEqual(r.unmatchedEvents.map((e) => e.label), ['B']);
  const wide = matchEvents({ labels, changes, events, slack: 2 });
  assert.deepEqual(wide.changes[1].events.map((e) => e.label), ['B']);
  assert.equal(wide.unmatchedEvents.length, 0);
  assert.match(eventsText(r), /inside A \(2025-02-10 to 2025-02-19\)/);
  assert.match(eventsText(r), /03-18 \(2025-03-18\): no event/);
  assert.throws(() => matchEvents({ labels: ['1', '2'], changes: [], events }), /dated YYYY-MM-DD/);
});

test('cli refuses --events where it cannot apply it, and --event-slack alone', async () => {
  await assert.rejects(cliMain(['--example', '--event-slack', '2']), /goes with --events/);
  await assert.rejects(cliMain(['x.csv', '--events', 'e.csv', '--columns', 'a,b']), /one column and a single model/);
});
