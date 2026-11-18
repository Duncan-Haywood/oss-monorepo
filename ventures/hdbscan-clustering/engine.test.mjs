import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PAPERS, hdbscan, analyze, parseCsv, scaleColumns, coreDistances, mutualReachabilityMst,
  singleLinkage, condenseTree, clusterStability, adjustedRand, project2d, toCsv, csvCell,
} from "./engine.mjs";

const file = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const REF = JSON.parse(file("eval/reference.json"));
const FILES = { penguins: "data/penguins.csv", blobs: "eval/blobs.csv", moons: "eval/moons.csv" };

function matrix(dataset, columns) {
  const p = parseCsv(file(FILES[dataset]));
  const idx = columns.map((c) => p.columns.indexOf(c));
  return p.rows.filter((r) => idx.every((j) => r[j] !== "NA" && r[j] !== "")).map((r) => idx.map((j) => Number(r[j])));
}

test("reference was produced by scikit-learn 1.9.1 on 18 cases", () => {
  assert.equal(REF.sklearn, "1.9.1");
  assert.equal(REF.cases.length, 18);
  assert.equal(REF.cases.reduce((s, c) => s + c.labels.length, 0), 5712);
});

for (const c of REF.cases) {
  test(`matches scikit-learn row for row: ${c.dataset}, min_cluster_size ${c.minClusterSize}, min_samples ${c.minSamples ?? "default"}, ${c.method}`, () => {
    const { Z } = scaleColumns(matrix(c.dataset, c.columns), "standard");
    const f = hdbscan(Z, { minClusterSize: c.minClusterSize, minSamples: c.minSamples ?? undefined, method: c.method });
    assert.deepEqual(f.labels, c.labels);
    for (let i = 0; i < c.labels.length; i++) {
      assert.ok(Math.abs(f.probabilities[i] - c.probabilities[i]) < 1e-9, `membership row ${i}`);
      assert.ok(Math.abs(f.outlierScores[i] - c.outlierScores[i]) < 1e-9, `GLOSH row ${i}`);
    }
    // The unmodified public estimator differs only by tie order: same structure, near-identical labels.
    assert.ok(adjustedRand(f.labels, c.publicLabels) > 0.9, "public scikit-learn labels far off");
  });
}

test("the public estimator's tie order moves at most 1 label in excess of mass, up to 96 in leaf", () => {
  let eom = 0, leaf = 0;
  for (const c of REF.cases) {
    const moved = c.labels.filter((l, i) => l !== c.publicLabels[i]).length;
    if (c.method === "eom") eom = Math.max(eom, moved);
    else leaf = Math.max(leaf, moved);
  }
  assert.equal(eom, 1);
  assert.equal(leaf, 96);
});

test("core distance counts the row itself; mutual reachability weights are at least both core distances", () => {
  const X = [[0], [1], [3], [7]];
  assert.deepEqual(Array.from(coreDistances(X, 1)), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(coreDistances(X, 2)), [1, 1, 2, 4]);
  assert.deepEqual(Array.from(coreDistances(X, 3)), [3, 2, 3, 6]);
  const core = coreDistances(X, 2);
  const mst = mutualReachabilityMst(X, core);
  assert.equal(mst.length, 3);
  for (const e of mst) assert.ok(e.w >= core[e.a] && e.w >= core[e.b] && e.w >= Math.abs(X[e.a][0] - X[e.b][0]));
  assert.deepEqual(mst.map((e) => e.w).sort((a, b) => a - b), [1, 2, 4]);
});

test("the spanning tree has minimum total weight (checked against Kruskal on the full graph)", () => {
  const X = matrix("blobs", ["x", "y"]).slice(0, 120);
  const core = coreDistances(X, 4);
  const prim = mutualReachabilityMst(X, core).reduce((s, e) => s + e.w, 0);
  const edges = [];
  for (let i = 0; i < X.length; i++) for (let j = i + 1; j < X.length; j++) edges.push([Math.max(core[i], core[j], Math.hypot(X[i][0] - X[j][0], X[i][1] - X[j][1])), i, j]);
  edges.sort((a, b) => a[0] - b[0]);
  const parent = X.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  let kruskal = 0;
  for (const [w, i, j] of edges) { const a = find(i), b = find(j); if (a !== b) { parent[a] = b; kruskal += w; } }
  assert.ok(Math.abs(prim - kruskal) < 1e-9);
});

test("condensed tree accounts for every row exactly once and stability is non-negative", () => {
  const { Z } = scaleColumns(matrix("penguins", ["bill_length_mm", "bill_depth_mm", "flipper_length_mm", "body_mass_g"]));
  const n = Z.length;
  const tree = condenseTree(singleLinkage(mutualReachabilityMst(Z, coreDistances(Z, 5)), n), 5);
  const points = tree.child.filter((c) => c < n).sort((a, b) => a - b);
  assert.deepEqual(points, Array.from({ length: n }, (_, i) => i));
  for (let i = 0; i < tree.child.length; i++) if (tree.child[i] >= n) assert.ok(tree.size[i] >= 5);
  for (const v of clusterStability(tree).values()) assert.ok(v >= 0);
});

test("two blobs with stray points: two clusters; a far stray is noise, a bridging stray joins a cluster at membership near 0 (as in scikit-learn)", () => {
  const X = [];
  for (let i = 0; i < 40; i++) X.push([Math.cos(i) * 0.3, Math.sin(i * 1.3) * 0.3]);
  for (let i = 0; i < 40; i++) X.push([10 + Math.cos(i * 0.7) * 0.3, 10 + Math.sin(i * 1.1) * 0.3]);
  X.push([5, 5], [-6, 9]);
  const f = hdbscan(X, { minClusterSize: 10 });
  assert.equal(f.clusters.length, 2);
  assert.equal(new Set(f.labels.slice(0, 40)).size, 1);
  assert.equal(new Set(f.labels.slice(40, 80)).size, 1);
  assert.notEqual(f.labels[0], f.labels[40]);
  // (5, 5) is the bridge the spanning tree runs through, so it leaves cluster
  // 0 just below the root split instead of the root: scikit-learn 1.9.1 gives
  // label 0, membership 0.0311 on these same points.
  assert.deepEqual(f.labels.slice(80), [0, -1]);
  assert.ok(Math.abs(f.probabilities[80] - 0.03113813) < 1e-7);
  assert.equal(f.probabilities[81], 0);
  assert.ok(f.outlierScores[80] > 0.95 && f.outlierScores[81] > 0.95);
});

test("the result does not depend on row order (up to cluster numbering) or on shifting and rescaling a column", () => {
  const base = matrix("blobs", ["x", "y"]);
  const ref = hdbscan(scaleColumns(base).Z, { minClusterSize: 10, minSamples: 3 }).labels;
  const shifted = base.map(([x, y]) => [x * 1000 + 7, y - 3]);
  assert.deepEqual(hdbscan(scaleColumns(shifted).Z, { minClusterSize: 10, minSamples: 3 }).labels, ref);
  const perm = base.map((_, i) => i).reverse();
  const back = hdbscan(scaleColumns(perm.map((i) => base[i])).Z, { minClusterSize: 10, minSamples: 3 }).labels;
  const unperm = new Array(base.length);
  perm.forEach((i, k) => { unperm[i] = back[k]; });
  assert.ok(adjustedRand(unperm, ref) > 0.98);
});

test("leaf selection on the penguins separates the three species; excess of mass merges Adelie and Chinstrap", () => {
  const csv = file("data/penguins.csv");
  const eom = analyze({ csv });
  assert.equal(eom.clusterCount, 2);
  assert.equal(eom.noiseCount, 2);
  const gentoo = eom.clusters.find((c) => c.mostly[0].values[0].value === "Gentoo");
  assert.equal(gentoo.size, 122);
  assert.deepEqual(gentoo.mostly[0].values.map((v) => v.value), ["Gentoo"]);
  const leaf = analyze({ csv, method: "leaf", minClusterSize: 15, minSamples: 5 });
  assert.equal(leaf.clusterCount, 3);
  const species = parseCsv(csv).rows.filter((r) => r[2] !== "NA").map((r) => r[0]);
  const labels = leaf.labels.map((l, i) => (l < 0 ? `noise${i}` : l));
  const kept = species.filter((_, i) => leaf.labels[i] >= 0);
  assert.ok(adjustedRand(labels.filter((l, i) => leaf.labels[i] >= 0), kept) > 0.9);
});

test("analyze: column choice, missing rows dropped, warnings and errors", () => {
  const r = analyze({ csv: file("data/penguins.csv") });
  assert.deepEqual(r.features, ["bill_length_mm", "bill_depth_mm", "flipper_length_mm", "body_mass_g"]);
  assert.equal(r.n, 342);
  assert.ok(r.warnings.some((w) => /Left out "year"/.test(w)));
  assert.ok(r.warnings.some((w) => /2 rows with a missing value .*\(lines 5, 273\)/.test(w)));
  assert.match(r.summary, /^Found 2 clusters in 342 rows, plus 2 noise rows/);
  assert.match(analyze({ csv: "a,b\n1,2\n3,4" }).error, /Only 2 complete rows/);
  assert.match(analyze({ csv: "a,b\n" + "1,1\n".repeat(30), columns: "a,b" }).error, /single value/);
  assert.match(analyze({ csv: file("data/penguins.csv"), columns: "species" }).error, /not numeric/);
  assert.match(analyze({ csv: file("data/penguins.csv"), method: "kmeans" }).error, /method must be/);
  assert.match(analyze({ csv: file("data/penguins.csv"), minClusterSize: 1 }).error, /minClusterSize must be/);
  assert.match(analyze({ csv: file("data/penguins.csv"), scale: "log" }).error, /scale must be/);
  const objs = analyze({ rows: [...Array(30)].map((_, i) => ({ x: i < 15 ? i * 0.01 : 5 + i * 0.01, y: 1 })) });
  assert.equal(objs.clusterCount, 2);
});

test("a single dense blob: no cluster by default, one when allowSingleCluster is on", () => {
  const rows = Array.from({ length: 60 }, (_, i) => [Math.cos(i * 2.4) * (1 + (i % 5) / 10), Math.sin(i * 2.4) * (1 + (i % 7) / 10)]);
  const off = analyze({ rows, columnNames: ["x", "y"], minClusterSize: 10 });
  const on = analyze({ rows, columnNames: ["x", "y"], minClusterSize: 10, allowSingleCluster: true });
  assert.ok(on.clusterCount >= 1);
  assert.ok(on.noiseCount <= off.noiseCount);
});

test("projection: first component carries the most variance; CSV export guards formulas", () => {
  const { Z } = scaleColumns(matrix("penguins", ["bill_length_mm", "bill_depth_mm", "flipper_length_mm", "body_mass_g"]));
  const p = project2d(Z);
  assert.ok(p.explained[0] > p.explained[1] && p.explained[0] + p.explained[1] <= 1 + 1e-9);
  assert.ok(Math.abs(p.explained[0] - 0.6884) < 1e-3);
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("-3.5"), "-3.5");
  const csv = toCsv(analyze({ csv: file("data/penguins.csv") })).trim().split("\n");
  assert.equal(csv.length, 343);
  assert.equal(csv[0], "label,line,cluster,membership,outlier_score");
  assert.match(csv[1], /^row 1,2,(\d+|noise),\d\.\d{6},\d\.\d{6}$/);
});

test("PAPERS cite each method with a DOI, what was implemented and the deviations", () => {
  assert.equal(PAPERS.length, 3);
  for (const p of PAPERS) {
    assert.match(p.doi, /^10\./);
    assert.ok(p.implemented.length > 80 && p.deviations.length > 40);
  }
});
