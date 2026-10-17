import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseItems, parseProb, evaluate, normalizeOptions, bestSubset, plan, summarize, money, pct, MAX_ITEMS } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/haul.csv", import.meta.url), "utf8");
const O = normalizeOptions({});

test("parseProb takes fractions and percents and rejects junk", () => {
  assert.equal(parseProb("0.8"), 0.8);
  assert.equal(parseProb("80%"), 0.8);
  assert.equal(parseProb("80"), 0.8);
  assert.equal(parseProb(""), null);
  assert.ok(Number.isNaN(parseProb("150%")));
  assert.ok(Number.isNaN(parseProb("-1")));
});

test("parseItems reads the fixture and reports line-numbered errors", () => {
  const p = parseItems(csv);
  assert.equal(p.errors.length, 0);
  assert.equal(p.items.length, 14);
  assert.equal(p.items[0].ship, 14);
  assert.equal(p.items[13].note, "");
  const bad = parseItems("a,1,2\nb,x,2,0.5\nc,1,2,2%\n,1,2,0.5\nd,1,2,0.5,-3\ne,1,2,abc");
  assert.equal(bad.items.length, 1);
  assert.equal(bad.errors.length, 5);
  assert.match(bad.errors[0], /^line 1: expected/);
  assert.match(bad.errors[4], /^line 6: sell_chance/);
  assert.equal(parseItems("x,1,2,0.5\n".repeat(MAX_ITEMS + 1)).errors.at(-1), `at most ${MAX_ITEMS} items at a time; found ${MAX_ITEMS + 1}`);
  assert.equal(parseItems("name,ask,resale,sell_chance\na,1,2,0.5").items.length, 1);
});

test("evaluate: a worked item by hand", () => {
  // ask 20, resale 100, p 0.8, ship 10, 30 min at $20/h, 36.5 days at 10%/yr, fee 10% + $1, supplies 1, unsold recovers 25%.
  const o = normalizeOptions({ feePct: 10, fixedFee: 1, suppliesPerItem: 1, hourlyValue: 20, annualRate: 10, unsoldRecoveryPct: 25 });
  const e = evaluate({ name: "x", ask: 20, resale: 100, p: 0.8, ship: 10, minutes: 30, days: 36.5, note: "" }, o);
  assert.ok(Math.abs(e.netIfSold - (90 - 1 - 10 - 1)) < 1e-9);
  assert.ok(Math.abs(e.netIfUnsold - (25 * 0.9 - 1)) < 1e-9);
  assert.ok(Math.abs(e.labor - 10) < 1e-9);
  assert.ok(Math.abs(e.capital - 0.2) < 1e-9);
  assert.ok(Math.abs(e.profit - (0.8 * 78 + 0.2 * 21.5 - 30.2)) < 1e-9);
});

test("break-even chance makes profit exactly zero; walk-away price makes it exactly the minimum return", () => {
  const o = normalizeOptions({ minReturnPct: 50 });
  const it = { name: "x", ask: 30, resale: 90, p: 0.6, ship: 8, minutes: 20, days: 30, note: "" };
  const e = evaluate(it, o);
  assert.equal(e.breakEven.status, "chance");
  const atBe = evaluate({ ...it, p: e.breakEven.p }, o);
  assert.ok(Math.abs(atBe.profit) < 1e-9);
  const atMax = evaluate({ ...it, ask: e.maxAsk }, o);
  assert.ok(Math.abs(atMax.profit - e.maxAsk * 0.5) < 1e-9);
});

test("break-even statuses: always and never", () => {
  const free = evaluate({ name: "f", ask: 0, resale: 50, p: 0.5, ship: 0, minutes: 0, days: 0, note: "" }, normalizeOptions({ unsoldRecoveryPct: 0 }));
  assert.equal(free.breakEven.status, "always");
  const never = evaluate({ name: "n", ask: 100, resale: 50, p: 0.9, ship: 5, minutes: 10, days: 10, note: "" }, O);
  assert.equal(never.breakEven.status, "never");
  assert.ok(never.maxAsk < 50);
});

test("pLoss and worst case follow the two outcomes", () => {
  const e = evaluate({ name: "x", ask: 40, resale: 100, p: 0.7, ship: 8, minutes: 10, days: 10, note: "" }, normalizeOptions({ unsoldRecoveryPct: 0 }));
  assert.ok(e.profitIfSold > 0 && e.profitIfUnsold < 0);
  assert.ok(Math.abs(e.pLoss - 0.3) < 1e-9);
  assert.ok(e.worst < -40);
});

function brute(cands, caps) {
  let best = 0;
  for (let m = 0; m < 1 << cands.length; m += 1) {
    let spend = 0, hrs = 0, n = 0, v = 0;
    for (let i = 0; i < cands.length; i += 1) if (m & (1 << i)) { spend += cands[i].ask; hrs += cands[i].minutes / 60; n += 1; v += cands[i].profit; }
    if (caps.budget !== null && spend > caps.budget + 1e-9) continue;
    if (caps.maxHours !== null && hrs > caps.maxHours + 1e-9) continue;
    if (caps.maxItems !== null && n > caps.maxItems) continue;
    best = Math.max(best, v);
  }
  return best;
}

test("bestSubset equals brute force on random instances with every cap combination", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let t = 0; t < 120; t += 1) {
    const n = 4 + Math.floor(rnd() * 9);
    const cands = Array.from({ length: n }, () => ({ ask: 1 + Math.floor(rnd() * 60), minutes: 5 + Math.floor(rnd() * 50), profit: 1 + rnd() * 40 }));
    const caps = { budget: rnd() < 0.8 ? 30 + rnd() * 150 : null, maxHours: rnd() < 0.5 ? 1 + rnd() * 4 : null, maxItems: rnd() < 0.4 ? 1 + Math.floor(rnd() * 5) : null };
    const r = bestSubset(cands, caps);
    assert.ok(r.exact);
    assert.ok(Math.abs(r.value - brute(cands, caps)) < 1e-6, `trial ${t}`);
  }
});

test("no caps buys every item that meets the bar", () => {
  const p = plan(parseItems(csv), {});
  assert.equal(p.buy.length, 10);
  assert.equal(money(p.spend), "$160.00");
  assert.equal(p.pass.length, 4);
  assert.ok(p.pass.every((x) => x.profit <= 0.03));
  assert.equal(summarize(p).status, "gain");
  assert.ok(p.exact);
});

test("a budget and an hours cap give the exact best set and beat the ranking rule", () => {
  const p = plan(parseItems(csv), { budget: 80, maxHours: 2 });
  assert.equal(p.buy.length, 5);
  assert.equal(money(p.spend), "$80.00");
  assert.ok(p.hours <= 2 + 1e-9);
  assert.equal(money(p.upliftVsBest), "$6.99");
  assert.ok(p.findings.some((f) => f.rule === "beats-ranking"));
});

test("minimum return filters items and the negotiate finding names a price", () => {
  const strict = plan(parseItems(csv), { minReturnPct: 150 });
  assert.ok(strict.buy.length < 10);
  assert.ok(strict.pass.some((x) => /below your 150% minimum return/.test(x.reason)));
  const neg = plan(parseItems(csv), {}).findings.filter((f) => f.rule === "negotiate");
  assert.ok(neg.length >= 1);
  assert.match(neg[0].message, /only works at \$/);
});

test("nothing clears the bar", () => {
  const p = plan(parseItems("a,50,40,0.9"), {});
  assert.equal(p.buy.length, 0);
  assert.equal(summarize(p).status, "none");
});

test("options are validated", () => {
  assert.throws(() => normalizeOptions({ feePct: 120 }), /marketplace fee percent/);
  assert.throws(() => normalizeOptions({ budget: "-5" }), /budget/);
  assert.equal(normalizeOptions({ budget: "" }).budget, null);
  assert.equal(pct(0.054), "5.4%");
});
