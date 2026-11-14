import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const DATA = fileURLToPath(new URL("./data/central-park-july.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Marco Cuturi (2013)", "arxiv.org/abs/1306.0895", "doi:10.1561/2200000073", "doi:10.1016/j.jspi.2013.03.018", "No warranty", "not financial"]) assert.ok(HELP.includes(s), s);
});

test("the example file, one column only: exact table and quantile shifts", () => {
  const r = run([DATA, "--group", "period", "--columns", "tmin_c", "--permutations", "199"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /tmin_c +0\.789 +0\.789 +0\.789 +0 +0\.845 +0\.005/);
  assert.match(r.out, /every quantile is higher in 1991-2020/);
  assert.doesNotMatch(r.out, /All columns at once/);
});

test("settings flow through: groups order, --csv and --json", () => {
  const j = JSON.parse(run([DATA, "--groups", "1991-2020,1951-1980", "--columns", "tmax_c", "--permutations", "0", "--json"]).out);
  assert.deepEqual(j.groups, ["1991-2020", "1951-1980"]);
  assert.equal(j.columns[0].pValue, null);
  assert.ok(j.columns[0].meanShift > 0, "reversed groups reverse the sign");
  assert.equal(j.points, undefined);
  const csv = run([DATA, "--columns", "tmin_c,tmax_c", "--permutations", "0", "--energy-permutations", "0", "--blur", "0.05", "--csv"]).out.split("\n");
  assert.equal(csv.length, 3);
  assert.match(csv[0], /^column,n_1951-1980,n_1991-2020,/);
  assert.match(csv[1], /^tmin_c,930,930,/);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a,b\n1,2\n3,4").code, 1);
  assert.throws(() => parseArgs(["--permutations"]));
  assert.throws(() => parseArgs(["--permutations", "many"]));
  assert.throws(() => parseArgs(["--cost", "manhattan"]));
  assert.throws(() => parseArgs(["--blur", "0"]));
});

test("runs as a real process from a pipe", () => {
  const rows = ["arm,ms", ...Array.from({ length: 40 }, (_, i) => `${i % 2 ? "b" : "a"},${(i % 2) * 5 + (i % 7)}`)];
  const out = execFileSync(process.execPath, [CLI, "--permutations", "99"], { input: rows.join("\n"), encoding: "utf8" });
  assert.match(out, /ms: W1 = 4\.95 in its own units, mean shift \+4\.95; every quantile is higher in b/);
});
