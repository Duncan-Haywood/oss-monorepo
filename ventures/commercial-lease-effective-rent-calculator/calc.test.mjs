import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeOffer, breakEvenRent, compareOffers, normalizeOffer, normalizeShared, reportCsv, sampleOffers, sampleShared, schedule, money, money2, pct, isUsed } from "./calc.mjs";

const base = { name: "X", sf: "1000", rent: "24", esc: "0", term: "12", free: "0", nnn: "0", nnnGrowth: "0", ti: "0", build: "0", other: "0", deposit: "0" };
const flat = { discount: "0", freeNnn: "payable" };
const an = (over, shared = flat) => analyzeOffer(normalizeOffer({ ...base, ...over }, "Offer A").o, normalizeShared(shared).s);
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("a flat lease at zero discount costs exactly its rent", () => {
  const r = an({});
  close(r.baseTotal, 24000);
  close(r.levelizedPerSfYear, 24);
  close(r.netEffectiveRent, 24);
  close(r.allInPerSfYear, 24);
});

test("free rent lowers the average rent paid, by hand: 2 of 12 months free is 20000", () => {
  const r = an({ free: "2" });
  close(r.baseTotal, 20000);
  close(r.freeRentValue, 4000);
  close(r.avgContractRent, 20);
  close(r.netEffectiveRent, 20);
});

test("TI allowance is subtracted from net effective rent and paid out against build-out", () => {
  const r = an({ ti: "5", build: "0" });
  close(r.netEffectiveRent, 24 - 5); // (24000 - 5000) / 1 year / 1000 SF
  close(r.netCapex, -5000);
  const covered = an({ ti: "10", build: "10" });
  close(covered.netCapex, 0);
  close(covered.tiShortfall, 0);
  close(an({ ti: "10", build: "25" }).tiShortfall, 15000);
});

test("escalation compounds by lease year: 5% over 24 months is 24000 + 25200", () => {
  const r = an({ term: "24", esc: "5" });
  close(r.baseTotal, 49200);
  assert.equal(r.years_.length, 2);
  close(r.years_[1].base, 25200);
});

test("operating costs grow separately and free rent can abate them", () => {
  const paid = an({ nnn: "12", nnnGrowth: "10", term: "24", free: "2" });
  close(paid.opexTotal, 12000 + 13200);
  const abated = an({ nnn: "12", term: "12", free: "3" }, { discount: "0", freeNnn: "abated" });
  close(abated.opexTotal, 9000);
});

test("deposit is returned: free at zero discount, a real cost when discounting", () => {
  close(an({ deposit: "10000" }).totalCost, 24000);
  const d = { discount: "10", freeNnn: "payable" };
  const withDeposit = an({ deposit: "10000" }, d), without = an({}, d);
  assert.ok(withDeposit.pv > without.pv);
  assert.ok(withDeposit.pv - without.pv < 10000);
});

test("front-loaded fit-out weighs more once discounted", () => {
  const fit = an({ term: "60", build: "40" }, { discount: "8", freeNnn: "payable" });
  assert.ok(fit.levelizedPerSfYear > fit.allInPerSfYear);
});

test("leaving early is dearer per year than staying: fit-out is spent up front", () => {
  const r = an({ term: "60", build: "40", ti: "10" });
  const first = r.leave[0], full = r.leave[r.leave.length - 1];
  assert.equal(first.months, 12);
  assert.equal(full.months, 60);
  assert.ok(first.perSfYear > full.perSfYear);
  close(full.cost, r.totalCost);
});

test("break-even rent reproduces the goal cost exactly", () => {
  const c = compareOffers(sampleOffers(), sampleShared());
  const worse = c.ranked[c.ranked.length - 1];
  const rent = breakEvenRent(worse.offer, c.shared, c.best.levelizedPerSfYear);
  const re = analyzeOffer({ ...worse.offer, rent }, c.shared);
  close(re.levelizedPerSfYear, c.best.levelizedPerSfYear, 1e-6);
});

test("the cheapest headline is not always the cheapest lease", () => {
  const c = compareOffers([
    { ...base, name: "Low headline", rent: "20", free: "0", ti: "0", build: "40" },
    { ...base, name: "High headline", rent: "24", free: "4", ti: "40", build: "40" },
  ], { discount: "8", freeNnn: "payable" });
  assert.equal(c.best.offer.name, "High headline");
  assert.match(c.findings[0].title, /High headline is cheapest overall, but Low headline has the lowest headline rent/);
});

test("sample offers rank and produce findings; unused slot C is skipped", () => {
  const c = compareOffers(sampleOffers(), sampleShared());
  assert.equal(c.results.length, 3);
  assert.equal(c.ranked[0], c.best);
  assert.ok(c.findings.length > 3);
  const two = compareOffers([sampleOffers()[0], sampleOffers()[1], { name: "", sf: "", rent: "" }], sampleShared());
  assert.equal(two.results.length, 2);
  assert.equal(isUsed({ sf: "", rent: "" }), false);
});

test("a single offer is analysed without a ranking finding", () => {
  const c = compareOffers([sampleOffers()[0]], sampleShared());
  assert.equal(c.results.length, 1);
  assert.ok(!c.findings.some((f) => /cheapest overall/.test(f.title)));
});

test("bad input is reported, not computed", () => {
  assert.match(compareOffers([{ ...base, sf: "" }], flat).error, /square feet/);
  assert.match(compareOffers([{ ...base, term: "3" }], flat).error, /term/);
  assert.match(compareOffers([{ ...base, free: "12" }], flat).error, /free rent/);
  assert.match(compareOffers([{ ...base, esc: "50" }], flat).error, /escalation/);
  assert.match(compareOffers([base], { discount: "90" }).error, /Discount/);
  assert.match(compareOffers([base, { ...base, name: "", rent: "20", sf: "abc" }], flat).error, /Offer B/);
});

test("inputs with symbols and commas parse", () => {
  const r = an({ sf: "3,000", rent: "$30.00", esc: "3%" });
  close(r.offer.sf, 3000);
  close(r.offer.esc, 0.03);
});

test("CSV has one column per offer and quotes every cell", () => {
  const csv = reportCsv(compareOffers(sampleOffers(), sampleShared()));
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], '"measure","Main Street (A)","Plaza (B)","Loft (C)"');
  assert.ok(lines.some((l) => l.startsWith('"net_effective_rent_per_sf_year"')));
  assert.ok(lines.every((l) => l.startsWith('"')));
});

test("schedule length equals the term and formatters are safe", () => {
  assert.equal(schedule(normalizeOffer({ ...base, term: "36" }, "A").o, normalizeShared(flat).s).length, 36);
  assert.equal(money(null), "n/a");
  assert.equal(money2(1234.5), "$1,234.50");
  assert.equal(pct(0.1234), "12.3%");
});
