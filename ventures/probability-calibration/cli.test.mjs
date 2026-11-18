import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const NFL = fileURLToPath(new URL("./data/nfl-elo-2010-2020.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  assert.equal(run(["--help"]).code, 0);
  for (const s of ["Dimitriadis", "Ayer", "Brier", "Murphy", "Spiegelhalter", "Cox", "Naeini", "Hanley", "doi:10.1073/pnas.2016191118", "No warranty", "not financial"]) assert.ok(HELP.includes(s), s);
});

test("the example runs and prints the decomposition", () => {
  const r = run([NFL, "--resamples", "100"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /CORP decomposition/);
  assert.match(r.out, /Brier {2}0\.21959/);
});

test("settings flow through: --bins, --binning, --json and --csv", () => {
  const j = JSON.parse(run([NFL, "--bins", "5", "--binning", "count", "--resamples", "0", "--json"]).out);
  assert.equal(j.settings.bins, 5);
  assert.equal(j.binned.binning, "count");
  assert.equal(j.consistency, null);
  assert.equal(j.forecasts, undefined);
  const csv = run([NFL, "--resamples", "0", "--csv"]).out.split("\n");
  assert.equal(csv.length, 2931);
  assert.match(csv[0], /^forecast,outcome,isotonic_recalibrated,platt_recalibrated$/);
});

test("bad arguments and bad input give clear errors", () => {
  assert.throws(() => parseArgs(["--alpha", "2"]), /between 0 and 1/);
  assert.throws(() => parseArgs(["--bins"]), /needs a value/);
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
  assert.equal(run(["/no/such/file.csv"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a,b\n1,2\n3,4").code, 1);
});

test("reads stdin as a real process", () => {
  const out = execFileSync(process.execPath, [CLI, "--resamples", "0", "--forecast", "elo_prob_home", "--outcome", "home_won"], { input: readFileSync(NFL), encoding: "utf8" });
  assert.match(out, /Across 2,930 forecasts/);
});
