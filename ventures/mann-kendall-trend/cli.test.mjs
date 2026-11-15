import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const MONTHLY = fileURLToPath(new URL("./data/potomac-monthly-flow.csv", import.meta.url));
const PEAKS = fileURLToPath(new URL("./data/potomac-annual-peaks.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  assert.equal(run(["--help"]).code, 0);
  for (const s of ["Mann", "Kendall", "Sen", "Hamed", "Yue", "Hirsch", "van Belle", "doi:10.1029/WR020i006p00727", "No warranty", "not financial"]) assert.ok(HELP.includes(s), s);
});

test("the monthly example runs the seasonal test with the covariance", () => {
  const r = run([MONTHLY]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Hirsch-Slack covariance/);
  assert.match(r.out, /homogeneity: chi-square/);
  assert.match(r.out, /Sen's slope/);
});

test("settings flow through: --seasons, --correction, --json and --csv", () => {
  const j = JSON.parse(run([MONTHLY, "--seasons", "none", "--correction", "hamed-rao", "--json"]).out);
  assert.equal(j.mode, "single");
  assert.equal(j.test.key, "hamed-rao");
  assert.equal(j.times, undefined);
  const p = JSON.parse(run([PEAKS, "--alpha", "0.1", "--confidence", "0.9", "--json"]).out);
  assert.equal(p.n, 96);
  assert.equal(p.alpha, 0.1);
  const csv = run([PEAKS, "--csv"]).out.split("\n");
  assert.equal(csv[0], "time,value,sen_line,residual");
  assert.equal(csv.length, 97);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a,b\n1,2\n").code, 1);
  assert.equal(run([PEAKS, "--correction", "magic"]).code, 1);
  assert.throws(() => parseArgs(["--alpha"]));
  assert.throws(() => parseArgs(["--alpha", "5"]));
});

test("runs as a real process from a pipe", () => {
  const rows = ["year,count"];
  for (let i = 0; i < 30; i++) rows.push(`${1990 + i},${(20 + 0.5 * i + ((i * 7) % 5)).toFixed(1)}`);
  const out = execFileSync(process.execPath, [CLI, "--correction", "none"], { input: rows.join("\n"), encoding: "utf8" });
  assert.match(out, /^Increasing trend/);
});
