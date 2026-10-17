import test from "node:test";
import assert from "node:assert/strict";
import { price, normalizeOptions, monthlyMinutes, parseRoster, roster, summarizePrice, summarizeRoster, money, pct, CLEANLINESS } from "./engine.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("defaults price by hand: 580 minutes, $765 minimum", () => {
  const p = price({});
  assert.equal(p.minutes, 580);
  close(p.hours, 580 / 60);
  close(p.minimum, (580 / 60) * 75 + 40);
  close(p.minimum, 765);
  close(p.recommended, 918);
  close(p.walkAway, (580 / 60) * 56.25 + 40);
  assert.equal(money(p.walkAway), "$583.75");
  assert.equal(p.competitor, null);
});

test("cleanliness changes only the per-transaction minutes", () => {
  const a = price({ cleanliness: "clean" });
  const b = price({ cleanliness: "average" });
  const c = price({ cleanliness: "messy" });
  close(b.minutes - a.minutes, 150);
  close(c.minutes - b.minutes, 300);
  assert.ok(a.minimum < b.minimum && b.minimum < c.minimum);
  for (const k of CLEANLINESS) close(b.byCleanliness[k].minimum, price({ cleanliness: k }).minimum);
});

test("cleanup quote = months x monthly minutes x multiplier x rate x buffer; software excluded", () => {
  const p = price({ cleanupMonths: 3 });
  close(p.cleanupHours, (3 * 580 * 1.25) / 60);
  close(p.cleanupQuote, p.cleanupHours * 75 * 1.2);
  assert.equal(money(p.cleanupQuote), "$3,262.50");
  assert.equal(price({ software: 500, cleanupMonths: 3 }).cleanupQuote > 0, true);
  close(price({ software: 500, cleanupMonths: 3 }).cleanupQuote, p.cleanupQuote);
  assert.equal(price({}).cleanupQuote, 0);
});

test("competitor effective hourly and status bands", () => {
  const at = (fee) => price({ competitorFee: fee }).competitor;
  close(at(600).effectiveHourly, (600 - 40) / (580 / 60));
  assert.equal(at(1000).status, "above-recommended");
  assert.equal(at(800).status, "above-minimum");
  assert.equal(at(600).status, "below-minimum");
  assert.equal(at(300).status, "below-walk-away");
  close(at(600).shortfallToMinimum, 165);
  close(at(1000).shortfallToMinimum, 0);
  assert.match(summarizePrice(price({ competitorFee: 300 })).text, /competitor's \$300\.00/);
  assert.equal(summarizePrice(price({ competitorFee: 300 })).status, "walk");
});

test("monotonic: more of any volume never lowers the fee", () => {
  const base = price({}).minimum;
  for (const k of ["transactions", "accounts", "payrollRuns", "arApItems", "salesTaxFilings", "software", "targetHourly"]) {
    assert.ok(price({ [k]: DEF(k) + 10 }).minimum > base, k);
  }
});
function DEF(k) { return normalizeOptions({})[k]; }

test("zero volume still charges the fixed review block", () => {
  const p = price({ transactions: 0, accounts: 0, payrollRuns: 0, arApItems: 0, salesTaxFilings: 0, software: 0 });
  assert.equal(p.minutes, 30);
  close(p.minimum, 37.5);
});

test("string inputs from a form are accepted; bad ones throw", () => {
  close(price({ transactions: "$1,000", targetHourly: "90" }).minutes, 1000 + 60 + 25 + 120 + 45 + 30);
  assert.throws(() => price({ transactions: "abc" }), /transactions must be a number/);
  assert.throws(() => price({ targetHourly: 0 }), /targetHourly/);
  assert.throws(() => price({ walkAwayPct: 150 }), /walkAwayPct/);
  assert.throws(() => price({ cleanliness: "filthy" }), /cleanliness/);
  assert.throws(() => price({ competitorFee: -5 }), /competitorFee/);
  assert.throws(() => price({ cleanupMultiplier: 0.5 }), /cleanupMultiplier/);
});

test("monthlyMinutes breaks out each part", () => {
  const m = monthlyMinutes(normalizeOptions({}));
  assert.deepEqual(m, { transactions: 300, reconciliation: 60, payroll: 25, arAp: 120, salesTax: 45, review: 30 });
});

test("parseRoster handles header, comments, software and reports line numbers", () => {
  const r = parseRoster("# note\nclient,fee,hours,software\nA,\"x\"\nB,300,4,20\n,100,2\nD,100,0\nE,100,2,-1\nF,abc,2");
  assert.equal(r.clients.length, 1);
  assert.equal(r.clients[0].name, "B");
  assert.equal(r.errors.length, 5);
  assert.match(r.errors[0], /^Line 3:/);
  assert.match(r.errors.join("\n"), /Line 6: hours must be greater than zero/);
});

test("roster ranks worst effective hourly first and sizes the raise", () => {
  const parsed = parseRoster("Fast,800,6.5,30\nGarnet,275,7,25\nBirch,300,4,20\nCedar,650,8,40");
  const r = roster(parsed, { targetHourly: 75 });
  assert.deepEqual(r.clients.map((c) => c.name), ["Garnet", "Birch", "Cedar", "Fast"]);
  const g = r.clients[0];
  close(g.effective, 250 / 7);
  close(g.neededFee, 550);
  close(g.raise, 275);
  close(g.raisePct, 1);
  close(r.clients[1].raise, 20);
  assert.equal(r.clients[2].atTarget, true);
  assert.equal(r.clients[2].raise, 0);
  assert.equal(r.below, 2);
  close(r.totalRaise, 295);
  close(r.fee, 2025);
  close(r.hours, 25.5);
  close(r.blendedHourly, (2025 - 115) / 25.5);
  close(r.blendedAtTarget, (2025 + 295 - 115) / 25.5);
  assert.match(summarizeRoster(r).text, /^2 of 4 clients are below \$75\.00 an hour/);
});

test("roster: raising every client by its raise reaches the target exactly", () => {
  const r = roster(parseRoster("A,100,5,10\nB,900,3,0\nC,50,1,5"), { targetHourly: 60 });
  for (const c of r.clients) close(Math.max((c.fee + c.raise - c.software) / c.hours, 60), (c.fee + c.raise - c.software) / c.hours);
  for (const c of r.clients.filter((x) => !x.atTarget)) close((c.fee + c.raise - c.software) / c.hours, 60);
});

test("roster all at target and empty", () => {
  assert.equal(summarizeRoster(roster(parseRoster("A,1000,2"), {})).status, "ok");
  assert.equal(summarizeRoster(roster({ clients: [] })).status, "empty");
});

test("money and pct", () => {
  assert.equal(money(-3.2), "-$3.20");
  assert.equal(money(null), "n/a");
  assert.equal(pct(0.25), "25%");
  assert.equal(pct(null), "n/a");
});
