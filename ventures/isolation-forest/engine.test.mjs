import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, fitForest, scoreRows, pathLengths, averagePathLength, auc, rng, parseCsv, profileColumns, toCsv, csvCell, PAPERS, DEFAULTS } from "./engine.mjs";

const file = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const REF = JSON.parse(file("./eval/reference.json"));

const median = (a) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  const k = s.length;
  return k % 2 ? s[(k - 1) / 2] : (s[k / 2 - 1] + s[k / 2]) / 2;
};

// The same three matrices eval/reference.py hands to scikit-learn.
function load(name) {
  if (name === "wholesale") {
    const lines = file("./data/wholesale-customers.csv").trim().split(/\r?\n/);
    return { X: lines.slice(1).map((l) => l.split(",").slice(2).map(Number)) };
  }
  if (name === "ionosphere") {
    const rows = file("./data/ionosphere.data").trim().split("\n").map((l) => l.split(","));
    return { X: rows.map((r) => r.slice(0, -1).map(Number)), y: rows.map((r) => (r.at(-1).trim() === "b" ? 1 : 0)) };
  }
  const rows = file("./data/breast-cancer-wisconsin.data").trim().split("\n").map((l) => l.split(","));
  const X = rows.map((r) => r.slice(1, -1).map((v) => (v.trim() === "?" ? NaN : Number(v))));
  for (let j = 0; j < X[0].length; j++) {
    const m = median(X.map((x) => x[j]));
    for (const x of X) if (!Number.isFinite(x[j])) x[j] = m;
  }
  return { X, y: rows.map((r) => (r.at(-1).trim() === "4" ? 1 : 0)) };
}

function gaussianCloud(n, d, seed) {
  const r = rng(seed);
  const normal = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return Array.from({ length: n }, () => Array.from({ length: d }, normal));
}

test("c(n) matches scikit-learn's _average_path_length", () => {
  for (const [n, c] of Object.entries(REF.c)) assert.ok(Math.abs(averagePathLength(Number(n)) - c) < 1e-12, `c(${n})`);
  assert.equal(averagePathLength(0), 0);
});

for (const name of ["wholesale", "ionosphere", "breast"]) {
  test(`${name}: expected scores from 20,000 trees agree with scikit-learn ${REF.sklearn}`, () => {
    const { X } = load(name);
    const ref = REF.datasets[name].scores;
    const s = scoreRows(fitForest(X, { trees: REF.big_forest_trees, seed: 1 }), X);
    assert.equal(s.length, ref.length);
    const d = s.map((v, i) => v - ref[i]);
    const maxAbs = Math.max(...d.map(Math.abs));
    const meanAbs = d.reduce((a, b) => a + Math.abs(b), 0) / d.length;
    const bias = d.reduce((a, b) => a + b, 0) / d.length;
    // Two independent 20,000-tree forests of this engine differ by about
    // 0.003 at most and 0.0006 on average (Monte Carlo noise); a different
    // splitting rule would move whole groups of rows by 0.01 or more.
    assert.ok(maxAbs < 0.006, `max |diff| ${maxAbs}`);
    assert.ok(meanAbs < 0.0012, `mean |diff| ${meanAbs}`);
    assert.ok(Math.abs(bias) < 0.0006, `bias ${bias}`);
  });
}

for (const name of ["ionosphere", "breast"]) {
  test(`${name}: AUC at the default 100 trees matches scikit-learn's over seeds`, () => {
    const { X, y } = load(name);
    const ref = REF.datasets[name];
    const aucs = Array.from({ length: 20 }, (_, k) => auc(scoreRows(fitForest(X, { seed: 100 + k }), X), y));
    const mean = aucs.reduce((a, b) => a + b, 0) / aucs.length;
    // scikit-learn: 50 seeds; the bound is four standard errors of a 20-seed mean.
    assert.ok(Math.abs(mean - ref.auc_default_mean) < (4 * ref.auc_default_sd) / Math.sqrt(20) + 1e-3, `${mean} vs ${ref.auc_default_mean}`);
  });
}

test("the same seed grows the same forest; another seed does not", () => {
  const X = gaussianCloud(300, 3, 7);
  const a = scoreRows(fitForest(X, { seed: 5 }), X);
  const b = scoreRows(fitForest(X, { seed: 5 }), X);
  const c = scoreRows(fitForest(X, { seed: 6 }), X);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("scores do not change when a column is rescaled or shifted", () => {
  const X = gaussianCloud(200, 3, 11);
  const Y = X.map(([u, v, w]) => [u * 1000 + 7, v * 0.01 - 3, w]);
  const a = scoreRows(fitForest(X, { seed: 3 }), X);
  const b = scoreRows(fitForest(Y, { seed: 3 }), Y);
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-12);
});

test("a planted outlier ranks first and scores near 1; scores stay in (0, 1]", () => {
  const X = gaussianCloud(500, 4, 21);
  X.push([8, -8, 8, -8]);
  const s = scoreRows(fitForest(X, { seed: 1 }), X);
  const best = s.indexOf(Math.max(...s));
  assert.equal(best, 500);
  assert.ok(s[500] > 0.75, String(s[500]));
  assert.ok(s.every((v) => v > 0 && v <= 1));
});

test("paths stop at the height limit, and identical rows form one leaf", () => {
  const X = gaussianCloud(1000, 2, 4);
  const model = fitForest(X, { trees: 20, seed: 2 });
  assert.equal(model.sampleSize, 256);
  assert.equal(model.heightLimit, 8);
  const { mean } = pathLengths(model, X);
  assert.ok(Math.max(...mean) <= 8 + averagePathLength(256));
  // Constant columns are never split on; duplicate rows share a leaf.
  const D = Array.from({ length: 40 }, (_, i) => [i < 20 ? 1 : 2, 5]);
  const m2 = fitForest(D, { trees: 5, seed: 1 });
  for (const tr of m2.trees) assert.ok([...tr.feat].every((f) => f === -1 || f === 0));
  const h = pathLengths(m2, D).mean;
  for (let i = 0; i < 40; i++) assert.ok(h[i] > 1, "the duplicate group is charged c(size)");
});

test("subsample larger than the data falls back to every row", () => {
  const X = gaussianCloud(30, 2, 9);
  const m = fitForest(X, { sampleSize: 256, trees: 3 });
  assert.equal(m.sampleSize, 30);
  assert.equal(m.heightLimit, 5);
});

test("auc handles ties and degenerate labels", () => {
  assert.equal(auc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1]), 0.75);
  assert.equal(auc([0.5, 0.5], [0, 1]), 0.5);
  assert.equal(auc([0.1, 0.2], [1, 1]), null);
});

test("wholesale example: codes left out, the spending columns scored, the top row explained", () => {
  const r = analyze({ csv: file("./data/wholesale-customers.csv") });
  assert.equal(r.n, 440);
  assert.deepEqual(r.features, ["Fresh", "Milk", "Grocery", "Frozen", "Detergents_Paper", "Delicassen"]);
  assert.match(r.warnings[0], /Left out "Channel" \(a code with 2 values\), "Region" \(a code with 3 values\)/);
  assert.equal(r.params.trees, DEFAULTS.trees);
  assert.equal(r.params.sampleSize, 256);
  assert.equal(r.top.length, 20);
  assert.equal(r.top[0].label, "row 184");
  assert.equal(r.top[0].line, 185);
  assert.equal(r.top[0].standsOut[0].column, "Delicassen");
  assert.equal(r.top[0].standsOut[0].value, 47943);
  assert.ok(r.flaggedCount > 10 && r.flaggedCount < 60, String(r.flaggedCount));
  assert.equal(r.flagged.filter(Boolean).length, r.flaggedCount);
  assert.ok(r.scores.filter((s) => s > 0.5).length === r.flaggedCount);
  assert.match(r.summary, /score above 0\.5/);
  assert.match(r.summary, /The most unusual is row 184/);
  assert.equal(r.histogram.reduce((a, b) => a + b.count, 0), 440);
  assert.equal(r.histogram.reduce((a, b) => a + b.flagged, 0), r.flaggedCount);
  // Among the top five, the 20-tree-noise-free result: all are big spenders in some column.
  for (const t of r.top.slice(0, 5)) assert.ok(t.standsOut.length >= 1 && t.standsOut[0].z > 5);
});

test("contamination flags exactly that share; columns and seed are honoured", () => {
  const csv = file("./data/wholesale-customers.csv");
  const r = analyze({ csv, contamination: 0.05 });
  assert.equal(r.flaggedCount, 22);
  assert.match(r.summary, /top 5% as asked: 22 rows of 440/);
  const s = analyze({ csv, columns: "Fresh,Milk", seed: 9, trees: 50, top: 3 });
  assert.deepEqual(s.features, ["Fresh", "Milk"]);
  assert.equal(s.top.length, 3);
  assert.equal(s.params.seed, 9);
  assert.notDeepEqual(s.scores, r.scores);
  const withCodes = analyze({ csv, columns: ["Channel", "Region", "Fresh"] });
  assert.deepEqual(withCodes.features, ["Channel", "Region", "Fresh"]);
});

test("ID columns, text labels and missing cells", () => {
  const rows = ["id,name,amount,items"];
  const r = rng(3);
  for (let i = 1; i <= 120; i++) rows.push(`${i},cust${i},${(100 + 10 * r()).toFixed(2)},${i % 7 === 0 ? "" : 3 + Math.floor(r() * 3)}`);
  rows.push("121,big spender,9000,40");
  const a = analyze({ csv: rows.join("\n") });
  assert.deepEqual(a.features, ["amount", "items"]);
  assert.match(a.warnings.join(" "), /"id" \(looks like an ID\)/);
  assert.match(a.warnings.join(" "), /Text column "name"/);
  assert.match(a.warnings.join(" "), /filled with the column median: 17 in "items"/);
  assert.equal(a.labelColumn, "id");
  assert.equal(a.top[0].label, "121");
  const b = analyze({ csv: rows.join("\n"), labelColumn: "name" });
  assert.equal(b.top[0].label, "big spender");
  assert.match(b.summary, /big spender \(line 122\)/);
});

test("rows as objects or arrays, headerless CSV, semicolons", () => {
  const X = gaussianCloud(80, 2, 1).map(([u, v]) => ({ u, v }));
  X.push({ u: 9, v: 9 });
  assert.equal(analyze({ rows: X }).top[0].index, 80);
  const A = X.map((o) => [o.u, o.v]);
  assert.equal(analyze({ rows: A, columnNames: ["x", "y"] }).features.join(), "x,y");
  const headerless = A.map((r) => r.join(",")).join("\n");
  const h = analyze({ csv: headerless });
  assert.deepEqual(h.features, ["c1", "c2"]);
  assert.equal(h.top[0].line, 81);
  const semi = "a;b\n" + A.map((r) => r.map((v) => v.toFixed(3)).join(";")).join("\n");
  assert.equal(analyze({ csv: semi }).top[0].index, 80);
  assert.equal(parseCsv('x,y\n"1,000",2\n3,4').rows[0][0], "1,000");
  assert.equal(profileColumns(parseCsv('x,y\n"1,000",2\n3,4'))[0].numeric, true);
});

test("errors are explained, not thrown", () => {
  assert.match(analyze({ csv: "" }).error, /empty/);
  assert.match(analyze({ csv: "a,b\n1,2\n3,4" }).error, /Only 2 rows/);
  assert.match(analyze({ csv: "name\nx\ny" }).error, /No numeric columns/);
  assert.match(analyze({ csv: "a,b\n1,2\n3" }).error, /Line 3 has 1 fields/);
  assert.match(analyze({ csv: "a,a\n1,2" }).error, /appears twice/);
  const flat = "a\n" + Array(20).fill(5).join("\n");
  assert.match(analyze({ csv: flat, columns: "a" }).error, /single value/);
  const csv = file("./data/wholesale-customers.csv");
  assert.match(analyze({ csv, columns: "Nope" }).error, /no column "Nope"/);
  assert.match(analyze({ csv, contamination: 0.9 }).error, /contamination/);
  assert.match(analyze({ csv, trees: 0 }).error, /trees/);
  assert.match(analyze({ csv, sampleSize: 1 }).error, /sampleSize/);
});

test("CSV export guards against formula injection", () => {
  const r = analyze({ rows: [...gaussianCloud(40, 2, 2).map(([u, v], i) => ({ who: i ? `p${i}` : "=cmd()", u, v }))] });
  const out = toCsv(r).split("\n");
  assert.equal(out[0], "label,line,score,rank,flagged,mean_path_length");
  assert.ok(out.some((l) => l.startsWith("'=cmd()")));
  assert.equal(csvCell("-12.5"), "-12.5");
  assert.equal(csvCell('a"b'), '"a""b"');
});

test("PAPERS carries both papers with what was implemented and how it differs", () => {
  assert.equal(PAPERS.length, 2);
  assert.equal(PAPERS[0].doi, "10.1109/ICDM.2008.17");
  assert.equal(PAPERS[1].doi, "10.1145/2133360.2133363");
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], k);
});
