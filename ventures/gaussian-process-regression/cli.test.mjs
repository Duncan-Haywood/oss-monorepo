import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const DATA = fileURLToPath(new URL("./data/mauna-loa-co2-2010-2026.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the book and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Rasmussen, Christopher K. I. Williams (2006)", "doi:10.1007/BF01589116", "No warranty", "not financial", "smooth-quasiperiodic"]) assert.ok(HELP.includes(s), s);
});

test("the example file with one kernel: settings, LOO and predictions", () => {
  const r = run([DATA, "--kernel", "smooth-quasiperiodic", "--predict", "2027-01,2030-01"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^Fitted 201 points of co2_ppm against month\./);
  assert.match(r.out, /Mean: straight line .* \(vague prior\)/);
  assert.match(r.out, /period +1 years?/);
  assert.match(r.out, /line 77: x 2016-04/);
  assert.match(r.out, /2027-01 +43\d\.\d+ +\[/);
  assert.match(r.out, /beyond the data/);
});

test("settings flow through: mean, restarts, seed, horizon, --csv and --json", () => {
  const j = JSON.parse(run([DATA, "--kernel", "rbf", "--mean=constant", "--restarts", "0", "--seed", "7", "--horizon", "1", "--json"]).out);
  assert.equal(j.mean, "constant");
  assert.equal(j.trend, null);
  assert.equal(j.params.restarts, 0);
  assert.equal(j.params.seed, 7);
  assert.ok(Math.abs(j.grid.at(-1).x - (j.points.at(-1).x + 1)) < 1e-9);
  const csv = run([DATA, "--kernel", "rbf", "--restarts", "0", "--csv"]).out.split("\n");
  assert.equal(csv.length, 241);
  assert.match(csv[1], /^2010-01,\d+\.\d{6},/);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a,b\n1,2\n3,4").code, 1);
  assert.throws(() => parseArgs(["--restarts"]));
  assert.throws(() => parseArgs(["--restarts", "many"]));
  assert.throws(() => parseArgs(["--period", "-3"]));
});

test("runs as a real process from a pipe", () => {
  const rows = ["x,y", ...Array.from({ length: 30 }, (_, i) => `${i},${Math.sin(i / 3).toFixed(4)}`)];
  const out = execFileSync(process.execPath, [CLI, "--kernel", "rbf", "--restarts", "0"], { input: rows.join("\n"), encoding: "utf8" });
  assert.match(out, /^Fitted 30 points of y against x\./);
});
