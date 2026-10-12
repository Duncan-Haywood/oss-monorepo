import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, addDays, rollWeekend, parseDate, parsePatents, parseFees, stageDates, stageStatus, planPortfolio,
  toCsv, toIcs, encodeState, decodeState, DEFAULT_FEE_TEXT, STAGES, daysBetween,
} from './calc.mjs';

const plan = (patents, extra = {}) => planPortfolio({ asOf: '2026-10-12', patents, fees: DEFAULT_FEE_TEXT, ...extra });

test('month arithmetic clamps to the end of a short month', () => {
  assert.equal(addMonths('2021-08-31', 6), '2022-02-28');
  assert.equal(addMonths('2019-08-31', 54), '2024-02-29'); // leap year
  assert.equal(addMonths('2020-01-07', 42), '2023-07-07');
  assert.equal(addMonths('2020-12-15', 1), '2021-01-15');
});

test('weekend deadlines roll to Monday, weekdays are untouched', () => {
  assert.equal(rollWeekend('2026-10-10'), '2026-10-12'); // Saturday
  assert.equal(rollWeekend('2026-10-11'), '2026-10-12'); // Sunday
  assert.equal(rollWeekend('2026-10-12'), '2026-10-12'); // Monday
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('dates parse from ISO and US format and reject impossible days', () => {
  assert.equal(parseDate('2021-04-06'), '2021-04-06');
  assert.equal(parseDate('4/6/2021'), '2021-04-06');
  assert.throws(() => parseDate('2021-02-30'), /real calendar date/);
  assert.throws(() => parseDate('soon'), /not a date/);
});

test('stage dates for a patent granted 2021-04-06 (a Tuesday)', () => {
  const d = stageDates('2021-04-06', STAGES[0]);
  assert.deepEqual(d, { opens: '2024-04-06', due: '2024-10-07', graceEnds: '2025-04-07', expiresIfUnpaid: '2025-04-06' });
  // 2024-10-06 and 2025-04-06 are Sundays, so both deadlines roll to the Monday; expiry stays on the anniversary.
});

test('status boundaries: the due date itself is still without surcharge, the day after carries it', () => {
  const d = stageDates('2020-01-07', STAGES[0]); // opens 2023-01-07, due 2023-07-07 (Fri), grace 2024-01-08 (7th is Sun)
  assert.equal(stageStatus('2023-01-06', d), 'upcoming');
  assert.equal(stageStatus('2023-01-07', d), 'window-open');
  assert.equal(stageStatus('2023-07-07', d), 'window-open');
  assert.equal(stageStatus('2023-07-08', d), 'surcharge');
  assert.equal(stageStatus('2024-01-07', d), 'surcharge');
  assert.equal(stageStatus('2024-01-08', d), 'surcharge');
  assert.equal(stageStatus('2024-01-09', d), 'past');
});

test('patent list parsing: labels with commas, entity default, drop flag', () => {
  const p = parsePatents('US 9,000,001, 2021-04-06, small\nRE12345 2019-05-07 micro drop\n10500000, 1/7/2020');
  assert.deepEqual(p, [
    { label: 'US 9,000,001', grantDate: '2021-04-06', entity: 'small', drop: false },
    { label: 'RE12345', grantDate: '2019-05-07', entity: 'micro', drop: true },
    { label: '10500000', grantDate: '2020-01-07', entity: 'large', drop: false },
  ]);
  assert.throws(() => parsePatents('no date here'), /Line 1/);
  assert.throws(() => parsePatents(''), /at least one patent/);
});

test('fee table parsing rejects a missing entity or a malformed line', () => {
  const f = parseFees(DEFAULT_FEE_TEXT);
  assert.deepEqual(f.small, { stage: [860, 1616, 3312], surcharge: 216 });
  assert.throws(() => parseFees('large, 1, 2, 3, 4\nsmall, 1, 2, 3, 4'), /no "micro"/);
  assert.throws(() => parseFees('large, 1, 2, 3'), /expected entity/);
  assert.throws(() => parseFees('huge, 1, 2, 3, 4'), /large, small or micro/);
  assert.throws(() => parseFees('large, x, 2, 3, 4'), /non-negative/);
});

test('a patent with its first fee in the open window shows amount and days to due', () => {
  // granted 2023-05-02: window opened 2026-05-02, due 2026-11-02 (Mon). As of 2026-10-12 that is 21 days.
  const r = plan('A, 2023-05-02, small');
  const n = r.rows[0].next;
  assert.equal(n.status, 'window-open');
  assert.equal(n.due, '2026-11-02');
  assert.equal(n.daysToDue, 21);
  assert.equal(n.amount, 860);
  assert.equal(n.surcharge, 0);
  assert.equal(r.counts.windowOpen, 1);
});

test('a missed due date moves to the surcharge period and adds the entity surcharge', () => {
  // granted 2023-02-07: due 2026-08-07 (Fri) passed; grace ends 2027-02-08 (Mon, since 02-07 is Sunday).
  const r = plan('B, 2023-02-07, large');
  const n = r.rows[0].next;
  assert.equal(n.status, 'surcharge');
  assert.equal(n.graceEnds, '2027-02-08');
  assert.equal(n.amount, 2150 + 540);
  assert.equal(n.surcharge, 540);
  assert.equal(r.surchargeExposure, 540);
  assert.equal(r.counts.surcharge, 1);
});

test('fees whose grace period ended before the as-of date are assumed paid', () => {
  // granted 2012-02-14: all three grace periods ended by 2024-02, so nothing remains.
  const r = plan('old, 2012-02-14, large');
  assert.equal(r.rows[0].complete, true);
  assert.equal(r.counts.complete, 1);
  assert.equal(r.budgetTotal, 0);
});

test('a mid-life patent skips earlier stages and lists every remaining fee', () => {
  // granted 2019-03-05: fee 1 (2022-09) and fee 2 (2026-09 due, grace 2027-03-05) -> as of 2026-10-12 fee 2 is in surcharge; fee 3 due 2030-09-05.
  const r = plan('C, 2019-03-05, micro');
  assert.equal(r.rows[0].next.fee, '7.5-year');
  assert.equal(r.rows[0].next.status, 'surcharge');
  assert.equal(r.rows[0].next.amount, 808 + 108);
  assert.deepEqual(r.rows[0].remainingFees.map((f) => f.fee), ['7.5-year', '11.5-year']);
  assert.equal(r.rows[0].remainingTotal, 808 + 1656);
});

test('budget: a surcharge fee lands on the as-of year, others on their due year, dropped patents are excluded and priced as savings', () => {
  const r = plan('keep, 2023-05-02, small\ndropme, 2023-05-02, large, drop', { horizonYears: 5 });
  // keep: 860 due 2026-11-02; 7.5-year due 2030-11-04 is beyond the 5-year horizon (2031-10-12)? 2030 < 2031 so included: 1616.
  assert.deepEqual(r.yearly, [{ year: '2026', amount: 860 }, { year: '2030', amount: 1616 }]);
  assert.equal(r.budgetTotal, 860 + 1616);
  assert.equal(r.droppedSavings, 2150 + 4040);
});

test('horizon cuts off later fees', () => {
  const r = plan('keep, 2023-05-02, small', { horizonYears: 1 });
  assert.equal(r.budgetTotal, 860);
});

test('urgent list holds open and surcharge patents plus those opening within the warning window, soonest first, never dropped ones', () => {
  const r = plan('late, 2023-02-07, large\nopen, 2023-05-02, small\nsoon, 2023-12-20, small\nfar, 2025-01-15, small\ngone, 2023-02-07, large, drop', { warnDays: 90 });
  // soon: opens 2026-12-20 = 69 days away -> inside 90. far: opens 2028-01-15 -> outside.
  assert.deepEqual(r.urgent.map((u) => u.label), ['late', 'open', 'soon']);
});

test('validation: pre-1980 grants, future grants, bad horizon', () => {
  assert.throws(() => plan('x, 1979-01-02, large'), /no maintenance fees/);
  assert.throws(() => plan('x, 2027-01-05, large'), /after the as-of date/);
  assert.throws(() => plan('x, 2023-05-02', { horizonYears: 0 }), /horizon/i);
  assert.throws(() => plan('x, 2023-05-02', { warnDays: -1 }), /Reminder lead time/);
});

test('rows sort by next due date with completed patents last', () => {
  const r = plan('old, 2012-02-14, large\nB, 2023-05-02, small\nA, 2023-02-07, large');
  assert.deepEqual(r.rows.map((x) => x.label), ['A', 'B', 'old']);
});

test('CSV has one row per patent plus the yearly budget, and quotes commas', () => {
  const csv = toCsv(plan('US 9,000,001, 2023-05-02, small'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0].split(',')[0], 'patent');
  assert.match(lines[1], /^"US 9,000,001",2023-05-02,small,no,3\.5-year,window-open,2026-05-02,2026-11-02,2027-05-03,2027-05-02,860$/);
  assert.ok(lines.includes('year,planned_fees_kept_patents'));
});

test('ICS has a reminder and a last-day event per upcoming fee, none for surcharge or dropped patents', () => {
  const ics = toIcs(plan('open, 2023-05-02, small\nlate, 2023-02-07, large\ngone, 2023-05-02, large, drop', { warnDays: 14 }));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /DTSTART;VALUE=DATE:20261019/); // 14 days before 2026-11-02
  assert.match(ics, /DTSTART;VALUE=DATE:20261102/);
  assert.doesNotMatch(ics, /late|gone/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('ICS never schedules a reminder in the past', () => {
  const ics = toIcs(plan('open, 2023-05-02, small', { warnDays: 90 }));
  assert.match(ics, /DTSTART;VALUE=DATE:20261012/);
});

test('share state round-trips multi-line fields', () => {
  const v = { asOf: '2026-10-12', horizonYears: '5', warnDays: '90', patents: 'A, 2023-05-02, small\nB, 2020-01-07, large', fees: DEFAULT_FEE_TEXT };
  assert.deepEqual(decodeState(encodeState(v)), v);
  assert.deepEqual(decodeState('garbage'), {});
});

test('daysBetween counts across a leap day', () => {
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2);
});
