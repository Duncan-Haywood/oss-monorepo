import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeAge, parseAisTable, aisRate, monthlyVelocity, analyze, actionLine, summaryText, sampleCsv } from "./calc.mjs";

const NOW = Date.UTC(2026, 0, 15); // January: standard storage rate all horizon
const H = "sku,product-name,inv-age-0-to-90-days,inv-age-91-to-180-days,inv-age-181-to-270-days,inv-age-271-to-365-days,inv-age-365-plus-days,units-shipped-t30,units-shipped-t90,your-price,item-volume,volume-unit-measurement\n";
const load = (body) => normalizeAge(parseCsv(H + body));
const run = (body, o = {}) => analyze(load(body).items, { asOf: NOW, ...o });
const one = (a, sku) => a.rows.find((r) => r.sku === sku);

test("age buckets become lots at their midpoint and the open bucket is dated past its start", () => {
  const n = load("A,Mug,10,20,0,5,7,3,9,20,0.5,cubic feet\n");
  assert.deepEqual(n.items[0].lots.map((l) => [l.age, l.units]), [[45, 10], [135.5, 20], [318, 5], [410, 7]]);
  assert.equal(n.items[0].units, 42);
  assert.equal(n.items[0].cuft, 0.5);
});

test("volume units are converted to cubic feet", () => {
  const n = normalizeAge(parseCsv(H.replace("cubic feet", "x") + "A,Mug,1,0,0,0,0,1,1,5,1728,cubic inches\nB,Mug,1,0,0,0,0,1,1,5,1,cubic feet\n"));
  assert.equal(n.items[0].cuft, 1);
  assert.equal(n.items[1].cuft, 1);
});

test("newer report layouts with other age splits are read from the header", () => {
  const t = parseCsv("sku,inv-age-0-to-90-days,inv-age-91-to-180-days,inv-age-181-to-270-days,inv-age-271-to-330-days,inv-age-331-to-365-days,inv-age-365-plus-days\nA,1,1,1,1,1,1\n");
  assert.deepEqual(normalizeAge(t).items[0].lots.map((l) => l.age), [45, 135.5, 225.5, 300.5, 348, 410]);
});

test("unreadable rows are skipped with a reason and a missing header is explained", () => {
  const n = load("A,Mug,1,0,0,0,0,1,1,5,,\nB,Mug,x,0,0,0,0,1,1,5,,\nTotal,,2,0,0,0,0,2,2,,,\n,Mug,1,0,0,0,0,1,1,5,,\n");
  assert.equal(n.items.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.reason), ["number not readable", "total row", "no SKU"]);
  assert.match(normalizeAge(parseCsv("a,b\n1,2")).error, /No header row/);
  assert.match(normalizeAge([]).error, /empty/);
});

test("missing sales and price columns are called out rather than assumed", () => {
  const n = normalizeAge(parseCsv("sku,inv-age-0-to-90-days,inv-age-91-to-180-days\nA,5,5\n"));
  assert.equal(n.notes.length, 3);
  assert.match(n.notes.join(" "), /units-shipped/);
});

test("surcharge table parses, rejects junk and looks up by age", () => {
  const t = parseAisTable("181-210:0.5, 366+:4.2").table;
  assert.equal(aisRate(t, 200), 0.5);
  assert.equal(aisRate(t, 500), 4.2);
  assert.equal(aisRate(t, 100), 0);
  assert.match(parseAisTable("181 to 210 = 1").error, /could not read/);
});

test("velocity uses the chosen window and falls back to a shorter one", () => {
  assert.equal(monthlyVelocity({ t7: 0, t30: 30, t60: 0, t90: 180 }, 90), 60);
  assert.equal(monthlyVelocity({ t7: 0, t30: 30, t60: 0, t90: 0 }, 90), 30);
  assert.equal(monthlyVelocity({ t7: 0, t30: 0, t60: 0, t90: 0 }, 90), 0);
});

test("a fast seller with young stock holds and pays no surcharge", () => {
  const a = run("FAST,Mug,100,0,0,0,0,100,300,30,0.1,cubic feet\n");
  const r = one(a, "FAST");
  assert.equal(r.best, "hold");
  assert.equal(r.holdSurcharge, 0);
  assert.equal(r.gain, 0);
});

test("stock that never sells is cheaper to remove than to hold", () => {
  const r = one(run("DEAD,Mug,0,0,100,100,100,0,0,20,0.1,cubic feet\n"), "DEAD");
  assert.equal(r.best, "remove-all");
  assert.equal(r.removeUnits, 300);
  assert.ok(r.gain > 0);
  assert.equal(r.velocity, 0);
});

test("a slow SKU with a healthy margin can call for removing only the oldest units", () => {
  const r = one(run("SLOW,Mug,50,100,250,300,200,8,30,60,0.1,cubic feet\n", { unitCost: 10 }), "SLOW");
  assert.equal(r.best, "remove-aged");
  assert.ok(r.removeUnits > 0 && r.removeUnits < 900);
});

test("a price cut wins when it lifts sales enough to clear aged stock", () => {
  const r = one(run("MARK,Mug,0,0,600,0,0,20,60,100,0.5,cubic feet\n", { unitCost: 10, fulfilmentFee: 5, elasticity: 4, removalFee: 5 }), "MARK");
  assert.equal(r.best, "markdown");
  assert.ok(r.bestDiscount > 0 && r.newPrice < 100);
});

test("with zero elasticity a markdown can never beat holding", () => {
  const a = run("A,Mug,0,0,600,0,0,20,60,100,0.5,cubic feet\n", { elasticity: 0 });
  assert.notEqual(one(a, "A").best, "markdown");
});

test("negative margin is flagged, and the loss is not blamed on storage", () => {
  const a = run("LOSS,Mug,50,0,0,0,0,10,30,10,0.1,cubic feet\n", { unitCost: 9 });
  assert.ok(one(a, "LOSS").margin < 0);
  assert.ok(a.findings.some((f) => /lose money/.test(f.title)));
});

test("peak-season storage rate applies from October", () => {
  const cheap = analyze(load("A,Mug,100,0,0,0,0,0,0,20,1,cubic feet\n").items, { asOf: Date.UTC(2026, 0, 1), horizonMonths: 3 });
  const peak = analyze(load("A,Mug,100,0,0,0,0,0,0,20,1,cubic feet\n").items, { asOf: Date.UTC(2026, 9, 1), horizonMonths: 3 });
  assert.ok(peak.summary.holdStorage > cheap.summary.holdStorage * 2);
});

test("fees within the horizon reconcile to the summary", () => {
  const a = run("A,Mug,0,0,100,100,0,5,15,30,0.2,cubic feet\nB,Mug,20,20,20,20,20,10,30,30,0.2,cubic feet\n");
  assert.equal(a.summary.holdFees, Math.round((a.summary.holdStorage + a.summary.holdSurcharge) * 100) / 100);
  assert.equal(a.summary.units, 300);
  assert.equal(a.summary.aged, 260);
});

test("bad inputs are refused with a reason instead of producing numbers", () => {
  const items = load("A,Mug,1,0,0,0,0,1,1,5,,\n").items;
  assert.match(analyze(items, { horizonMonths: 0 }).invalid, /Horizon/);
  assert.match(analyze(items, { referralPct: 100 }).invalid, /Referral/);
  assert.match(analyze(items, { unitCost: -1 }).invalid, /unitCost/);
  assert.match(analyze(items, { ais: "junk" }).invalid, /could not read/);
});

test("the sample loads, produces actions, and the text names them", () => {
  const n = normalizeAge(parseCsv(sampleCsv()));
  assert.equal(n.error, undefined);
  const a = analyze(n.items, { asOf: NOW });
  assert.ok(a.summary.actions >= 1 && a.summary.gain > 0);
  assert.match(summaryText(a), /remove/);
  assert.match(actionLine(a.rows[0]), /^CHEW-TOY-XL: remove all/);
  assert.match(summaryText(a), /not Amazon's bill/);
});
