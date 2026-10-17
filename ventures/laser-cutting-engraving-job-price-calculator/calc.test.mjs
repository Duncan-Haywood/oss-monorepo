import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMaterials, readInput, piecesPerSheet, jobCost, plan, quantityBreaks, breakEvenQty, impliedMachineRate, sensitivity, sampleInput, encodeShare, decodeShare, toCsv } from "./calc.mjs";

const zero = { setupMin: "0", loadMin: "0", finishMin: "0", scrapPct: "0", minCharge: "0", marginPct: "0", overheadRate: "0", laborRate: "0", machineRate: "0", supplies: "0", targetPerPiece: "" };
const base = (o = {}) => readInput({ ...sampleInput(), ...zero, qty: "10", ...o }).v;
const ply = { name: "ply", price: 10, sw: 24, sh: 12, cut: 20, engrave: 30 };

test("parseMaterials reads lines and reports bad ones", () => {
  const { materials, errors } = parseMaterials("# c\nA, 9, 24, 12, 25, 30\n\nB, 38, 24, 12, 18, 40");
  assert.equal(errors.length, 0);
  assert.deepEqual(materials[0], { name: "A", price: 9, sw: 24, sh: 12, cut: 25, engrave: 30 });
  assert.match(parseMaterials("A, x, 24, 12, 25, 30").errors[0], /plain numbers/);
  assert.match(parseMaterials("A, 9, 0, 12, 25, 30").errors[0], /width and height/);
  assert.match(parseMaterials("A, 9, 24, 12, 0, 30").errors[0], /speeds/);
  assert.match(parseMaterials("A, -1, 24, 12, 25, 30").errors[0], /negative/);
  assert.match(parseMaterials("A, 9").errors[0], /need/);
});

test("pieces per sheet tries both orientations and honours the gap", () => {
  const v = base({ w: "4", h: "3", gap: "0" });
  assert.equal(piecesPerSheet(v, ply), 24); // 6 x 4 either way, 24 x 12 sheet
  assert.equal(piecesPerSheet(base({ w: "5", h: "2", gap: "0" }), { ...ply, sw: 12, sh: 24 }), 24); // rotated: 12 / 2 = 6 across, 24 / 5 = 4 down
  assert.equal(piecesPerSheet(base({ w: "30", h: "2" }), ply), 0);
  assert.ok(piecesPerSheet(base({ gap: "0.5" }), ply) < piecesPerSheet(base({ gap: "0" }), ply));
});

test("sheets are whole sheets and material cost is sheets times price", () => {
  const v = base({ w: "4", h: "3", gap: "0", qty: "25" });
  const c = jobCost(v, ply);
  assert.equal(c.perSheet, 24);
  assert.equal(c.sheets, 2);
  assert.equal(c.materialCost, 20);
  assert.equal(jobCost(v, ply, 24).sheets, 1);
});

test("laser time is cut path over cut speed plus engraved area over engrave speed", () => {
  const v = base({ qty: "1", cutPath: "20", engravePct: "50", w: "4", h: "3" });
  const c = jobCost(v, ply);
  assert.equal(c.cutHours, round(20 / 20 / 60));
  assert.equal(c.engraveHours, round((12 * 0.5) / 30 / 60));
  const twice = jobCost(base({ qty: "1", cutPath: "20", engravePct: "50", passes: "2" }), ply);
  assert.ok(twice.cutHours > c.cutHours);
});

function round(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }

test("price is cost over one minus margin, never below the minimum", () => {
  const v = base({ marginPct: "50", qty: "24", w: "4", h: "3", gap: "0" });
  const c = jobCost(v, ply);
  assert.equal(c.price, round(c.cost / 0.5));
  const m = jobCost(base({ marginPct: "50", minCharge: "500" }), ply);
  assert.equal(m.price, 500);
  assert.equal(m.minApplied, true);
});

test("scrap runs extra pieces and raises the cost", () => {
  const a = jobCost(base({ qty: "100", machineRate: "30" }), ply);
  const b = jobCost(base({ qty: "100", machineRate: "30", scrapPct: "10" }), ply);
  assert.ok(b.cost > a.cost);
});

test("setup spreads over quantity so price per piece falls", () => {
  const v = base({ setupMin: "30", laborRate: "30" });
  const q = quantityBreaks(v, ply);
  assert.ok(q[0].perPiece > q[q.length - 1].perPiece);
  assert.equal(q.filter((r) => r.current).length, 1);
});

test("break-even quantity meets the target, and is Infinity when it cannot", () => {
  const v = base({ setupMin: "30", laborRate: "30", machineRate: "30", targetPerPiece: "5" });
  const be = breakEvenQty(v, ply);
  assert.ok(be > 1 && be < Infinity);
  assert.ok(jobCost(v, ply, be).perPiece <= 5);
  assert.ok(jobCost(v, ply, be - 1).perPiece > 5);
  assert.equal(breakEvenQty(base({ targetPerPiece: "0.001", supplies: "1" }), ply), Infinity);
  assert.equal(breakEvenQty(base(), ply), null);
});

test("implied machine rate falls as the target falls", () => {
  const v = base({ machineRate: "30", targetPerPiece: "8", marginPct: "20", qty: "50" });
  const hi = impliedMachineRate(v, ply);
  const lo = impliedMachineRate({ ...v, targetPerPiece: 4 }, ply);
  assert.ok(lo < hi);
});

test("input validation rejects nonsense", () => {
  assert.match(readInput({ ...sampleInput(), qty: "0" }).error, /whole number/);
  assert.match(readInput({ ...sampleInput(), w: "0" }).error, /width and height/);
  assert.match(readInput({ ...sampleInput(), cutPath: "0", engravePct: "0" }).error, /laser time/);
  assert.match(readInput({ ...sampleInput(), engravePct: "150" }).error, /0 to 100/);
  assert.match(readInput({ ...sampleInput(), scrapPct: "60" }).error, /Scrap/);
  assert.match(readInput({ ...sampleInput(), marginPct: "95" }).error, /Margin/);
  assert.match(readInput({ ...sampleInput(), passes: "0" }).error, /passes/);
  assert.match(readInput({ ...sampleInput(), setupMin: "-1" }).error, /setupMin/);
});

test("plan on the example returns advice, a cheapest material and quantity breaks", () => {
  const r = plan(sampleInput());
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 4);
  assert.equal(r.best.material, "1/8 in baltic birch ply");
  assert.ok(r.advice.length >= 5);
  assert.ok(r.breaks.length >= 9);
  assert.equal(r.sensitivity.length, 5);
  assert.ok(r.sensitivity[4].price > r.sensitivity[0].price);
});

test("plan drops materials the piece does not fit and errors when none do", () => {
  const input = { ...sampleInput(), w: "20", h: "10", materials: "big, 20, 24, 12, 20, 30\nsmall, 5, 12, 6, 20, 30" };
  const r = plan(input);
  assert.equal(r.rows.length, 1);
  assert.match(r.advice.join(" "), /does not fit/);
  assert.match(plan({ ...input, w: "40" }).error, /does not fit/);
  assert.match(plan({ ...sampleInput(), materials: "" }).error, /at least one material/);
});

test("share links keep known keys only and round-trip", () => {
  const input = sampleInput();
  const back = decodeShare("#" + encodeShare(input));
  assert.deepEqual(back, input);
  assert.deepEqual(decodeShare("#evil=1&qty=5"), { qty: "5" });
});

test("csv has a header and one row per material", () => {
  const lines = toCsv(plan(sampleInput())).split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^material,/);
});
