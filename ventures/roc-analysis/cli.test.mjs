import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const WDBC = fileURLToPath(new URL("./data/wdbc-markers.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  assert.equal(run(["--help"]).code, 0);
  for (const s of ["DeLong", "Weichao Xu", "Hanley", "Youden", "Wilson", "Simel", "McClish", "Vickers", "doi:10.2307/2531595", "No warranty", "not medical"]) assert.ok(HELP.includes(s), s);
});

test("the example runs and prints the paired comparisons", () => {
  const r = run([WDBC, "--resamples", "0"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Paired comparisons \(DeLong\)/);
  assert.match(r.out, /worst_concave_points - worst_perimeter: -0\.0087/);
  assert.match(r.out, /All equal: chi-square 391\.75/);
});

test("settings flow through: --scores, --lower, --threshold, --json and --csv", () => {
  const j = JSON.parse(run([WDBC, "--scores", "mean_texture,worst_perimeter", "--lower", "mean_texture", "--threshold", "18", "--resamples", "0", "--json"]).out);
  assert.deepEqual(j.columns.scores, ["mean_texture", "worst_perimeter"]);
  assert.equal(j.results[0].direction, "lower");
  assert.ok(j.results[0].auc < 0.5);
  assert.equal(j.results[0].at.threshold, 18);
  assert.equal(j.results[0].curve, undefined);
  const csv = run([WDBC, "--scores", "worst_perimeter", "--resamples", "0", "--csv"]).out.split("\n");
  assert.match(csv[0], /^score,threshold,true_positives,false_positives,sensitivity,specificity,youden_j$/);
  assert.ok(csv.length > 400);
});

test("bad arguments and bad input give clear errors", () => {
  assert.throws(() => parseArgs(["--alpha", "2"]), /between 0 and 1/);
  assert.throws(() => parseArgs(["--scores"]), /needs a value/);
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
  assert.equal(run(["/no/such/file.csv"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a,b\nx,2\ny,4\nz,5").code, 1);
});

test("reads stdin as a real process", () => {
  const out = execFileSync(process.execPath, [CLI, "--resamples", "0", "--scores", "worst_perimeter", "--outcome", "diagnosis"], { input: readFileSync(WDBC), encoding: "utf8" });
  assert.match(out, /Across 569 rows \(212 cases, 357 non-cases\), worst_perimeter has AUC 0\.975/);
});
