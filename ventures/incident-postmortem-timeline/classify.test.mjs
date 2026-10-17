import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLog, analyze, inferPhase, fmtDuration, summaryLine, toMarkdown } from './classify.mjs';

const LOG = `2026-10-03 14:02 deployed v412 to production
14:09 PagerDuty alert fired: checkout 5xx
14:12 Dana acknowledged, investigating
14:51 rolled back v412
15:05 error rate back to normal, incident closed`;

test('infers phases from plain wording', () => {
  assert.equal(inferPhase('PagerDuty alert fired'), 'detected');
  assert.equal(inferPhase('Dana acknowledged'), 'acknowledged');
  assert.equal(inferPhase('rolled back v412'), 'mitigated');
  assert.equal(inferPhase('incident closed'), 'resolved');
  assert.equal(inferPhase('lunch'), null);
});

test('computes the four response metrics', () => {
  const r = analyze(LOG);
  assert.equal(r.metrics.ttd, 7 * 60);
  assert.equal(r.metrics.tta, 3 * 60);
  assert.equal(r.metrics.ttm, 49 * 60);
  assert.equal(r.metrics.ttr, 63 * 60);
  assert.equal(r.startEstimated, false);
  assert.deepEqual(r.missing, []);
});

test('time-only lines crossing midnight roll the day forward', () => {
  const r = analyze('2026-10-03 23:50 deployed bad config\n23:58 alert fired\n00:20 rolled back\n00:30 resolved');
  assert.equal(r.metrics.ttr, 40 * 60);
});

test('explicit tags override inference', () => {
  const { events } = parseLog('10:00 start: cert expired\n10:05 detected: users complained');
  assert.equal(events[0].phase, 'start');
  assert.equal(events[0].text, 'cert expired');
  assert.equal(events[1].phase, 'detected');
});

test('missing start falls back to the first line and says so', () => {
  const r = analyze('10:00 alert fired\n10:30 resolved');
  assert.equal(r.startEstimated, true);
  assert.equal(r.metrics.ttr, 30 * 60);
  assert.deepEqual(r.missing, ['acknowledged', 'mitigated']);
});

test('lines without timestamps are reported, not silently dropped', () => {
  const r = analyze('10:00 deployed\nsome note\n10:10 resolved');
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].line, 2);
});

test('rejects too little input and invalid times', () => {
  assert.match(analyze('10:00 only one').error, /at least two/);
  assert.equal(parseLog('25:00 nope').problems[0].reason, 'invalid time');
});

test('flags long silent gaps, largest first', () => {
  const r = analyze(LOG);
  assert.equal(r.gaps[0].seconds, 39 * 60);
});

test('timezone offsets are honoured', () => {
  const r = analyze('2026-10-03 10:00+02:00 deployed\n2026-10-03 08:30Z resolved');
  assert.equal(r.metrics.ttr, 30 * 60);
});

test('formats durations and the summary line', () => {
  assert.equal(fmtDuration(45), '45s');
  assert.equal(fmtDuration(3900), '1h 5m');
  assert.equal(fmtDuration(null), 'n/a');
  assert.match(summaryLine(analyze(LOG)), /Resolve 1h 3m/);
});

test('markdown draft has the postmortem sections and escapes pipes', () => {
  const md = toMarkdown(analyze('10:00 deployed a|b\n10:30 resolved'), 'Checkout outage');
  for (const h of ['# Postmortem: Checkout outage', '## Response metrics', '## Timeline', '## Root cause', '## Action items']) assert.ok(md.includes(h), h);
  assert.ok(md.includes('a\\|b'));
});
