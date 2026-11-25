import { test } from "node:test";
import assert from "node:assert/strict";
import { finishPart, rectEdges, circleEdge } from "./geom.mjs";
import { runJob, exampleParts } from "./job.mjs";
import { quoteNest, quoteCsv } from "./quote.mjs";

const close = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

// A: 100 x 50 plate (cut 300, 1 pierce, area 5,000). B: 100 x 100 plate with a 20 mm hole (cut 400 + 20 pi, 2 pierces).
const plate = finishPart({ outer: rectEdges(0, 0, 100, 50), holes: [], marks: [] }, 0.01);
const holed = finishPart({ outer: rectEdges(0, 0, 100, 100), holes: [[circleEdge(50, 50, 10)]], marks: [] }, 0.01);
const items = [{ name: "plate", qty: 4, part: plate }, { name: "holed", qty: 1, part: holed }];
const job = runJob(items, { sheetW: 1000, sheetH: 500, gap: 5, margin: 5, rotations: [0, 90] });
const RATES = { machineRate: 120, cutSpeed: 1000, pierceSeconds: 3, sheetPrice: 100, materialBasis: "sheet", handlingMinutes: 5, setupMinutes: 10, markupPct: 20 };

test("the job fits on one sheet and the parts carry the lengths the quote is built on", () => {
  assert.equal(job.ok, true);
  assert.equal(job.report.totalSheets, 1);
  close(plate.cutLength, 300, "plate cut");
  close(holed.cutLength, 400 + 20 * Math.PI, "holed cut");
  assert.equal(holed.pierces, 2);
});

test("job total by hand: machine minutes at the hourly rate, a whole sheet of material, markup", () => {
  const q = quoteNest(job, items, RATES);
  assert.equal(q.ok, true);
  const cut = (4 * 300 + 400 + 20 * Math.PI) / 1000;
  const pierce = (4 * 1 + 2) * 3 / 60;
  close(q.minutes.cut, cut, "cut minutes");
  close(q.minutes.pierce, pierce, "pierce minutes");
  close(q.minutes.handling, 5, "handling");
  const machine = (cut + pierce + 5 + 10) * 2; // $120/h = $2/min
  close(q.cost.machine, machine, "machine cost");
  close(q.cost.material, 100, "material, whole sheet");
  close(q.cost.total, (machine + 100) * 1.2, "total");
  const sum = q.lines.reduce((s, l) => s + l.linePrice, 0);
  close(sum, q.cost.total, "line prices add up to the job total");
  assert.deepEqual(q.lines.map((l) => [l.name, l.qty]), [["plate", 4], ["holed", 1]]);
});

test("material bases: parts' own area costs the area at the sheet's price per area", () => {
  const q = quoteNest(job, items, { ...RATES, materialBasis: "parts" });
  const area = 4 * 5000 + (10000 - Math.PI * 100);
  close(q.cost.material, area * (100 / (1000 * 500)), "parts-only material", 1e-4);
  const used = quoteNest(job, items, { ...RATES, materialBasis: "used" });
  assert.ok(used.cost.material <= 100 && used.cost.material >= q.cost.material, "used length lies between parts-only and whole sheet");
});

test("a bigger part pays more material; a part with more cutting pays more machine time", () => {
  const q = quoteNest(job, items, RATES);
  const [p, h] = q.lines;
  assert.ok(h.unitMaterial > p.unitMaterial);
  assert.ok(h.unitMachine > p.unitMachine);
});

test("a minimum charge lifts the total and every line in proportion", () => {
  const q = quoteNest(job, items, { ...RATES, minimumCharge: 1000 });
  assert.equal(q.cost.minimumApplied, true);
  close(q.cost.total, 1000, "minimum");
  close(q.lines.reduce((s, l) => s + l.linePrice, 0), 1000, "lines add to the minimum");
  assert.match(q.warnings.join(" "), /minimum charge applies/);
});

test("missing or impossible rates are refused, not priced", () => {
  assert.equal(quoteNest(job, items, { ...RATES, cutSpeed: "" }).ok, false);
  assert.equal(quoteNest(job, items, { ...RATES, cutSpeed: 0 }).ok, false);
  assert.equal(quoteNest(job, items, { ...RATES, machineRate: "" }).ok, false);
  assert.equal(quoteNest(job, items, { ...RATES, markupPct: -5 }).ok, false);
  assert.equal(quoteNest({ ok: false }, items, RATES).ok, false);
});

test("unplaced parts are named and left out of the price", () => {
  const big = finishPart({ outer: rectEdges(0, 0, 2000, 2000), holes: [], marks: [] }, 0.01);
  const list = [...items, { name: "too big", qty: 1, part: big }];
  const j = runJob(list, { sheetW: 1000, sheetH: 500, gap: 5, margin: 5, rotations: [0] });
  assert.equal(j.ok, true);
  const q = quoteNest(j, list, RATES);
  assert.match(q.warnings.join(" "), /1 part was not placed/);
  assert.ok(!q.lines.some((l) => l.name === "too big"));
});

test("the worked example prices, and the CSV carries every part and the total", () => {
  const ex = exampleParts();
  const j = runJob(ex, { sheetW: 2500, sheetH: 1250, gap: 5, margin: 10, rotations: [0, 90, 180, 270] });
  const q = quoteNest(j, ex, { ...RATES, cutSpeed: 3000, sheetPrice: 250 });
  assert.equal(q.ok, true);
  const csv = quoteCsv(q);
  for (const l of q.lines) assert.ok(csv.includes(l.name), l.name);
  assert.match(csv, new RegExp(`Job total,${q.cost.total.toFixed(2)}`));
  assert.equal(q.lines.reduce((s, l) => s + l.qty, 0), j.report.totalParts);
});
