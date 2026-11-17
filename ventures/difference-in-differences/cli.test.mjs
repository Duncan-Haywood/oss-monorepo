import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const castle = readFileSync(new URL("./data/castle.csv", import.meta.url), "utf8");

test("--help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Callaway/);
  assert.match(r.out, /Goodman-Bacon/);
  assert.match(r.out, /not legal, tax, financial/);
  assert.equal(r.out, HELP);
});

test("--example prints the summary, event study and decomposition", () => {
  const r = run(["--example"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /estimated effect on l_homicide is 0\.019/);
  assert.match(r.out, /Event study/);
  assert.match(r.out, /later vs already treated/);
  assert.match(r.out, /2006 +1 unit /);
});

test("a file with flags gives the same JSON as the example", () => {
  const a = JSON.parse(run(["--example", "--json", "--bootstrap", "0"]).out);
  const b = JSON.parse(run(["-", "--unit", "state", "--time", "year", "--outcome", "l_homicide", "--cohort", "first_treated", "--json", "--bootstrap=0"], castle).out);
  assert.deepEqual(a, b);
  assert.equal(a.options.bootstrap, 0);
});

test("--csv prints one event-time row per line", () => {
  const out = run(["--example", "--csv", "--bootstrap", "0"]).out.split("\n");
  assert.equal(out[0], "event_time,att,se,ci_low,ci_high,band_low,band_high,cohorts");
  assert.equal(out.length, 1 + 14);
});

test("bad flags exit 2, bad data exit 1", () => {
  assert.equal(run(["--control", "sometimes"]).code, 2);
  assert.equal(run(["--alpha", "2"]).code, 2);
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run(["-", "--unit", "state", "--time", "year", "--outcome", "l_homicide"], castle).code, 1);
  assert.deepEqual(parseArgs(["x.csv", "--min-cohort", "2"]).minCohort, 2);
});

test("runs as a real process, reading stdin", () => {
  const p = spawnSync(process.execPath, ["cli.mjs", "--unit", "state", "--time", "year", "--outcome", "l_homicide", "--cohort", "first_treated", "--min-cohort", "2"], { cwd: here, input: castle, encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /left out of the group-time estimates/);
});
