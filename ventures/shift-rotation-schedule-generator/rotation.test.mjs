import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, PATTERN_KEYS, shiftOn, buildDays, coverage, stats, compare, fitSchedule, toIcs, parseDate } from './rotation.mjs';

test('every pattern covers every day with exactly one day crew (and one night crew where needed)', () => {
  for (const k of PATTERN_KEYS) {
    const c = coverage(k);
    assert.ok(c.ok, `${k}: ${JSON.stringify(c.gaps)}`);
  }
});

test('all crews in a pattern share one cycle length', () => {
  for (const [k, p] of Object.entries(PATTERNS)) {
    assert.equal(new Set(p.crews.map(([, c]) => c.length)).size, 1, k);
  }
});

test('Pitman: 42 h/week average, 3 shifts max in a row, but a 5-shift (60 h) week occurs', () => {
  const s = stats('pitman', 'A');
  assert.equal(s.hoursPerWeek, 42);
  assert.equal(s.longestRun, 3);
  assert.equal(s.longestBreak, 3);
  assert.equal(s.maxHoursIn7Days, 60); // a 3-shift block and the 2-shift block either side of a 2-day gap
});

test('4-on-4-off: 42 h/week, 4 in a row, 48 h max week is 4 shifts', () => {
  const s = stats('4on4off', 'A');
  assert.equal(s.hoursPerWeek, 42);
  assert.equal(s.longestRun, 4);
  assert.equal(s.maxHoursIn7Days, 48);
  assert.equal(s.daysOffPerYear, 183);
});

test('DuPont averages 42 h/week and has a 7-day break', () => {
  const s = stats('dupont', 'A');
  assert.equal(s.hoursPerWeek, 42);
  assert.equal(s.longestBreak, 7);
  assert.equal(s.cycleDays, 28);
});

test('24/48 averages 56 h/week', () => {
  assert.equal(stats('24-48', 'A').hoursPerWeek, 56);
  assert.equal(stats('48-96', 'A').hoursPerWeek, 56);
});

test('Pitman gives every other weekend off in a full 12-hour pattern', () => {
  assert.equal(stats('pitman', 'A').fullWeekendsOffPerYear, 26);
});

test('weekend count does not depend on which crew you look at in 24/48', () => {
  const [a, b, c] = ['A', 'B', 'C'].map((n) => stats('24-48', n).fullWeekendsOffPerYear);
  assert.equal(a, b); assert.equal(b, c);
});

test('shiftOn and buildDays agree, and the anchor day is cycle day 1', () => {
  const days = buildDays('pitman', 'A', '2026-10-12', '2026-10-12', 14);
  assert.equal(days[0].pos, 1);
  assert.equal(days.map((d) => d.shift).join(''), 'DD--DDD--DD---');
  for (const d of days) assert.equal(shiftOn('pitman', 'A', '2026-10-12', d.date), d.shift);
});

test('dates before the anchor still work (negative modulo)', () => {
  assert.equal(shiftOn('pitman', 'A', '2026-10-12', '2026-10-11'), '-');
  assert.equal(shiftOn('pitman', 'A', '2026-10-12', '2026-09-28'), 'D');
});

test('the same schedule survives a daylight-saving change', () => {
  const days = buildDays('4on4off', 'A', '2026-10-01', '2026-10-25', 14);
  assert.equal(days.length, 14);
  assert.equal(days[0].date, '2026-10-25');
  assert.equal(days[7].date, '2026-11-01');
});

test('fitSchedule finds the crew from remembered dates, and reports ambiguity', () => {
  const truth = buildDays('pitman', 'B', '2026-03-02', '2026-03-02', 30);
  const worked = truth.filter((d) => d.shift === 'D').slice(0, 2).map((d) => ({ date: d.date, shift: 'D' }));
  const loose = fitSchedule('pitman', worked);
  assert.ok(loose.length > 1);
  const more = truth.slice(0, 10).map((d) => ({ date: d.date, shift: d.shift }));
  const tight = fitSchedule('pitman', more);
  assert.equal(tight.length, 1);
  assert.equal(shiftOn('pitman', tight[0].crew, tight[0].anchor, '2026-03-20'), truth[18].shift);
});

test('fitSchedule rejects an empty observation list and bad dates', () => {
  assert.throws(() => fitSchedule('pitman', []), /at least one/);
  assert.throws(() => parseDate('2026-02-30'), /real date/);
  assert.throws(() => parseDate('10/12/2026'), /YYYY-MM-DD/);
});

test('ICS: night shift ends the next morning, 24h shift ends the next day, CRLF endings, valid structure', () => {
  const days = buildDays('4on4off', 'C', '2026-10-12', '2026-10-12', 3);
  const ics = toIcs(days, { patternKey: '4on4off', crewName: 'C', now: new Date('2026-10-01T00:00:00Z') });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /DTSTART:20261012T190000\r\nDTEND:20261013T070000/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  const fire = toIcs(buildDays('24-48', 'A', '2026-10-12', '2026-10-12', 3), { patternKey: '24-48', crewName: 'A', now: new Date('2026-10-01T00:00:00Z') });
  assert.match(fire, /DTSTART:20261012T070000\r\nDTEND:20261013T070000/);
  assert.equal((fire.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test('ICS uids are unique and stable', () => {
  const days = buildDays('pitman', 'A', '2026-10-12', '2026-10-12', 28);
  const a = toIcs(days, { patternKey: 'pitman', crewName: 'A', now: new Date(0) });
  const uids = [...a.matchAll(/UID:(.*)\r\n/g)].map((m) => m[1]);
  assert.equal(new Set(uids).size, uids.length);
  assert.equal(a, toIcs(days, { patternKey: 'pitman', crewName: 'A', now: new Date(0) }));
});

test('ICS rejects a malformed start time', () => {
  assert.throws(() => toIcs([], { patternKey: 'pitman', crewName: 'A', dayStart: '7am' }), /HH:MM/);
});

test('unknown pattern or crew names say what is valid', () => {
  assert.throws(() => stats('nope'), /Choose one of/);
  assert.throws(() => stats('pitman', 'Z'), /use A, B, C, D/);
});

test('compare lists every pattern', () => {
  assert.equal(compare().length, PATTERN_KEYS.length);
});
