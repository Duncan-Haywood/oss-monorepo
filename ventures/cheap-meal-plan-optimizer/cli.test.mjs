import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs, run } from "./cli.mjs";
import { SAMPLE_FOODS, parseFoods, validateSpec, solve, DEFAULTS } from "./calc.mjs";

test("cli report matches the library solve on the starter foods", () => {
  const spec = { ...DEFAULTS, foods: parseFoods(SAMPLE_FOODS).foods };
  assert.deepEqual(validateSpec(spec), []);
  const res = solve(spec);
  const r = run(SAMPLE_FOODS, parseArgs([]));
  assert.equal(r.code, 0);
  assert.ok(r.out.includes(`$${res.cost.toFixed(2)} a day`));
});

test("json output is verified and csv has a total row", () => {
  const j = JSON.parse(run(SAMPLE_FOODS, parseArgs(["--json"])).out);
  assert.ok(j.dailyCost > 0 && j.verified);
  assert.ok(run(SAMPLE_FOODS, parseArgs(["--csv"])).out.includes('"Total"'));
});

test("a higher protein minimum never costs less", () => {
  const lo = JSON.parse(run(SAMPLE_FOODS, parseArgs(["--json", "--protein", "80"])).out).dailyCost;
  const hi = JSON.parse(run(SAMPLE_FOODS, parseArgs(["--json", "--protein", "150"])).out).dailyCost;
  assert.ok(hi >= lo - 1e-9);
});

test("shopping list scales with people", () => {
  assert.ok(run(SAMPLE_FOODS, parseArgs(["--shopping", "--people", "3"])).out.includes("for 3 people"));
});

test("refuses a plan under 1200 kcal and bad options", () => {
  const r = run(SAMPLE_FOODS, parseArgs(["--kcal-min", "900", "--kcal-max", "1000"]));
  assert.equal(r.code, 2);
  assert.throws(() => parseArgs(["--protein"]), /needs a number/);
  assert.throws(() => parseArgs(["--bogus"]), /Unknown option/);
  assert.throws(() => parseArgs(["--style", "nope"]), /--style/);
});

test("infeasible targets exit 1 with a reason", () => {
  const r = run(SAMPLE_FOODS, parseArgs(["--protein", "900"]));
  assert.equal(r.code, 1);
});

test("the script runs end to end with --example and exits 2 with no input", () => {
  const out = execFileSync("node", ["cli.mjs", "--example"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /Cheapest plan: \$/);
  const bad = spawnSync("node", ["cli.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.equal(bad.status, 2);
});
