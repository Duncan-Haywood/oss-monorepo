import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/projects.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("compare prints the needed fee, walk-away and each model", async () => {
  const r = await run(["compare"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^Expected 101\.3 hours/);
  assert.match(r.output, /Fee needed for target: \$10,125\.00 {3}Walk-away: \$7,593\.75/);
  assert.match(r.output, /Flat fee +\$8,500\.00 +\$83\.95/);
  assert.match(r.output, /below target at baseline/);
  assert.match(r.output, /not market rates/);
});

test("compare --json, flags and `none` change the answer", async () => {
  const a = JSON.parse((await run(["compare", "--json"])).output);
  const b = JSON.parse((await run(["compare", "--json", "--overrun", "60", "--flat", "none", "--percent", "none"])).output);
  assert.ok(b.expected > a.expected);
  assert.equal(b.models.some((m) => m.id === "flat"), false);
  assert.equal(a.models.some((m) => m.id === "flat"), true);
});

test("history groups by model and ranks projects", async () => {
  const r = await run(["history", "p.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^5 of 8 projects earned under \$100\.00 an hour/);
  assert.match(r.output, /hybrid: 1 project, \$7,800\.00 for 66 h = \$118\.18\/h/);
  assert.match(r.output, /1\. Pine primary suite \(margin\)/);
});

test("history --json honours --target", async () => {
  const j = JSON.parse((await run(["history", "p.csv", "--target", "59", "--json"], io)).output);
  assert.equal(j.below, 0);
});

test("bad input exits 2 with usage", async () => {
  for (const argv of [[], ["nope"], ["compare", "--bogus"], ["compare", "--flat"], ["compare", "--overrun", "x"], ["history"]]) {
    const r = await run(argv, io);
    assert.equal(r.exitCode, 2, argv.join(" "));
    assert.match(r.output, /Usage:/);
  }
  const bad = await run(["history", "p.csv"], { readFile: async () => "A,flat,x,1" });
  assert.equal(bad.exitCode, 2);
  assert.match(bad.output, /Line 1: fee/);
  const missing = await run(["history", "p.csv"], { readFile: async () => { throw new Error("nope"); } });
  assert.match(missing.output, /Cannot read p\.csv/);
  assert.equal((await run(["--help"])).exitCode, 0);
});
