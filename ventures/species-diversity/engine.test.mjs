import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, analyzeOne, readAbundance, chao1, ace, curveFunction, coverageAt, sizeForCoverage, bootstrapAssemblage, observedHill, report, SAMPLE, PAPERS, zCrit, lchoose } from "./engine.mjs";

const portal = readFileSync(new URL("./data/portal-rodents.csv", import.meta.url), "utf8");
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("PAPERS carry a citation and what each was used for", () => {
  assert.ok(PAPERS.length >= 8);
  for (const p of PAPERS) { assert.ok(p.key && p.cite && p.used, p.key); }
  assert.ok(PAPERS.some((p) => p.doi === "10.1890/13-0133.1"));
});

test("normal critical values and log binomials", () => {
  near(zCrit(0.95), 1.959963984540054, 1e-12, "z95");
  near(zCrit(0.9), 1.6448536269514722, 1e-12, "z90");
  near(lchoose(10, 3), Math.log(120), 1e-13, "lchoose");
  near(lchoose(5000, 2), Math.log(5000 * 4999 / 2), 1e-9, "lchoose large");
});

test("the three CSV layouts read the same assemblage", () => {
  const long = readAbundance("species,count\nA,3\nB,1\nC,2\nA,1\n");
  assert.equal(long.layout, "long");
  assert.deepEqual(long.assemblages[0].counts, [4, 2, 1]);
  const raw = readAbundance("species\nA\nA\nB\nC\nC\nA\nA\n");
  assert.equal(raw.layout, "raw");
  assert.deepEqual(raw.assemblages[0].counts, [4, 2, 1]);
  const wide = readAbundance("taxon;north;south\nA;4;0\nB;1;5\nC;2;\n");
  assert.equal(wide.layout, "wide");
  assert.deepEqual(wide.assemblages.map((a) => a.name), ["north", "south"]);
  assert.deepEqual(wide.assemblages[0].counts, [4, 2, 1]);
  assert.deepEqual(wide.assemblages[1].counts, [5]);
});

test("a group column splits long data, and bad counts are refused with the row", () => {
  const r = readAbundance(portal, { group: "treatment", count: "individuals" });
  assert.equal(r.assemblages.length, 3);
  assert.equal(r.assemblages.reduce((a, g) => a + g.counts.reduce((x, y) => x + y, 0), 0), 6094);
  assert.throws(() => readAbundance("species,count\nA,3\nB,2.5\n"), /Row 3: "2\.5"/);
  assert.throws(() => readAbundance("species,count\nA,3\n", { group: "site" }), /No column named "site"/);
  assert.throws(() => readAbundance(""), /No data/);
});

test("Chao1 branches: f2 > 0, f2 = 0, and no singletons", () => {
  const a = chao1([10, 5, 2, 1, 1, 1]);
  near(a.estimate, 6 + (19 / 20) * 9 / 2, 1e-12, "f2>0");
  const b = chao1([10, 5, 3, 1, 1]);
  near(b.estimate, 5 + (19 / 20) * 1, 1e-12, "f2=0");
  const c = chao1([10, 5, 3, 2]);
  assert.equal(c.estimate, 4);
  assert.equal(c.method, "no singletons");
  assert.ok(c.lower >= 4 && c.upper >= c.lower);
  // The log-normal interval never goes below the species already seen.
  assert.ok(a.lower > 6 && a.upper > a.estimate);
});

test("ACE is undefined when every rare species is a singleton", () => {
  assert.equal(ace([50, 20, 1, 1, 1]).estimate, null);
  assert.equal(ace([50, 20, 15]).estimate, 3);
});

test("curves: equal to the sample at n, 1 at m = 1, rising, and approaching the estimators", () => {
  const x = SAMPLE.counts;
  const n = x.reduce((a, b) => a + b, 0);
  for (const q of [0, 1, 2]) {
    const f = curveFunction(x, q);
    near(f(n), observedHill(x, q), 1e-12, `at n q=${q}`);
    near(f(1), 1, 1e-12, `at 1 q=${q}`);
    let prev = 0;
    for (const m of [1, 5, 20, 80, n - 1, n, n + 1, 2 * n, 5 * n]) { const v = f(m); assert.ok(v >= prev - 1e-9, `q=${q} m=${m}`); prev = v; }
  }
  near(curveFunction(x, 0)(1e7), chao1(x).estimate, 1e-6, "q0 limit is Chao1");
  const res = analyzeOne("", x, { bootstrap: 0 });
  near(curveFunction(x, 1)(1e7), res.asymptotic[1].estimate, 1e-6, "q1 limit");
  near(curveFunction(x, 2)(1e9), res.asymptotic[2].estimate, 1e-6, "q2 limit");
  // Continuity across n: the step from n-1 to n and from n to n+1 are of similar size.
  const f0 = curveFunction(x, 0);
  const d1 = f0(n) - f0(n - 1), d2 = f0(n + 1) - f0(n);
  assert.ok(Math.abs(d1 - d2) < 0.02, `q0 kink at n: ${d1} vs ${d2}`);
});

test("coverage rises from about 1/n... to 1 and the size for a coverage inverts it", () => {
  const x = SAMPLE.counts;
  const n = x.reduce((a, b) => a + b, 0);
  near(coverageAt(x, n), 1 - (5 / n) * ((n - 1) * 5 / ((n - 1) * 5 + 6)), 1e-12, "Chao-Jost coverage");
  for (const C of [0.5, 0.9, 0.97, 0.99, 0.999]) near(coverageAt(x, sizeForCoverage(x, C)), C, 1e-8, `C=${C}`);
});

test("the bootstrap assemblage sums to one and adds ceil(f0) undetected species", () => {
  const x = SAMPLE.counts;
  const p = bootstrapAssemblage(x);
  near(p.reduce((a, b) => a + b, 0), 1, 1e-12, "sum");
  assert.equal(p.length, x.length + Math.ceil(chao1(x).estimate - x.length));
});

test("analyze is reproducible from its seed and intervals bracket the estimates", () => {
  const a = analyze({ ...SAMPLE, seed: 7, bootstrap: 60 });
  const b = analyze({ ...SAMPLE, seed: 7, bootstrap: 60 });
  assert.deepEqual(a, b);
  const c = analyze({ ...SAMPLE, seed: 8, bootstrap: 60 });
  assert.notDeepEqual(a.groups[0].curve[5].se, c.groups[0].curve[5].se);
  for (const p of a.groups[0].curve) for (const qi of [0, 1, 2]) if (p.lower[qi] != null) assert.ok(p.lower[qi] <= p.qD[qi] && p.qD[qi] <= p.upper[qi]);
  assert.ok(JSON.stringify(a).length > 1000);
  assert.match(a.summary, /157 individuals of 18 species/);
});

test("the Portal example: three treatments compared at one coverage, kangaroo-rat removal least even", () => {
  const r = analyze({ text: portal, group: "treatment", count: "individuals", bootstrap: 50 });
  assert.equal(r.groups.length, 3);
  assert.ok(r.comparison.coverage.level > 0.999);
  const q2 = Object.fromEntries(r.comparison.coverage.rows.map((row) => [row.name, row.values[2]]));
  assert.ok(q2["Kangaroo rats removed"].qD < q2["Unmanipulated control"].qD);
  assert.ok(q2["Kangaroo rats removed"].upper < q2["Unmanipulated control"].lower, "intervals separate");
  assert.match(r.summary, /At 99\.\d\d% coverage, Simpson diversity/);
});

test("the Portal plots: plot 10 sees the fewest species but is mid-table at equal coverage", () => {
  const r = analyze({ text: portal, group: "plot", count: "individuals", bootstrap: 0 });
  assert.equal(r.groups.length, 24);
  const p10 = r.groups.find((g) => g.name === "10");
  assert.equal(p10.S, Math.min(...r.groups.map((g) => g.S)));
  const at = r.comparison.coverage.rows.map((row) => ({ name: row.name, s: row.values[0].qD })).sort((a, b) => b.s - a.s);
  const rank = at.findIndex((x) => x.name === "10") + 1;
  assert.ok(rank > 3 && rank < 18, `plot 10 rank ${rank}`);
});

test("input errors are plain", () => {
  assert.throws(() => analyze({}), /Give abundance data/);
  assert.throws(() => analyze({ counts: [1.5, 2] }), /whole numbers/);
  assert.throws(() => analyze({ counts: [1] }), /at least two individuals/);
  assert.throws(() => analyze({ counts: [3, 2], confidence: 2 }), /confidence/);
  assert.throws(() => analyze({ counts: [3, 2], bootstrap: 1e6 }), /bootstrap/);
});

test("one species, all singletons and tiny samples do not crash", () => {
  for (const x of [[50], [1, 1, 1, 1, 1], [1, 1], [2], [3, 1], [1, 1, 1, 1, 2]]) {
    const r = analyze({ counts: x, bootstrap: 20 });
    const g = r.groups[0];
    for (const p of g.curve) for (const v of p.qD) assert.ok(Number.isFinite(v) || v === Infinity, `${x} m=${p.m}`);
    assert.ok(typeof r.summary === "string" && r.summary.length > 20);
    assert.ok(report(r).includes("order,observed"));
  }
});
