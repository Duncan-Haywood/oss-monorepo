import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("compare prints every provider and exits 0", () => {
  const r = run("compare", "--revenue", "5000", "--growth", "5");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Paddle/);
  assert.match(r.stdout, /12-month totals/);
});

test("--max-fee-pct with --provider exits 1 when over", () => {
  assert.equal(run("compare", "--revenue", "5000", "--provider", "paddle", "--max-fee-pct", "3").status, 1);
  assert.equal(run("compare", "--revenue", "5000", "--provider", "paddle", "--max-fee-pct", "9").status, 0);
});

test("bad input exits 2", () => {
  assert.equal(run("compare").status, 2);
  assert.equal(run("compare", "--revenue", "-5").status, 2);
  assert.equal(run("compare", "--revenue", "100", "--price", "0").status, 2);
  assert.equal(run("compare", "--revenue", "100", "--intl", "150").status, 2);
  assert.equal(run("compare", "--revenue", "100", "--provider", "nope").status, 2);
  assert.equal(run("bogus").status, 2);
});

test("--json is parseable and --prices overrides", () => {
  const dir = mkdtempSync(join(tmpdir(), "mor-"));
  const f = join(dir, "p.json");
  writeFileSync(f, JSON.stringify({ paddle: { pct: 10, fixed: 0 } }));
  const out = JSON.parse(run("compare", "--revenue", "1000", "--json", "--prices", f).stdout);
  assert.equal(out.rows.find((x) => x.key === "paddle").total, 100);
});

test("crossover lists segments", () => {
  const r = run("crossover");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /lowest cost:/);
});
