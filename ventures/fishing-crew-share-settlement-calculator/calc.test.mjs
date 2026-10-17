import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCatch, parseCrew, settle, breakEven, priceSensitivity, diagnose, num, MAX_CATCH } from "./calc.mjs";

const C = [{ label: "Halibut", lbs: 1000, price: 6 }, { label: "Cod", lbs: 2000, price: 2 }]; // 10,000
const CREW = [{ name: "A", shares: 1, personal: 0 }, { name: "B", shares: 1, personal: 100 }, { name: "C", shares: 0.5, personal: 0 }];
const O = { commissionPct: 5, fuel: 1500, ice: 300, bait: 200, food: 0, other: 0, boatPct: 40, days: 4, boatDaily: 0 };

test("parseCatch reads commas, tabs, a header and money formatting", () => {
  const { catch: c, errors } = parseCatch('species,pounds,price\nHalibut,"1,200",$6.50\nCod\t2000\t2');
  assert.equal(errors.length, 0);
  assert.equal(c[0].lbs, 1200);
  assert.equal(c[0].price, 6.5);
  assert.equal(c.length, 2);
});

test("parseCatch and parseCrew report bad lines instead of guessing", () => {
  assert.equal(parseCatch("A,0,2\nB,x,2\nC,10").errors.length, 3);
  assert.equal(parseCrew("A,0\nB,1,-5\nC").errors.length, 3);
});

test("catch list is capped", () => {
  const t = Array.from({ length: MAX_CATCH + 2 }, (_, i) => `S${i},10,1`).join("\n");
  assert.equal(parseCatch(t).catch.length, MAX_CATCH);
});

test("settlement walks gross to net to shares", () => {
  const r = settle(C, CREW, O);
  assert.equal(r.gross, 10000);
  assert.equal(r.commission, 500);
  assert.equal(r.tripCosts, 2000);
  assert.equal(r.net, 7500);
  assert.equal(r.crewPool, 4500);
  assert.equal(r.boatReceives, 3000);
  assert.equal(r.totalShares, 2.5);
  assert.equal(r.perShare, 1800);
  assert.equal(r.people[1].takeHome, 1700);
  assert.equal(r.people[2].share, 900);
  assert.equal(r.people[0].perDay, 450);
});

test("money is conserved across boat and crew", () => {
  const r = settle(C, CREW, O);
  assert.equal(r.boatReceives + r.people.reduce((s, p) => s + p.share, 0), r.net);
});

test("a losing trip falls on the boat and the crew is paid nothing from the pool", () => {
  const r = settle([{ label: "x", lbs: 100, price: 1 }], CREW, O);
  assert.ok(r.net < 0);
  assert.equal(r.crewPool, 0);
  assert.equal(r.boatReceives, r.net);
  assert.ok(diagnose(r, O, 100, breakEven(CREW, O, 100)).some((f) => /lost money/.test(f.title)));
});

test("break-even gross lands exactly on the target when fed back through settle", () => {
  const o = { ...O, boatDaily: 250 };
  const be = breakEven(CREW, o, 300);
  const scale = (g) => [{ label: "x", lbs: 1, price: g }];
  assert.ok(Math.abs(settle(scale(be.crewTarget), CREW, o).people[0].perDay - 300) < 1e-6);
  assert.ok(Math.abs(settle(scale(be.boatCover), CREW, o).boatProfit) < 1e-6);
});

test("a price drop hits the hand's day rate harder than the price drop itself", () => {
  const rows = priceSensitivity(C, CREW, O);
  const base = rows.find((r) => r.pct === 0), down = rows.find((r) => r.pct === -20);
  assert.ok(down.handPerDay / base.handPerDay < 0.8);
});

test("diagnose flags low crew pay, a boat that cannot cover costs, and fuel weight", () => {
  const o = { ...O, fuel: 3000, boatDaily: 2000 };
  const r = settle(C, CREW, o);
  const t = diagnose(r, o, 500, breakEven(CREW, o, 500)).map((f) => f.title).join("|");
  assert.match(t, /below \$500/);
  assert.match(t, /boat's cut/);
  assert.match(t, /Fuel is 30%/);
});

test("num strips money formatting and rejects junk", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("abc")));
});
