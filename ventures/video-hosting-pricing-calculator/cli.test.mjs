import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("compare prints every platform and exits 0", () => {
  const r = run("compare", "--stored-min", "20000", "--watched-min", "500000", "--uploaded-min", "500", "--growth", "5");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Bunny/);
  assert.match(r.stdout, /12-month spend/);
});

test("--budget with --provider exits 1 when over", () => {
  assert.equal(run("compare", "--stored-min", "50000", "--watched-min", "2000000", "--provider", "cfstream", "--budget", "50").status, 1);
  assert.equal(run("compare", "--stored-min", "10", "--watched-min", "10", "--provider", "cfstream", "--budget", "50").status, 0);
});

test("bad input exits 2", () => {
  assert.equal(run("compare").status, 2);
  assert.equal(run("compare", "--stored-min", "100").status, 2);
  assert.equal(run("compare", "--stored-min", "-5", "--watched-min", "1").status, 2);
  assert.equal(run("compare", "--stored-min", "100", "--watched-min", "1", "--provider", "nope").status, 2);
  assert.equal(run("bogus").status, 2);
});

test("--json is parseable and --prices overrides", () => {
  const dir = mkdtempSync(join(tmpdir(), "vid-"));
  const f = join(dir, "p.json");
  writeFileSync(f, JSON.stringify({ cfstream: { storagePerMin: 1, deliveryPerMin: 0 } }));
  const out = JSON.parse(run("compare", "--stored-min", "100", "--watched-min", "100", "--json", "--prices", f).stdout);
  assert.equal(out.rows.find((x) => x.key === "cfstream").monthly, 100);
});

test("crossover lists segments", () => {
  const r = run("crossover", "--stored-min", "20000");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /cheapest:/);
  assert.equal(run("crossover").status, 2);
});
