import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const d = mkdtempSync(join(tmpdir(), "aib-num-"));
const run = (...a) => spawnSync("node", [new URL("./cli.mjs", import.meta.url).pathname, "--books", join(d, "books.json"), ...a], { encoding: "utf8" });

test("a non-numeric number flag is refused instead of printing NaN", () => {
  for (const a of [["contractors", "--threshold", "abc"], ["estimate", "--year", "abc"], ["retirement", "--age", "x"]]) {
    const r = run(...a);
    assert.equal(r.status, 2, a.join(" "));
    assert.match(r.stderr, /needs a number/);
    assert.doesNotMatch(r.stdout + r.stderr, /NaN/);
  }
});

test("fx rate and payroll 941 --deposited refuse non-numbers", () => {
  for (const a of [["fx", "rate", "EUR", "2026-01-01", "abc"], ["payroll", "941", "2026", "1", "--deposited", "xyz"]]) {
    const r = run(...a);
    assert.notEqual(r.status, 0, a.join(" "));
    assert.match(r.stderr, /needs a number/);
  }
});

test("a numeric flag still works", () => {
  const r = run("contractors", "--threshold", "600");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /600\.00/);
});
