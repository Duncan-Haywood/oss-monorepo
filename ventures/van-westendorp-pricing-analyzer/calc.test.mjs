import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResponses, cleanRows, curvesAt, pricePoints, bootstrapBands, analyze, reportCsv, sampleText, money } from "./calc.mjs";

// Hand-checkable: 4 respondents.
const R = [[10, 20, 30, 40], [12, 22, 32, 44], [8, 18, 28, 36], [14, 24, 34, 48]];

test("parseResponses handles header, currency symbols, tabs, semicolons and junk rows", () => {
  const p = parseResponses("too cheap,cheap,expensive,too expensive\n$10, $20, $30, $40\n12\t22\t32\t44\n8;18;28;36\nfoo,bar\n");
  assert.equal(p.skippedHeader, true);
  assert.equal(p.rows.length, 3);
  assert.equal(p.unparseable, 1);
  assert.deepEqual(p.rows[0], [10, 20, 30, 40]);
});

test("parseResponses accepts space separated numbers and no header", () => {
  const p = parseResponses("10 20 30 40\n5 6 7 8");
  assert.equal(p.skippedHeader, false);
  assert.deepEqual(p.rows, [[10, 20, 30, 40], [5, 6, 7, 8]]);
});

test("cleanRows drops incoherent and non-positive rows and counts them", () => {
  const c = cleanRows([[10, 20, 30, 40], [30, 20, 10, 5], [0, 5, 6, 7], [10, 10, 30, 40]]);
  assert.equal(c.kept.length, 1);
  assert.equal(c.incoherent, 2);
  assert.equal(c.nonPositive, 1);
});

test("curvesAt counts the right side of each answer", () => {
  const c = curvesAt(R, 20);
  assert.equal(c.tooCheap, 0);          // none has tooCheap >= 20
  assert.equal(c.cheap, 3 / 4);         // 20,22,24 >= 20
  assert.equal(c.expensive, 0);         // none <= 20
  assert.equal(c.tooExpensive, 0);
  assert.equal(curvesAt(R, 32).expensive, 3 / 4);   // 28, 30, 32 are <= 32; 34 is not
});

test("curvesAt at extremes: everyone says too cheap at the lowest price, too expensive at the highest", () => {
  assert.equal(curvesAt(R, 8).tooCheap, 1);
  assert.equal(curvesAt(R, 48).tooExpensive, 1);
  assert.equal(curvesAt(R, 48).expensive, 1);
});

test("price points are ordered pmc <= opp <= pme on well-behaved data", () => {
  const pts = pricePoints(cleanRows(parseResponses(sampleText()).rows).kept);
  assert.ok(pts.pmc <= pts.opp && pts.opp <= pts.pme, JSON.stringify(pts));
  assert.ok(pts.pmc < pts.ipp && pts.ipp < pts.pme);
});

test("a symmetric hand example crosses where expected", () => {
  // Every respondent identical: too cheap 10, cheap 20, expensive 30, too expensive 40.
  const rows = Array.from({ length: 10 }, () => [10, 20, 30, 40]);
  const pts = pricePoints(rows);
  // cheap and expensive curves cross between 20 and 30 (cheap falls to 0 after 20, expensive rises to 1 at 30)
  assert.ok(pts.ipp > 20 && pts.ipp < 30, String(pts.ipp));
  // too-cheap falls to 0 after 10; too-expensive is 0 until 40: they cross between 10 and 40
  assert.ok(pts.opp >= 10 && pts.opp <= 40);
});

test("bootstrap is deterministic for a seed and brackets the point estimate", () => {
  const rows = cleanRows(parseResponses(sampleText()).rows).kept;
  const a = bootstrapBands(rows, { seed: 99, resamples: 100 });
  const b = bootstrapBands(rows, { seed: 99, resamples: 100 });
  assert.deepEqual(a, b);
  const pts = pricePoints(rows);
  for (const k of ["pmc", "opp", "ipp", "pme"]) {
    assert.ok(a[k].low <= a[k].high);
    assert.ok(pts[k] >= a[k].low - 3 && pts[k] <= a[k].high + 3, `${k} ${pts[k]} vs ${a[k].low}-${a[k].high}`);
  }
});

test("analyze refuses tiny input and flags small samples", () => {
  assert.match(analyze("1 2 3 4\n2 3 4 5").error, /at least 5/);
  const small = analyze(sampleText().split("\n").slice(0, 16).join("\n"));
  assert.ok(small.findings.some((f) => f.title === "Small sample"));
});

test("analyze flags a high drop rate", () => {
  const good = sampleText().split("\n").slice(1, 41);
  const bad = Array.from({ length: 20 }, () => "40,30,20,10");
  const a = analyze(good.concat(bad).join("\n"));
  assert.equal(a.incoherent, 20);
  assert.ok(a.findings.some((f) => f.title === "Many rows were dropped"));
});

test("analyze never claims willingness to pay or revenue", () => {
  const a = analyze(sampleText());
  assert.ok(a.findings.some((f) => /does not tell you/.test(f.title)));
  assert.equal(a.n, 60);
});

test("reportCsv lists curves and the four points", () => {
  const csv = reportCsv(analyze(sampleText()));
  assert.match(csv, /^price,too_cheap,cheap,expensive,too_expensive/);
  assert.match(csv, /optimal_price,\d/);
  assert.match(csv, /marginal_expensiveness,\d/);
});

test("money formats to two places", () => {
  assert.equal(money(25), "25.00");
  assert.equal(money(21.571428), "21.57");
});
