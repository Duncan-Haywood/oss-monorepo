import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, toCsv, HELP } from "./cli.mjs";
import { analyze } from "./engine.mjs";

const DATA = fileURLToPath(new URL("./data/mauna-loa-co2-monthly.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Irma Terpenning (1990)", "William S. Cleveland (1979)", "Rob Hyndman (2006)", "No warranty", "not financial"]) assert.ok(HELP.includes(s), s);
});

test("the example file: monthly, period 12, profile and unusual points", () => {
  const r = run([DATA]);
  assert.equal(r.code, 0);
  assert.match(r.out, /very strong seasonality/);
  assert.match(r.out, /Period 12 \(inferred: monthly/);
  assert.match(r.out, /Seasonal profile/);
  assert.match(r.out, /\n {2}May /);
  assert.match(r.out, /Unusual points/);
});

test("settings flow through: robust, windows, --csv and --json", () => {
  const j = JSON.parse(run([DATA, "--robust", "--seasonal", "13", "--trend=25", "--json"]).out);
  assert.equal(j.params.robust, true);
  assert.equal(j.params.seasonal, 13);
  assert.equal(j.params.trend, 25);
  assert.equal(j.params.outerIter, 15);
  const csv = run([DATA, "--csv"]).out.split("\n");
  assert.equal(csv.length, 630);
  assert.equal(csv[0], "date,observed,trend,seasonal,remainder,seasonally_adjusted,robustness_weight,interpolated");
  assert.match(csv[1], /^1974-05,333\.19,/);
  assert.match(toCsv(analyze({ values: [1, 2, 3, 1, 2, 3, 1, 2, 3], period: 3 })), /^date,observed/);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "1\n2\n3\n4\n5\n6").code, 1);
  assert.throws(() => parseArgs(["--period"]));
  assert.throws(() => parseArgs(["--period", "twelve"]));
});

test("a bare list through stdin with --period", () => {
  const vals = Array.from({ length: 28 }, (_, i) => 50 + [3, -1, -2, 0][i % 4] + i * 0.1).join("\n");
  const r = run(["--period", "4"], vals);
  assert.equal(r.code, 0);
  assert.match(r.out, /Period 4 \(given\)/);
});

test("runs as a real process from a pipe", () => {
  const vals = Array.from({ length: 28 }, (_, i) => 50 + [3, -1, -2, 0][i % 4] + i * 0.1).join("\n");
  const out = execFileSync(process.execPath, [CLI, "--period", "4"], { input: vals, encoding: "utf8" });
  assert.match(out, /seasonality/);
});
