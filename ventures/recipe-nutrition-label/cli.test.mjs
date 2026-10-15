import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SAMPLE } from "./sample.mjs";

const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { input, encoding: "utf8" });

test("reads stdin and prints a label", () => {
  const r = run(["-", "--serving", "30", "--yield", "560", "--serving-text", "1 cookie"], SAMPLE);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^Nutrition Facts/);
  assert.match(r.stdout, /Serving size  1 cookie \(30g\)/);
  assert.match(r.stdout, /Contains: .*Wheat/);
});

test("json and csv formats; missing yield warns on stderr", () => {
  const j = run(["-", "--serving", "30", "--format", "json"], SAMPLE);
  assert.equal(JSON.parse(j.stdout).serving.grams, 30);
  assert.match(j.stderr, /finished/i);
  assert.match(run(["-", "--serving", "30", "--yield", "560", "--format", "csv"], SAMPLE).stdout, /^Nutrient,/);
});

test("bad usage exits 2", () => {
  assert.equal(run([]).status, 2);
  assert.equal(run(["-"], SAMPLE).status, 2);
  assert.equal(run(["-", "--serving", "30", "--format", "xml"], SAMPLE).status, 2);
});
