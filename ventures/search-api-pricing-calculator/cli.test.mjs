import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("compare prints every provider and exits 0", () => {
  const r = run("compare", "--records-k", "500", "--searches-k", "2000", "--growth", "5");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Algolia/);
  assert.match(r.stdout, /12-month spend/);
});

test("--budget with --provider exits 1 when over", () => {
  assert.equal(run("compare", "--records-k", "500", "--searches-k", "2000", "--provider", "algolia", "--budget", "50").status, 1);
  assert.equal(run("compare", "--records-k", "10", "--searches-k", "5", "--provider", "algolia", "--budget", "50").status, 0);
});

test("--json is parseable and --prices overrides a rate", () => {
  const dir = mkdtempSync(join(tmpdir(), "sapc-"));
  const f = join(dir, "p.json");
  writeFileSync(f, JSON.stringify({ algolia: { perKSearches: 0 } }));
  const r = run("compare", "--records-k", "100", "--searches-k", "5000", "--provider", "algolia", "--prices", f, "--json");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).rows.find((x) => x.key === "algolia").monthly, 0);
});

test("crossover and providers work; bad input exits 2", () => {
  assert.match(run("crossover", "--records-k", "50").stdout, /cheapest:/);
  assert.match(run("providers").stdout, /meilisearch/);
  assert.equal(run("compare", "--records-k", "-1", "--searches-k", "1").status, 2);
  assert.equal(run("compare", "--records-k", "1").status, 2);
  assert.equal(run("bogus").status, 2);
});

test("bad --months or a --prices file that is not an object exit 2 (bad input), never 1 (over budget)", () => {
  // red team 2026-11-17: both crashed with a stack trace and exit 1, which a CI gate reads as over budget
  for (const m of ["0", "2.5"]) {
    const r = run("compare", "--records-k", "10", "--searches-k", "10", "--budget", "1000", "--months", m);
    assert.equal(r.status, 2, `--months ${m}: ${r.stderr}`);
    assert.match(r.stderr, /--months/);
  }
  const dir = mkdtempSync(join(tmpdir(), "sapc-"));
  for (const body of ["null", "[1]", "\"x\"", "{\"algolia\": 3}"]) {
    const f = join(dir, "bad.json");
    writeFileSync(f, body);
    const r = run("compare", "--records-k", "10", "--searches-k", "10", "--prices", f);
    assert.equal(r.status, 2, `${body}: ${r.stderr}`);
    assert.match(r.stderr, /--prices/);
  }
});
