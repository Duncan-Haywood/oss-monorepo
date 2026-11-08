import test from "node:test";
import assert from "node:assert/strict";
import { planMatrix, matrixCsv, planGtins } from "./orderlines.mjs";
import { validate } from "./gtin.mjs";

const sizes = [{ name: "S", share: 20 }, { name: "M", share: 40 }, { name: "L", share: 30 }, { name: "XL", share: 10 }];

test("300 over four equal colours is 75 each; sizes 15/30/22.5/7.5 round by largest remainder", () => {
  const p = planMatrix({ total: 300, colours: ["Black", "White", "Sand", "Olive"].map(name => ({ name, share: 1 })), sizes });
  assert.deepEqual(p.rows.map(r => r.qty), [75, 75, 75, 75]);
  // 75 -> 15, 30, 22.5, 7.5: the two halves tie, the earlier size takes the piece
  assert.deepEqual(Object.values(p.rows[0].sizes), [15, 30, 23, 7]);
  assert.equal(p.rows.every(r => Object.values(r.sizes).reduce((a, b) => a + b) === 75), true);
  assert.equal(Object.values(p.sizeTotals).reduce((a, b) => a + b), 300);
  assert.equal(p.sizeTarget.L, 90);
});

test("uneven colours: 100 pieces at 50/30/20 and a minimum of 30 flags the 20", () => {
  const p = planMatrix({ total: 100, minPerColour: 30, sizes, colours: [{ name: "A", share: 50 }, { name: "B", share: 30 }, { name: "C", share: 20 }] });
  assert.deepEqual(p.rows.map(r => r.qty), [50, 30, 20]);
  assert.deepEqual(p.rows.map(r => r.underMin), [false, false, true]);
  assert.equal(p.maxColours, 3);               // floor(100/30)
  assert.match(p.notes[0], /C \(20\)/);
  assert.match(p.notes[1], /raise the total to 90|drop the smallest/);
});

test("total always exact when shares do not divide it", () => {
  const p = planMatrix({ total: 101, colours: [{ name: "A", share: 1 }, { name: "B", share: 1 }, { name: "C", share: 1 }], sizes });
  assert.equal(p.rows.reduce((a, r) => a + r.qty, 0), 101);
  assert.deepEqual(p.rows.map(r => r.qty), [34, 34, 33]);
});

test("spares: 5% extra on 20 is ceil(21.05) = 22", () => {
  const p = planMatrix({ total: 20, defectPct: 5, colours: [{ name: "A", share: 1 }], sizes: [{ name: "M", share: 1 }] });
  assert.equal(p.rows[0].cutQty, 22);
  const q = planMatrix({ total: 19, defectPct: 5, colours: [{ name: "A", share: 1 }], sizes: [{ name: "M", share: 1 }] });
  assert.equal(q.rows[0].cutQty, 20);  // 19/.95 = 20 exactly, not 21
});

test("whole run under one colour minimum says so", () => {
  const p = planMatrix({ total: 40, minPerColour: 50, colours: [{ name: "A", share: 1 }], sizes });
  assert.equal(p.maxColours, 0);
  assert.match(p.notes.join(" "), /under one colour's minimum/);
});

test("tiny run warns about empty size cells", () => {
  const p = planMatrix({ total: 6, colours: [{ name: "A", share: 1 }, { name: "B", share: 1 }], sizes });
  assert.match(p.notes.join(" "), /Zero pieces/);
});

test("refuses bad input with a reason", () => {
  const ok = { total: 10, colours: [{ name: "A", share: 1 }], sizes };
  for (const bad of [null, 5, {}, { ...ok, total: 0 }, { ...ok, total: 1.5 }, { ...ok, total: "10" }, { ...ok, colours: [] },
    { ...ok, colours: [{ name: "A", share: 0 }] }, { ...ok, colours: [{ name: "A", share: 1 }, { name: " a ", share: 1 }] },
    { ...ok, sizes: [{ name: "", share: 1 }] }, { ...ok, minPerColour: -1 }, { ...ok, defectPct: 60 }, { ...ok, total: 2e6 },
    { ...ok, colours: [{ name: "A", share: NaN }] }, { ...ok, colours: Array.from({ length: 41 }, (_, i) => ({ name: "c" + i, share: 1 })) }]) {
    const r = planMatrix(bad); assert.equal(r.ok, false); assert.ok(r.error);
  }
});

test("csv defuses formulas and quotes commas", () => {
  const p = planMatrix({ total: 2, colours: [{ name: "=HYPERLINK(1)", share: 1 }, { name: "Red, deep", share: 1 }], sizes: [{ name: "M", share: 1 }] });
  const csv = matrixCsv(p, { style: "Tee" });
  assert.match(csv, /Tee,'=HYPERLINK\(1\),M,1,1/);
  assert.match(csv, /"Red, deep"/);
  assert.equal(csv.split("\n").length, 4);
  assert.equal(matrixCsv({ ok: false }), "");
});

test("GTIN column: one valid, distinct code per colour and size, in table order", () => {
  const p = planMatrix({ total: 60, colours: [{ name: "Black", share: 1 }, { name: "Sand", share: 1 }], sizes: [{ name: "S", share: 1 }, { name: "M", share: 1 }] });
  const g = planGtins(p, { prefix: "0614141", start: 1, style: "Tee" });
  assert.equal(g.ok, true);
  // hand-worked: 7-digit prefix leaves 5 item digits; item 1 -> 061414100001 + check digit 2
  assert.equal(g.gtins[0].S, "0614141000012");
  assert.equal(g.gtins[0].M, "0614141000029");
  const all = g.gtins.flatMap(r => Object.values(r));
  assert.equal(new Set(all).size, 4);
  for (const c of all) assert.equal(validate(c).ok, true);
  const csv = matrixCsv(p, { style: "Tee", gtins: g.gtins }).split("\n");
  assert.equal(csv[0], "Style,Colour,Size,Order qty,Cut qty (with spares),GTIN");
  assert.equal(csv[1], "Tee,Black,S,15,15,0614141000012");
  assert.equal(csv[4], "Tee,Sand,M,15,15," + g.gtins[1].M);
  assert.equal(matrixCsv(p).split("\n")[0].includes("GTIN"), false);
});

test("GTIN column: bad prefix and failed plan are errors, not codes", () => {
  const p = planMatrix({ total: 10, colours: [{ name: "A", share: 1 }], sizes: [{ name: "M", share: 1 }] });
  assert.equal(planGtins(p, { prefix: "123" }).ok, false);
  assert.equal(planGtins({ ok: false }, { prefix: "0614141" }).ok, false);
});
