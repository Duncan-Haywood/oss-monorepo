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
  for (const s of ["H. Passing and W. Bablok (1983)", "doi:10.1515/cclm.1983.21.11.709", "doi:10.1016/S0140-6736(86)90837-8", "No warranty", "Not medical"]) assert.ok(HELP.includes(s), s);
});

test("text output on the NHANES file", () => {
  const r = run([data("nhanes-2017-2018-systolic.csv"), "--levels", "130"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^oscillometric_sbp reads lower than mercury_sbp by 1\.31 on average/);
  assert.match(r.out, /Passing-Bablok +-3\.9222 .* 1\.0232 \(1\.0003 to 1\.0413\)/);
  assert.match(r.out, /Least squares .* 0\.87164/);
  assert.match(r.out, /at 130: Deming -1\.228/);
  assert.match(r.out, /8,850,570 slopes \(slope selection by inversion counting\)/);
});

test("--csv, --json, --percent, columns and stdin", () => {
  const csv = run([data("bland-altman-1986-peak-flow.csv"), "--csv"]).out.split("\n");
  assert.equal(csv[0], "wright_l_min,mini_wright_l_min,mean,difference,passing_bablok_fit,deming_fit");
  assert.equal(csv.length, 18);
  const j = JSON.parse(run([data("bland-altman-1986-peak-flow.csv"), "--json", "--multiplier", "2", "--x", "mini_wright_l_min", "--y", "wright_l_min"]).out);
  assert.equal(j.blandAltman.bias.toFixed(1), "-2.1");
  assert.equal(j.blandAltman.diffs, undefined);
  const p = JSON.parse(run([data("bland-altman-1986-peak-flow.csv"), "--json", "--percent", "--no-weighted"]).out);
  assert.equal(p.blandAltman.scale, "percent");
  assert.equal(p.weightedDeming, null);
  const out = execFileSync(process.execPath, [CLI, "--lambda", "2", "--levels", "10"], { input: SAMPLE_TEXT }).toString();
  assert.match(out, /Deming \(λ=2\)/);
  assert.match(out, /at 10: Deming/);
});

test("errors exit non-zero with a plain message", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run(["--lambda", "0"]).code, 2);
  assert.equal(run(["--levels", "a,b"]).code, 2);
  assert.equal(run(["--alpha", "0.9"]).code, 2);
  assert.equal(run([]).code, 2);
  const r = run([], "a,b\n1,1\n2,2");
  assert.equal(r.code, 1);
  assert.match(r.out, /at least 5/);
  assert.deepEqual(parseArgs(["x.csv", "--lambda=2", "--levels", "1,2", "--percent"]), { json: false, help: false, csv: false, file: "x.csv", opts: { lambda: 2, decisionLevels: [1, 2], baScale: "percent" } });
});
