import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const DATA = fileURLToPath(new URL("./data/central-park-tmax-normals.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Sakoe, H. & Chiba, S. (1978)", "doi:10.1109/TASSP.1978.1163055", "doi:10.18637/jss.v031.i07", "dtw-python 1.9.0", "No warranty", "not financial"]) assert.ok(HELP.includes(s), s);
});

test("the example file: lag table by month and the distance matrix", () => {
  const r = run([DATA, "--a", "tmax_1871_1900", "--b", "tmax_1991_2020", "--smooth", "15"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /DTW distance between "tmax_1871_1900" and "tmax_1991_2020": 227\.542/);
  assert.match(r.out, /04-02 +05-01 +-14\.3 +100% +0% +0%/);
  assert.match(r.out, /10-01 +10-31 +7\.5 +100%/);
  assert.match(r.out, /Nearest column to each:/);
  assert.doesNotMatch(run([DATA, "--no-matrix"]).out, /Nearest column/);
});

test("settings flow through: --csv, --json, step, window and z-normalisation", () => {
  const csv = run([DATA, "--csv", "--window", "5", "--no-matrix"]).out.split("\n");
  assert.match(csv[0], /^step,index_a,index_b,label_a,label_b,value_tmax_1871_1900,value_tmax_1901_1930,lag,gap_removed$/);
  for (const line of csv.slice(1)) assert.ok(Math.abs(Number(line.split(",")[1]) - Number(line.split(",")[2])) <= 5);
  const j = JSON.parse(run([DATA, "--json", "--step", "symmetric1", "--window-type", "itakura", "--znorm", "--no-matrix"]).out);
  assert.equal(j.settings.step, "symmetric1");
  assert.equal(j.settings.windowType, "itakura");
  assert.equal(j.settings.znorm, true);
  assert.equal(j.pair.normalizedDistance, null);
  assert.equal(j.series, undefined);
  assert.equal(j.pair.profile[0].matched, undefined);
});

test("subsequence mode from stdin", () => {
  const out = execFileSync("node", [CLI, "--mode", "subsequence", "--matches", "2"], { input: "q,s\n1,0\n3,0\n2,1\n,3\n,2\n,0\n,0\n,1\n,3.1\n,2\n,0\n", encoding: "utf8" });
  assert.match(out, /1 +row 3 +row 5 +3 +0\n/);
  assert.match(out, /2 +row 8 +row 10 +3 +0\.033/);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a,t\n1,x\n3,y\n4,z").code, 1);
  assert.throws(() => parseArgs(["--window"]));
  assert.throws(() => parseArgs(["--window", "x"]));
  assert.throws(() => parseArgs(["--step", "fast"]));
});
