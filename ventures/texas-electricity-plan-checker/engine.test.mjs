import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalisePlan, tieredEnergy, monthBill, averageCents, labelCheck, shapeFromLabel,
  compare, curve, cliffs, parseUsage, windowKwh, parseEFL, EXAMPLE, _internal,
} from './engine.mjs';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// Labels below are written for these tests in the layout EFLs use (an average
// price table, then the price components in sentences). They are not copies of
// any provider's label; the figures are invented and internally consistent.
const FLAT_CREDIT_EFL = `
Electricity Facts Label
Example Energy Co. Saver 12 Plan
Oncor Electric Delivery Service Area
Average Monthly Use 500 kWh 1,000 kWh 2,000 kWh
Average Price per kWh 21.0¢ 8.1¢ 14.1¢
Base Charge: $0.00 per billing cycle.
Energy Charge: 14.6¢ per kWh.
Oncor Delivery Charges: $4.50 per month and 5.5000¢ per kWh.
Usage Credit: $125.00 per billing cycle when usage is greater than or equal to 1,000 kWh and less than or equal to 2,000 kWh.
Contract Term: 12 months.
Early Termination Fee: $150.00.
`;

const TIERED_EFL = `
Example Power Two Step 24 plan
Average monthly use 500 kWh 1000 kWh 2000 kWh
Average price per kWh 16.6 cents 14.2 cents 16.3 cents
Energy Charge: 0 - 1,000 kWh 8.2¢ per kWh; > 1,000 kWh 12.9¢ per kWh
Minimum Usage Fee: $9.95 per billing cycle if usage is less than 1,000 kWh.
TDU Delivery Charges: $4.50 per month and 5.5¢ per kWh, passed through without mark-up.
Term: 24 months. Cancellation fee: $20 per remaining month of the term.
`;

const STACKED_EFL = `
Example Retail Stacked Credit Plan
Average Price per kWh 20.7¢ 16.2¢ 16.8¢
Base Charge $4.95 per month
Energy Charge 13.2¢ per kWh
CenterPoint delivery charges: $4.39 per month and 5.6¢ per kWh.
Residential Usage Credit: $35 per month for usage of 1,000 kWh or more, an additional $15 for 2,000 kWh or more.
`;

test('tiers are marginal: the second price applies only above the breakpoint', () => {
  const e = [{ upTo: 1000, cents: 8 }, { upTo: null, cents: 12 }];
  close(tieredEnergy(e, 500), 40);
  close(tieredEnergy(e, 1000), 80);
  close(tieredEnergy(e, 1500), 140);
});

test('a month bill adds base, energy, TDU, fees and subtracts credits met', () => {
  const plan = { base: 5, energy: [{ cents: 10 }], tduFixed: 4, tduCents: 5, credits: [{ amount: 50, min: 1000, max: 2000 }], fees: [{ amount: 10, below: 800 }] };
  const b700 = monthBill(plan, 700);
  close(b700.total, 5 + 70 + 4 + 35 + 10);
  const b1000 = monthBill(plan, 1000);
  close(b1000.total, 5 + 100 + 4 + 50 - 50);
  assert.deepEqual(b1000.creditsMet, [0]);
  close(monthBill(plan, 2000).credits, 50); // max is inclusive
  close(monthBill(plan, 2001).credits, 0);
});

test('every example plan reproduces its own label to the rounding', () => {
  for (const p of EXAMPLE.plans) assert.equal(labelCheck(p).status, 'match', p.name);
});

test('the label check catches a misread term', () => {
  const p = { ...EXAMPLE.plans[1], credits: [{ amount: 100, min: 1000, max: 2000 }] };
  const c = labelCheck(p);
  assert.equal(c.status, 'mismatch');
  assert.ok(c.rows.find((r) => r.kwh === 1000).diff > 2);
  assert.equal(labelCheck({ ...p, label: null }).status, 'no-label');
});

test('three label prices on one line are a plain plan; a dip at 1,000 kWh flags a credit', () => {
  const flat = shapeFromLabel(EXAMPLE.plans[0].label);
  assert.equal(flat.flag, 'straight');
  close(flat.fixedPerMonth, 14.45 + 0.2166, 0.5); // base + TDU fixed, recovered from rounded prices
  const credit = shapeFromLabel(EXAMPLE.plans[1].label);
  assert.equal(credit.flag, 'dip');
  // Exact arithmetic on a plan whose credit stops before 2,000 kWh: the dip is the credit.
  const p = normalisePlan({ base: 0, energy: [{ cents: 12 }], tduFixed: 5, tduCents: 5, credits: [{ amount: 60, min: 1000, max: 1500 }] });
  const lab = { 500: averageCents(p, 500), 1000: averageCents(p, 1000), 2000: averageCents(p, 2000) };
  close(shapeFromLabel(lab).dip, 60, 1e-9);
  assert.throws(() => shapeFromLabel({ 500: 1, 1000: 'x', 2000: 3 }), /three average prices/);
});

test('compare ranks by total over the usage and counts credit months', () => {
  const u = parseUsage(EXAMPLE.usage);
  assert.equal(u.months.length, 12);
  const r = compare(EXAMPLE.plans, u.months);
  for (let i = 1; i < r.length; i++) assert.ok(r[i].total >= r[i - 1].total);
  close(r[0].extra, 0);
  const b = r.find((x) => x.plan.name.startsWith('Example B'));
  // Months between 1,000 and 2,000 kWh inclusive in the example year.
  const inBand = u.months.filter((m) => m.kwh >= 1000 && m.kwh <= 2000).length;
  assert.equal(b.creditMonths, inBand);
  assert.equal(b.creditsMissed, 12 - inBand);
  close(b.total, b.rows.reduce((s, x) => s + x.total, 0));
});

test('a usage drop turns the credit plan from cheapest to dearest', () => {
  // Same example plans, a smaller household: every month 30% lower.
  const small = parseUsage(EXAMPLE.usage).months.map((m) => ({ ...m, kwh: Math.round(m.kwh * 0.7) }));
  const r = compare(EXAMPLE.plans, small);
  assert.ok(r[r.length - 1].plan.name.startsWith('Example B'), r.map((x) => x.plan.name).join(' / '));
});

test('cliffs list where the bill jumps; the curve covers the range', () => {
  const c = cliffs(EXAMPLE.plans[1]);
  assert.deepEqual(c.map((x) => x.kwh), [1000, 2000]);
  const pts = curve(EXAMPLE.plans[1], { from: 900, to: 1100, step: 100 });
  assert.equal(pts.length, 3);
  assert.ok(pts[1].total < pts[0].total); // the credit drops the bill at 1,000
});

test('usage: month names, ISO months and bare numbers', () => {
  assert.deepEqual(parseUsage('Jan 2025, 1,200\nFeb 2025 900').months.map((m) => [m.month, m.kwh]), [['2025-01', 1200], ['2025-02', 900]]);
  assert.deepEqual(parseUsage('2025-03 812\n2025-04\t790').months.map((m) => m.kwh), [812, 790]);
  const bare = parseUsage('1000\n1100\n1200');
  assert.equal(bare.months.length, 3);
  assert.match(bare.warnings[0], /3 months/);
  assert.throws(() => parseUsage('hello there 12 x'), /could not read/);
  assert.throws(() => parseUsage(''), /no usage/);
});

function smtCsv(days, kwhAt) {
  const lines = ['"ESIID","USAGE_DATE","REVISION_DATE","USAGE_START_TIME","USAGE_END_TIME","USAGE_KWH","ESTIMATED_ACTUAL","CONSUMPTION_SURPLUSGENERATION"'];
  for (const [y, mo, d] of days) {
    for (let q = 0; q < 96; q++) {
      const h = Math.floor(q / 4);
      const mi = (q % 4) * 15;
      const t = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
      const date = `${String(mo).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
      lines.push(`"1000000000000000000000","${date}","${date} 08:00:00","${t}","${t}","${kwhAt(h, y, mo, d).toFixed(3)}","A","Consumption"`);
      lines.push(`"1000000000000000000000","${date}","${date} 08:00:00","${t}","${t}","0.500","A","Surplus Generation"`);
    }
  }
  return lines.join('\n');
}

test('interval CSV: sums by month, drops export rows, bins by weekday and hour', () => {
  const days = [];
  for (let d = 1; d <= 30; d++) days.push([2025, 6, d]); // June 2025: 1 June is a Sunday
  const csv = smtCsv(days, (h) => (h >= 21 || h < 6 ? 0.5 : 0.25));
  const u = parseUsage(csv);
  assert.equal(u.kind, 'interval');
  assert.equal(u.months.length, 1);
  const m = u.months[0];
  // Per day: 9 night hours x 4 x 0.5 + 15 day hours x 4 x 0.25 = 18 + 15 = 33 kWh.
  close(m.kwh, 30 * 33, 1e-6);
  assert.match(u.warnings.join(' '), /surplus-generation/);
  // Weekend days in June 2025: 1,7,8,14,15,21,22,28,29 = 9.
  close(m.hours[1].reduce((s, x) => s + x, 0), 9 * 33, 1e-6);
  // A free-nights plan 9 p.m. to 6 a.m. every day captures 18 kWh a day.
  const plan = normalisePlan({ energy: [{ cents: 20 }], tou: [{ name: 'nights', days: 'all', start: 21, end: 6, cents: 0 }] });
  close(windowKwh(plan, m)[0], 30 * 18, 1e-6);
  const r = compare([plan], u.months);
  close(r[0].total, (30 * 15 * 20) / 100, 1e-6);
});

test('a time-of-use plan with monthly totals needs an assumed share', () => {
  const plan = { energy: [{ cents: 20 }], tou: [{ days: 'weekends', start: 0, end: 24, cents: 0 }] };
  assert.throws(() => monthBill(plan, 1000), /assumed share/);
  close(monthBill(plan, 1000, { touShare: 0.3 }).total, 700 * 0.2);
  const r = compare([plan], [{ month: 'x', kwh: 1000 }]);
  assert.match(r[0].error, /assumed share/);
  assert.equal(labelCheck({ ...plan, label: { 500: 1, 1000: 1, 2000: 1 } }).status, 'needs-share');
});

test('EFL text: a flat plan with a banded credit is read and matches its own label', () => {
  const { plan, found, notes } = parseEFL(FLAT_CREDIT_EFL);
  assert.equal(plan.base, 0);
  assert.deepEqual(plan.energy, [{ upTo: null, cents: 14.6 }]);
  assert.equal(plan.tduFixed, 4.5);
  assert.equal(plan.tduCents, 5.5);
  assert.deepEqual(plan.credits, [{ amount: 125, min: 1000, max: 2000 }]);
  assert.deepEqual(plan.label, { 500: 21, 1000: 8.1, 2000: 14.1 });
  assert.equal(plan.termMonths, 12);
  assert.equal(plan.etf, 150);
  assert.match(plan.name, /Saver 12 Plan/);
  assert.ok(found.tdu && found.credits && found.label);
  assert.deepEqual(notes, []);
  assert.equal(labelCheck(plan).status, 'match');
});

test('EFL text: tiers, a minimum-usage fee and "cents" spelled out', () => {
  const { plan, notes } = parseEFL(TIERED_EFL);
  assert.deepEqual(plan.energy, [{ upTo: 1000, cents: 8.2 }, { upTo: null, cents: 12.9 }]);
  assert.deepEqual(plan.fees, [{ amount: 9.95, below: 1000 }]);
  assert.deepEqual(plan.label, { 500: 16.6, 1000: 14.2, 2000: 16.3 });
  assert.equal(plan.termMonths, 24);
  assert.equal(plan.etf, 20);
  assert.match(notes.join(' '), /per remaining month/);
  assert.equal(labelCheck(plan).status, 'match');
});

test('EFL text: stacked credits ("an additional $15 for 2,000 kWh or more")', () => {
  const { plan } = parseEFL(STACKED_EFL);
  assert.deepEqual(plan.credits, [{ amount: 35, min: 1000, max: null }, { amount: 15, min: 2000, max: null }]);
  assert.equal(plan.base, 4.95);
  assert.equal(plan.tduFixed, 4.39);
  // The label was computed from these terms: check it reproduces.
  const c = labelCheck(plan);
  assert.equal(c.status, 'match', JSON.stringify(c.rows));
});

test('EFL text: a missing TDU line or price table is said, not guessed', () => {
  const { plan, notes } = parseEFL('Some Plan\nEnergy Charge: 12.0¢ per kWh');
  assert.equal(plan.tduCents, 0);
  assert.match(notes.join(' '), /no TDU delivery charges found/);
  assert.match(notes.join(' '), /no average price table/);
  assert.equal(labelCheck(plan).status, 'no-label');
});

test('EFL text: a free-nights window is read with its hours', () => {
  const { plan } = parseEFL('Night Owl plan\nEnergy Charge: 18.5¢ per kWh\nNight Energy Charge: 0.0¢ per kWh from 9:00 p.m. to 6:00 a.m. every day');
  assert.equal(plan.tou.length, 1);
  assert.equal(plan.tou[0].start, 21);
  assert.equal(plan.tou[0].end, 6);
  assert.equal(plan.tou[0].cents, 0);
  assert.deepEqual(plan.energy, [{ upTo: null, cents: 18.5 }]);
});

test('bounds: "more than N" means N+1 billed kWh; between X and Y is inclusive', () => {
  assert.equal(_internal.lowerBound('when usage is more than 999 kWh'), 1000);
  assert.equal(_internal.lowerBound('for usage between 1,000 and 1,999 kWh'), 1000);
  assert.equal(_internal.upperBound('for usage between 1,000 and 1,999 kWh'), 1999);
  assert.equal(_internal.lowerBound('nothing here'), null);
});

test('plan validation names the problem', () => {
  assert.throws(() => normalisePlan({ energy: [{ upTo: null, cents: 5 }, { upTo: null, cents: 6 }] }), /only the last/);
  assert.throws(() => normalisePlan({ energy: [{ cents: 'x' }] }), /energy charge/);
  assert.throws(() => normalisePlan({ tou: [{ start: 5, end: 5, cents: 1 }] }), /time-of-use/);
  assert.throws(() => monthBill({ energy: [{ cents: 1 }] }, -1), /non-negative/);
});

// Red team 2026-11-14: "[\d,]+" read a "1,,0" usage line as 10 kWh and "," as a 0 kWh month.
test('usage lines with a malformed kWh figure are errors, not silent wrong months', () => {
  assert.throws(() => parseUsage('1200\n1,,0'), /could not read/);
  assert.throws(() => parseUsage('2025-01, 1,,200'), /could not read/);
  assert.throws(() => parseUsage('Jan, 1.2.3'), /could not read/);
  assert.deepEqual(parseUsage('2025-01, 1,200\n2025-02,1100,150.25\nMar 2025 980').months.map((m) => m.kwh), [1200, 1100, 980]);
  assert.deepEqual(parseUsage('1,234\n987.5').months.map((m) => m.kwh), [1234, 987.5]);
});
