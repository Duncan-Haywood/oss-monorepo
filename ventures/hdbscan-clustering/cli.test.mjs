import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const DATA = fileURLToPath(new URL("./data/penguins.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Joerg Sander (2013)", "doi:10.1007/978-3-642-37456-2_14", "doi:10.1145/2733381", "doi:10.1109/ICDMW.2017.12", "No warranty", "not financial"]) assert.ok(HELP.includes(s), s);
});

test("the example file: clusters, make-up and outliers", () => {
  const r = run([DATA, "--top", "3"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^Found 2 clusters in 342 rows/);
  assert.match(r.out, /species: Gentoo 122\n/);
  assert.match(r.out, /species: Adelie 151, Chinstrap 67/);
  assert.match(r.out, /Note: Left out "year"/);
  assert.equal((r.out.match(/^ {2}row \d+ +\d\.\d{3}/gm) || []).length, 3);
});

test("settings flow through: leaf, sizes, --csv and --json", () => {
  const j = JSON.parse(run([DATA, "--method", "leaf", "--min-cluster-size=15", "--min-samples", "5", "--json"]).out);
  assert.equal(j.clusterCount, 3);
  assert.equal(j.params.method, "leaf");
  assert.equal(j.params.minSamples, 5);
  assert.equal(j.matrix, undefined);
  const csv = run([DATA, "--csv"]).out.split("\n");
  assert.equal(csv.length, 343);
  assert.equal(csv[0], "label,line,cluster,membership,outlier_score");
  assert.equal(JSON.parse(run([DATA, "--columns", "flipper_length_mm,body_mass_g", "--json"]).out).features.length, 2);
  assert.equal(JSON.parse(run([DATA, "--allow-single-cluster", "--json"]).out).params.allowSingleCluster, true);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a,b\n1,2\n3,4").code, 1);
  assert.throws(() => parseArgs(["--min-cluster-size"]));
  assert.throws(() => parseArgs(["--min-cluster-size", "few"]));
  assert.equal(run([DATA, "--method", "kmeans"]).code, 1);
});

test("runs as a real process from a pipe", () => {
  const rows = ["x,y", ...Array.from({ length: 30 }, (_, i) => `${(i % 6) / 10},${Math.floor(i / 6) / 10}`), ...Array.from({ length: 30 }, (_, i) => `${9 + (i % 6) / 10},${9 + Math.floor(i / 6) / 10}`), "-9,9"];
  const out = execFileSync(process.execPath, [CLI, "--min-cluster-size", "10", "--top", "1"], { input: rows.join("\n"), encoding: "utf8" });
  assert.match(out, /^Found 2 clusters in 61 rows, plus 1 noise row/);
  assert.match(out, /row 61 +\d\.\d{3}  noise/);
});
