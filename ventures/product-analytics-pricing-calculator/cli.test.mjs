import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("compare prints every provider and exits 0", () => {
  const r = run("compare", "--events", "3000000", "--growth", "5");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Mixpanel/);
  assert.match(r.stdout, /12-month spend/);
});

test("--budget with --provider exits 1 when over", () => {
  assert.equal(run("compare", "--events", "3000000", "--provider", "mixpanel", "--budget", "50").status, 1);
  assert.equal(run("compare", "--events", "3000000", "--provider", "umami", "--budget", "500").status, 0);
});

test("bad input exits 2", () => {
  assert.equal(run("compare").status, 2);
  assert.equal(run("compare", "--events", "-5").status, 2);
  assert.equal(run("compare", "--events", "100", "--provider", "nope").status, 2);
  assert.equal(run("bogus").status, 2);
});

test("--json is parseable and --prices overrides", () => {
  const dir = mkdtempSync(join(tmpdir(), "event-"));
  const f = join(dir, "p.json");
  writeFileSync(f, JSON.stringify({ posthog: { freeEvents: 0, plans: [{ events: 0, price: 0 }], overagePer1k: 1 } }));
  const out = JSON.parse(run("compare", "--events", "10000", "--json", "--prices", f).stdout);
  assert.equal(out.rows.find((x) => x.key === "posthog").monthly, 10);
});

test("crossover lists segments", () => {
  const r = run("crossover");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /cheapest:/);
});
