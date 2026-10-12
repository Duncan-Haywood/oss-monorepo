import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents, formatMoney, buildingBasis, depreciation, propertyDepreciation, scheduleE, passiveLoss, collection, vendors1099, checks, scheduleECsv, importRows, csvEscape, parseCsv } from "./calc.mjs";

const house = { id: "p1", name: "12 Oak St", priceCents: 30000000, closingCents: 500000, landCents: 5500000, inService: "2026-03-10", monthlyRentCents: 200000 };
const data = () => ({
  properties: [house],
  entries: [
    ...Array.from({ length: 10 }, (_, i) => ({ id: "r" + i, date: `2026-${String(i + 3).padStart(2, "0")}-01`, property: "p1", type: "rent", cents: 200000 })),
    { id: "e1", date: "2026-04-02", property: "p1", type: "expense", category: "insurance", cents: 120000, vendor: "Acme Ins" },
    { id: "e2", date: "2026-05-02", property: "p1", type: "expense", category: "repairs", cents: 90000, vendor: "Joe Plumbing" },
    { id: "e3", date: "2026-06-02", property: "p1", type: "expense", category: "repairs", cents: 150000, vendor: "joe plumbing" },
    { id: "e4", date: "2026-07-02", property: "p1", type: "expense", category: "mortgage_interest", cents: 800000 },
    { id: "d1", date: "2026-03-01", property: "p1", type: "deposit", cents: 200000 },
    { id: "m1", date: "2026-07-02", property: "p1", type: "principal", cents: 300000 },
  ],
});

test("money parsing and formatting", () => {
  assert.equal(toCents("$1,234.56"), 123456);
  assert.equal(toCents(""), 0);
  assert.equal(toCents("abc"), 0);
  assert.equal(formatMoney(123456), "$1,234.56");
});

test("building basis is price plus closing costs minus land", () => {
  assert.equal(buildingBasis(house), 25000000);
  assert.equal(buildingBasis({ priceCents: 100, landCents: 500 }), 0);
});

test("depreciation: mid-month first year, 1/27.5 afterwards, never past basis", () => {
  // IRS Table A-6: March placed in service, year 1 = 2.879%
  assert.equal(depreciation(27500000, "2026-03-10", 2026), 791667);
  assert.equal(depreciation(27500000, "2026-03-10", 2027), 1000000);
  assert.equal(depreciation(27500000, "2025-12-01", 2024), 0);
  let sum = 0;
  for (let y = 2026; y <= 2060; y++) sum += depreciation(27500000, "2026-03-10", y);
  assert.equal(sum, 27500000);
  assert.equal(depreciation(27500000, "2026-03-10", 2060), 0);
  assert.equal(depreciation(0, "2026-03-10", 2026), 0);
  assert.equal(depreciation(1000, "nope", 2026), 0);
});

test("a January placement gets the full 3.485% in year one", () => {
  assert.equal(depreciation(100000000, "2026-01-15", 2026), Math.round((100000000 * 11.5) / 330));
});

test("improvements depreciate from their own date", () => {
  const entries = [{ property: "p1", type: "improvement", date: "2026-09-05", cents: 1100000 }];
  const d = propertyDepreciation(house, entries, 2026);
  assert.equal(d.improvements, Math.round((1100000 * 3.5) / 330));
  assert.equal(d.total, d.building + d.improvements);
  assert.equal(propertyDepreciation(house, entries, 2025).total, 0);
});

test("schedule E: rents, expense lines, depreciation, net and cash", () => {
  const s = scheduleE(data());
  const r = s.rows[0];
  assert.equal(r.rents, 2000000);
  assert.equal(r.lines.repairs, 240000);
  assert.equal(r.lines.insurance, 120000);
  assert.equal(r.opex, 120000 + 240000 + 800000);
  assert.equal(r.depreciation.building, 719697);
  assert.equal(r.net, 2000000 - 1160000 - 719697);
  assert.equal(r.cash, 2000000 - 1160000 - 300000);
  assert.equal(r.deposits, 200000);
  assert.equal(s.totals.net, r.net);
});

test("schedule E only counts the chosen year and ignores unknown properties", () => {
  const d = data();
  d.entries.push({ id: "x", date: "2025-12-31", property: "p1", type: "rent", cents: 999999 }, { id: "y", date: "2026-02-01", property: "gone", type: "rent", cents: 999999 });
  assert.equal(scheduleE(d).rows[0].rents, 2000000);
  assert.equal(scheduleE(d, 2025).rows[0].rents, 999999);
});

test("unknown expense category falls to line 19", () => {
  const d = data();
  d.entries.push({ id: "z", date: "2026-08-01", property: "p1", type: "expense", category: "bogus", cents: 5000 });
  assert.equal(scheduleE(d).rows[0].lines.other, 5000);
});

test("passive loss: profit, loss under allowance, phase-out, no active participation", () => {
  assert.deepEqual(passiveLoss({ net: 500000 }).taxableNet, 500000);
  assert.equal(passiveLoss({ net: -1000000, magi: 9000000 }).allowed, 1000000);
  assert.equal(passiveLoss({ net: -4000000, magi: 9000000 }).allowed, 2500000);
  assert.equal(passiveLoss({ net: -4000000, magi: 9000000 }).suspended, 1500000);
  // $120,000 MAGI -> allowance 25,000 - 10,000 = 15,000
  assert.equal(passiveLoss({ net: -4000000, magi: 12000000 }).allowance, 1500000);
  assert.equal(passiveLoss({ net: -4000000, magi: 15000000 }).allowed, 0);
  assert.match(passiveLoss({ net: -4000000, magi: 15000000 }).note, /gone/);
  assert.equal(passiveLoss({ net: -1000000, magi: 0, active: false }).allowed, 0);
  assert.equal(passiveLoss({ net: -1000000, magi: 0, active: false }).suspended, 1000000);
});

test("passive loss: prior suspended losses add to the pool, and profit absorbs them", () => {
  const p = passiveLoss({ net: -1000000, magi: 0, priorSuspended: 2000000 });
  assert.equal(p.allowed, 2500000);
  assert.equal(p.suspended, 500000);
  const q = passiveLoss({ net: 700000, priorSuspended: 2000000 });
  assert.equal(q.taxableNet, 0);
  assert.equal(q.suspended, 1300000);
});

test("collection: months, vacancy and short months", () => {
  const c = collection(data())[0];
  assert.equal(c.collected, 2000000);
  assert.equal(c.expected, 2400000);
  assert.equal(c.vacancy, 400000);
  assert.equal(c.shortMonths, 2);
  assert.equal(c.months[2], 200000);
});

test("1099 list: sums by vendor case-insensitively, skips interest, insurance, taxes, no-name", () => {
  const v = vendors1099(data());
  assert.deepEqual(v.map((x) => [x.vendor, x.cents]), [["Joe Plumbing", 240000]]);
  const d = data();
  d.entries.push({ date: "2026-08-01", property: "p1", type: "expense", category: "taxes", cents: 900000, vendor: "County" });
  assert.equal(vendors1099(d).length, 1);
});

test("checks flag big repairs, deposits, missing land and orphan entries", () => {
  const d = data();
  d.entries.push({ id: "big", date: "2026-08-01", property: "p1", type: "expense", category: "repairs", cents: 1200000, note: "new roof" }, { id: "o", date: "2026-08-01", property: "gone", type: "rent", cents: 100 }, { id: "u", date: "bad", property: "p1", type: "rent", cents: 100 });
  const t = checks(d).map((c) => c.text).join("\n");
  assert.match(t, /new roof/);
  assert.match(t, /improvement/);
  assert.match(t, /Security deposits are not income/);
  assert.match(t, /no longer exists/);
  assert.match(t, /no valid date/);
  const noland = checks({ properties: [{ ...house, landCents: 0 }], entries: [] }).map((c) => c.text).join("\n");
  assert.match(noland, /no land value/);
});

test("csv export is formula-safe and complete", () => {
  assert.equal(csvEscape("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvEscape('a,"b"'), '"a,""b"""');
  const csv = scheduleECsv(scheduleE(data()));
  assert.match(csv, /^Line,Item,12 Oak St,Total/);
  assert.match(csv, /\n3,Rents received,20000.00,20000.00/);
  assert.match(csv, /\n18,Depreciation,7196.97,7196.97/);
  assert.match(csv, /\n21,Income or loss,/);
});

test("csv import: quoted fields, header, and per-row problems", () => {
  const text = 'date,property,type,category,amount,vendor,note\n2026-05-01,12 oak st,expense,repairs,"1,250.00","Joe, Plumbing","fix ""leak"""\n2026-05-02,Nowhere,rent,,100,,\n2026-13-45,12 Oak St,rent,,100,,\n2026-05-03,12 Oak St,rent,,0,,\n2026-05-04,12 Oak St,mortgage,,5,,\n';
  const r = importRows(text, [house]);
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].cents, 125000);
  assert.equal(r.entries[0].vendor, "Joe, Plumbing");
  assert.equal(r.entries[0].note, 'fix "leak"');
  assert.equal(r.problems.length, 4);
  assert.match(r.problems.join("\n"), /no property named "Nowhere"/);
  assert.equal(parseCsv("a,b\r\nc,d\r\n").length, 2);
});

test("the no-payee nag skips interest and taxes, which have no contractor to name", () => {
  const d = { properties: [house], entries: [
    { date: "2026-07-02", property: "p1", type: "expense", category: "mortgage_interest", cents: 800000 },
    { date: "2026-07-03", property: "p1", type: "expense", category: "taxes", cents: 300000 },
    { date: "2026-07-04", property: "p1", type: "expense", category: "repairs", cents: 20000 },
  ] };
  const t = checks(d).map((c) => c.text).join("\n");
  assert.match(t, /1 expense of \$75 or more has no payee/);
});

import { saleOfRental, monthsHeld, depreciationThroughSale, ordinaryTax } from "./calc.mjs";

const old = { id: "p1", name: "12 Oak St", priceCents: 30000000, closingCents: 500000, landCents: 5500000, inService: "2020-01-15" };
const sale = (o = {}, d = { properties: [old], entries: [] }) => saleOfRental(d, { property: "p1", saleDate: "2026-01-20", salePriceCents: 40000000, sellingCostsCents: 2400000, taxableIncomeCents: 6000000, magiCents: 8000000, status: "single", ...o });

test("months held count the sale month as half, mid-month at both ends", () => {
  assert.equal(monthsHeld("2020-01-15", "2026-01-20"), 72);
  assert.equal(monthsHeld("2026-03-10", "2026-12-31"), 9);
  assert.equal(depreciationThroughSale(25000000, "2020-01-15", "2026-01-20"), Math.round((25000000 * 72) / 330));
  assert.equal(monthsHeld("", "2026-01-20"), 0);
});

test("sale splits the gain into depreciation recapture and capital gain", () => {
  const r = sale({ magiCents: 5000000 });
  const dep = Math.round((25000000 * 72) / 330);
  assert.equal(r.depTaken, dep);
  assert.equal(r.adjustedBasis, 30500000 - dep);
  assert.equal(r.amountRealized, 37600000);
  assert.equal(r.gain, 37600000 - (30500000 - dep));
  assert.equal(r.unrecaptured, dep);
  assert.equal(r.capitalGain, r.gain - dep);
  assert.equal(r.longTerm, true);
  assert.equal(r.niit, 0);
  assert.ok(r.tax > 0 && r.tax < r.gain * 0.25);
});

test("improvements add basis and are depreciated from their own date", () => {
  const d = { properties: [old], entries: [{ id: "x", date: "2023-07-10", property: "p1", type: "improvement", cents: 2000000 }, { id: "y", date: "2027-01-01", property: "p1", type: "improvement", cents: 999999 }] };
  const r = sale({}, d);
  assert.equal(r.costBasis, 32500000);
  assert.equal(r.impDep, Math.round((2000000 * monthsHeld("2023-07-10", "2026-01-20")) / 330));
});

test("unrecaptured gain is taxed at no more than 25% and capital gain at 0/15/20", () => {
  const low = sale({ taxableIncomeCents: 0 });
  const high = sale({ taxableIncomeCents: 90000000 });
  assert.ok(high.tax > low.tax);
  // At very high income: 25% on recapture, 20% on the rest.
  assert.equal(high.tax, Math.round(high.unrecaptured * 0.25 + high.capitalGain * 0.2));
  // Gain entirely inside the 0% band is untaxed.
  const tiny = sale({ salePriceCents: 30500000, sellingCostsCents: 0, taxableIncomeCents: 0 });
  assert.equal(tiny.gain, tiny.depTaken);
  assert.ok(tiny.tax < tiny.gain * 0.25);
});

test("net investment income tax applies over the MAGI threshold", () => {
  const r = sale({ magiCents: 30000000 });
  assert.equal(r.niit, Math.round(Math.min(r.gain, 30000000 + r.gain - 20000000) * 0.038));
  assert.equal(sale({ magiCents: 30000000, status: "mfj" }).niit, Math.round(Math.min(r.gain, 30000000 + r.gain - 25000000) * 0.038));
});

test("a sale at a loss is an ordinary loss that saves tax", () => {
  const r = sale({ salePriceCents: 20000000 });
  assert.ok(r.gain < 0);
  assert.ok(r.tax < 0);
  assert.equal(r.unrecaptured, 0);
});

test("held a year or less is all ordinary income", () => {
  const r = sale({ saleDate: "2020-09-01", salePriceCents: 36000000 });
  assert.equal(r.longTerm, false);
  assert.equal(r.ordinaryGain, r.gain);
  assert.ok(r.tax > 0);
});

test("suspended losses are released against other income, and cash after tax subtracts the payoff", () => {
  const a = sale(), b = sale({ suspendedCents: 3000000, mortgageCents: 15000000 });
  assert.ok(b.tax < a.tax);
  assert.equal(b.suspendedUsed, 3000000);
  assert.equal(b.cashBeforeTax, a.amountRealized - 15000000);
  assert.equal(b.cashAfterTax, b.cashBeforeTax - b.taxAfterNiit);
});

test("sale reports what is missing instead of guessing", () => {
  assert.equal(sale({ property: "nope" }).ok, false);
  assert.match(sale({ saleDate: "" }).problems[0], /sale date/);
  assert.match(sale({ salePriceCents: 0 }).problems[0], /sale price/);
  assert.match(sale({}, { properties: [{ ...old, inService: "" }], entries: [] }).problems.join(" "), /placed in service/);
  assert.match(sale({ saleDate: "2019-01-01" }).problems[0], /before/);
});

test("ordinary tax uses the bracket table", () => {
  assert.equal(ordinaryTax("single", 1240000), 124000);
  assert.equal(ordinaryTax("single", 5040000), 124000 + Math.round(3800000 * 0.12));
  assert.equal(ordinaryTax("single", 0), 0);
});
