import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";
import { SAMPLE_TEXT } from "./engine.mjs";

const data = (f) => fileURLToPath(new URL(`./data/${f}`, import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["G. Matheron (1963)", "doi:10.1007/BF01032109", "doi:10.1007/BF01033232", "No warranty", "Not engineering"]) assert.ok(HELP.includes(s), s);
});

test("text output: models, the check and estimates", () => {
  const r = run([data("era5-wave-height-2024-01.csv"), "--predict", "-30:45"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^Kriged 371 readings of hs_m with an exponential variogram/);
  assert.match(r.out, /exponential .* <- used/);
  assert.match(r.out, /inverse distance {2}RMSE 0\.623/);
  assert.match(r.out, /lon 10, lat 60: 0\.22/);
  assert.match(r.out, /lon -30, lat 45: [\d.]+ \(95% [\d.]+ to [\d.]+/);
});

test("--csv, --loo, --json, fixed parameters and stdin", () => {
  const csv = run([data("era5-wave-height-2024-01.csv"), "--csv", "--grid-x", "20"]).out.split("\n");
  assert.equal(csv[0], "lon,lat,estimate,standard_error");
  assert.ok(csv.length > 50);
  const loo = run([data("era5-wave-height-2024-01.csv"), "--loo"]).out.split("\n");
  assert.equal(loo[0], "lat,lon,hs_m,kriging_loo,kriging_sd,idw_loo,nearest".replace("lat,lon", "lon,lat"));
  assert.equal(loo.length, 372);
  const j = JSON.parse(run([data("era5-wave-height-2024-01.csv"), "--json", "--model", "spherical"]).out);
  assert.equal(j.model.model, "spherical");
  const f = JSON.parse(run([data("era5-wave-height-2024-01.csv"), "--json", "--model", "exponential", "--nugget", "0.1", "--psill", "1", "--range", "5000"]).out);
  assert.deepEqual([f.model.nugget, f.model.psill, f.model.range], [0.1, 1, 5000]);
  const out = execFileSync(process.execPath, [CLI, "--estimator", "cressie"], { input: SAMPLE_TEXT }).toString();
  assert.match(out, /Semivariogram \(cressie\)/);
});

test("errors exit non-zero with a plain message", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run(["--model", "cubic"]).code, 2);
  assert.equal(run(["--lags", "1"]).code, 2);
  assert.equal(run(["--predict", "a:b"]).code, 2);
  assert.equal(run([]).code, 2);
  const r = run([], "x,y,v\n1,1,1\n2,2,2");
  assert.equal(r.code, 1);
  assert.match(r.out, /at least 5 distinct locations/);
  assert.deepEqual(parseArgs(["x.csv", "--lags=9", "--predict", "1:2,3:4"]), { json: false, help: false, csv: false, loo: false, file: "x.csv", opts: { lags: 9, predictAt: [[1, 2], [3, 4]] } });
});
