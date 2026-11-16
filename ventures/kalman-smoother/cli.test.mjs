import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const NILE = fileURLToPath(new URL("./data/nile.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  assert.equal(run(["--help"]).code, 0);
  for (const s of ["Durbin, J. & Koopman, S. J. (2012)", "doi:10.1080/01621459.1997.10473686", "doi:10.1080/07350015.1992.10509913", "No warranty", "not financial"]) assert.ok(HELP.includes(s), s);
});

test("the Nile: shift, outlier, forecast and checks in the text report", () => {
  const r = run([NILE, "--slope", "none", "--horizon", "2"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^Best model by AIC: local level/);
  assert.match(r.out, /1898 +-> 1899 +t +-3\.\d\d/);
  assert.match(r.out, /1913 +t +-3\.\d\d/);
  assert.match(r.out, /\+2 /);
  assert.match(r.out, /Residual checks: Ljung-Box Q\(10\)/);
});

test("settings flow through: --json, --csv, --season, --log, --level", () => {
  const j = JSON.parse(run([NILE, "--json", "--slope=stochastic", "--level", "0.95"]).out);
  assert.equal(j.model.slope, "stochastic");
  assert.equal(j.level, 0.95);
  assert.equal(j.candidates.length, 1);
  const csv = run([NILE, "--csv", "--slope", "none"]).out.split("\n");
  assert.equal(csv.length, 101);
  assert.equal(csv[0], "label,y,level,level_lo,level_hi,one_step_std_error,outlier_t,shift_t");
  assert.equal(JSON.parse(run([NILE, "--json", "--log", "--season", "4", "--slope", "none"]).out).model.season, 4);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "t,y\n1,2\n2,3").code, 1);
  assert.throws(() => parseArgs(["--horizon"]));
  assert.throws(() => parseArgs(["--season", "monthly"]));
  assert.equal(run([NILE, "--slope", "quadratic"]).code, 1);
});

test("runs as a real process from a pipe, filling a gap", () => {
  const rows = ["t,y", ...Array.from({ length: 40 }, (_, i) => `${i + 1},${i === 20 ? "" : (i < 25 ? 5 : 9) + Math.sin(i * 1.7) * 0.3}`)];
  const out = execFileSync(process.execPath, [CLI, "--slope", "none"], { input: rows.join("\n"), encoding: "utf8" });
  assert.match(out, /1 missing value\(s\) were filled/);
  assert.match(out, /25 +-> 26/);
});
