import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("compare prints every provider and exits 0", () => {
  const r = run("compare", "--kreq", "15000", "--growth", "5");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PostHog/);
  assert.match(r.stdout, /12-month spend/);
});

test("--budget with --provider exits 1 when over", () => {
  assert.equal(run("compare", "--kreq", "15000", "--provider", "posthog", "--budget", "20").status, 1);
  assert.equal(run("compare", "--kreq", "10", "--provider", "posthog", "--budget", "20").status, 0);
});

test("bad input exits 2", () => {
  assert.equal(run("compare").status, 2);
  assert.equal(run("compare", "--kreq", "-5").status, 2);
  assert.equal(run("compare", "--kreq", "100", "--provider", "nope").status, 2);
  assert.equal(run("bogus").status, 2);
});

test("--json is parseable and --prices overrides", () => {
  const dir = mkdtempSync(join(tmpdir(), "flags-"));
  const f = join(dir, "p.json");
  writeFileSync(f, JSON.stringify({ posthog: { freeK: 0, plans: [{ k: 0, price: 0 }], overagePerK: 1 } }));
  const out = JSON.parse(run("compare", "--kreq", "100", "--json", "--prices", f).stdout);
  assert.equal(out.rows.find((x) => x.key === "posthog").monthly, 100);
});

test("crossover lists segments", () => {
  const r = run("crossover");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /cheapest:/);
});
