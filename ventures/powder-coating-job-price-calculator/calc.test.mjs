import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePowders, readInput, jobCost, plan, quantityBreaks, breakEvenQty, sensitivity, sampleInput, encodeShare, decodeShare, toCsv, COVERAGE_AT_1_MIL } from "./calc.mjs";

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const base = () => readInput({ ...sampleInput(), qty: "10", setupMin: "0", scrapPct: "0", minCharge: "0", marginPct: "0", overheadRate: "0", laborRate: "0", ovenRate: "0", supplies: "0", targetPerPiece: "" }).v;
const std = { name: "std", price: 10, te: 100, reclaim: 0, sg: 1.5 };

test("parsePowders reads lines, defaults reclaim and gravity, and reports bad lines", () => {
  const { powders, errors } = parsePowders("# c\nA, 8, 65\n\nB, 9, 70, 50, 1.7");
  assert.equal(errors.length, 0);
  assert.deepEqual(powders[0], { name: "A", price: 8, te: 65, reclaim: 0, sg: 1.5 });
  assert.deepEqual(powders[1], { name: "B", price: 9, te: 70, reclaim: 50, sg: 1.7 });
  assert.match(parsePowders("A, x, 65").errors[0], /plain numbers/);
  assert.match(parsePowders("A, 8, 0").errors[0], /transfer efficiency/);
  assert.match(parsePowders("A, 8, 101").errors[0], /transfer efficiency/);
  assert.match(parsePowders("A, 8, 65, 120").errors[0], /reclaim/);
  assert.match(parsePowders("A, -1, 65").errors[0], /negative/);
  assert.match(parsePowders("A, 8, 65, 0, 9").errors[0], /specific gravity/);
  assert.match(parsePowders("A").errors[0], /need/);
});

test("powder weight follows area, film thickness and gravity at perfect transfer", () => {
  const v = base();
  const c = jobCost(v, std);
  // 3.5 sq ft at 2.5 mil, SG 1.5: coverage 192.2/(1.5*2.5) = 51.25 sq ft per lb
  assert.equal(c.coverage, 51.25);
  assert.equal(c.powderLb, round2((10 * 3.5) / (COVERAGE_AT_1_MIL / (1.5 * 2.5))));
  assert.ok(Math.abs(c.powderCost - c.powderLb * 10) < 0.06);
  assert.equal(c.lostLb, 0);
});

test("lower transfer efficiency raises powder used, and reclaim gives part of it back", () => {
  const v = base();
  const perfect = jobCost(v, std);
  const lossy = jobCost(v, { ...std, te: 50 });
  assert.ok(Math.abs(lossy.powderLb - perfect.powderLb * 2) < 0.011);
  const reclaimed = jobCost(v, { ...std, te: 50, reclaim: 100 });
  assert.equal(reclaimed.powderLb, perfect.powderLb);
  assert.equal(reclaimed.lostLb, 0);
  const half = jobCost(v, { ...std, te: 50, reclaim: 50 });
  assert.ok(Math.abs(half.powderLb - perfect.powderLb * 1.5) < 0.011);
});

test("oven batches round up and a second coat doubles powder and cure", () => {
  const v = base();
  const one = jobCost({ ...v, partsPerBatch: 4, ovenRate: 10 }, std);
  assert.equal(one.batches, 3);
  assert.equal(one.lastBatchFill, round2(10 / 12));
  assert.equal(one.ovenCost, round2(3 * 45 / 60 * 10));
  const two = jobCost({ ...v, partsPerBatch: 4, ovenRate: 10, coats: 2 }, std);
  assert.equal(two.ovenCost, round2(one.ovenCost * 2));
  assert.ok(Math.abs(two.powderLb - one.powderLb * 2) < 0.011);
});

test("scrap adds the pieces that must be run again", () => {
  const v = base();
  const clean = jobCost({ ...v, laborRate: 30 }, std);
  const scrappy = jobCost({ ...v, laborRate: 30, scrapPct: 20 }, std);
  assert.equal(scrappy.laborCost, round2(clean.laborCost / 0.8));
  assert.ok(Math.abs(scrappy.powderCost - clean.powderCost / 0.8) < 0.011);
});

test("margin is a share of the price, not a markup on cost", () => {
  const v = { ...base(), laborRate: 30, marginPct: 40 };
  const c = jobCost(v, std);
  assert.equal(c.actualMarginPct, 40);
  assert.equal(c.price, round2(c.cost / 0.6));
});

test("the minimum charge sets the price when the job is small and says so", () => {
  const v = { ...base(), laborRate: 30, minCharge: 500, qty: 2 };
  const c = jobCost(v, std);
  assert.equal(c.minApplied, true);
  assert.equal(c.price, 500);
  assert.equal(c.perPiece, 250);
  assert.ok(c.wanted < 500);
});

test("setup is spread over the order so the price per piece falls with quantity", () => {
  const v = { ...base(), setupMin: 60, laborRate: 40, partsPerBatch: 20 };
  const rows = quantityBreaks({ ...v, qty: 10 }, std);
  const q10 = rows.find((r) => r.qty === 10), q100 = rows.find((r) => r.qty === 100);
  assert.ok(q100.perPiece < q10.perPiece);
  assert.equal(rows.filter((r) => r.current).length, 1);
  assert.deepEqual(rows.map((r) => r.qty), [...rows.map((r) => r.qty)].sort((a, b) => a - b));
});

test("break-even quantity finds the smallest order that meets the customer's price", () => {
  const v = { ...base(), setupMin: 60, laborRate: 40, prepMin: 3, partsPerBatch: 20, marginPct: 30, targetPerPiece: 12 };
  const q = breakEvenQty(v, std);
  assert.ok(Number.isInteger(q) && q > 1);
  assert.ok(jobCost(v, std, q).perPiece <= 12);
  assert.ok(jobCost(v, std, q - 1).perPiece > 12);
  assert.equal(breakEvenQty({ ...v, targetPerPiece: 0.01 }, std), Infinity);
  assert.equal(breakEvenQty({ ...v, targetPerPiece: 1e6 }, std), 1);
  assert.equal(breakEvenQty({ ...v, targetPerPiece: 0 }, std), null);
});

test("readInput rejects inputs that would make a nonsense price", () => {
  const ok = sampleInput();
  assert.ok(readInput(ok).v);
  assert.match(readInput({ ...ok, qty: "0" }).error, /whole number/);
  assert.match(readInput({ ...ok, qty: "2.5" }).error, /whole number/);
  assert.match(readInput({ ...ok, area: "0" }).error, /surface area/);
  assert.match(readInput({ ...ok, mils: "40" }).error, /Film thickness/);
  assert.match(readInput({ ...ok, coats: "4" }).error, /Coats/);
  assert.match(readInput({ ...ok, partsPerBatch: "0" }).error, /oven batch/);
  assert.match(readInput({ ...ok, scrapPct: "60" }).error, /Scrap/);
  assert.match(readInput({ ...ok, marginPct: "95" }).error, /Margin/);
  assert.match(readInput({ ...ok, laborRate: "-1" }).error, /negative/);
  assert.match(readInput({ ...ok, laborRate: "abc" }).error, /laborRate/);
});

test("plan compares powders, names the cheapest and explains the price", () => {
  const r = plan(sampleInput());
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 4);
  assert.equal(r.best.powder, "Reclaimed standard polyester");
  assert.equal(r.worst.powder, "Candy translucent");
  assert.match(r.advice[0], /Quote \$17\.27 per piece/);
  assert.ok(r.advice.some((a) => /customer's \$18\.00 per piece/.test(a)));
  assert.ok(r.advice.some((a) => /oven batch/.test(a)) || r.best.lastBatchFill >= 0.7);
  assert.equal(r.breaks.length >= 9, true);
  assert.equal(plan({ ...sampleInput(), powders: "" }).error, "Add at least one powder.");
  assert.match(plan({ ...sampleInput(), powders: "x" }).error, /need/);
});

test("sensitivity scales the powder price of the first powder only", () => {
  const rows = sensitivity(sampleInput());
  assert.equal(rows.length, 5);
  assert.equal(rows[1].multiplier, 1);
  assert.ok(rows[4].price > rows[0].price);
  assert.equal(rows[1].pricePerLb, 7.5);
  assert.deepEqual(sensitivity({ ...sampleInput(), qty: "0" }), []);
});

test("share links round-trip known keys and drop everything else", () => {
  const input = sampleInput();
  const back = decodeShare("#" + encodeShare(input));
  assert.deepEqual(back, input);
  assert.deepEqual(decodeShare("evil=1&qty=5&__proto__=x"), { qty: "5" });
  assert.deepEqual(decodeShare(""), {});
  assert.ok(plan(back).best);
});

test("toCsv has a header and one line per powder", () => {
  const csv = toCsv(plan(sampleInput())).split("\n");
  assert.equal(csv.length, 5);
  assert.match(csv[0], /^powder,/);
});
