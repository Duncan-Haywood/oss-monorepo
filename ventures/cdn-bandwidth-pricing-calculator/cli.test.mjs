import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("compare prints every provider and exits 0", () => {
  const r = run("compare", "--gb", "15000", "--growth", "5");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Fastly/);
  assert.match(r.stdout, /12-month spend/);
});

test("--budget with --provider exits 1 when over", () => {
  assert.equal(run("compare", "--gb", "15000", "--provider", "cloudfront", "--budget", "20").status, 1);
  assert.equal(run("compare", "--gb", "10", "--provider", "cloudfront", "--budget", "20").status, 0);
});

test("bad input exits 2", () => {
  assert.equal(run("compare").status, 2);
  assert.equal(run("compare", "--gb", "-5").status, 2);
  assert.equal(run("compare", "--gb", "100", "--provider", "nope").status, 2);
  assert.equal(run("bogus").status, 2);
});

test("--json is parseable and --prices overrides", () => {
  const dir = mkdtempSync(join(tmpdir(), "cdn-"));
  const f = join(dir, "p.json");
  writeFileSync(f, JSON.stringify({ cloudfront: { freeGb: 0, plans: [{ gb: 0, price: 0 }], overagePerGb: 1 } }));
  const out = JSON.parse(run("compare", "--gb", "100", "--json", "--prices", f).stdout);
  assert.equal(out.rows.find((x) => x.key === "cloudfront").monthly, 100);
});

test("crossover lists segments", () => {
  const r = run("crossover");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /cheapest:/);
});
