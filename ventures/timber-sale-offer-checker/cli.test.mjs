import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "timber-"));
const file = join(dir, "logs.csv");
writeFileSync(file, "species,diameter,length,count\noak,16,16,20\noak,12,16,30\n");
const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("low offer exits 1 and explains Doyle", () => {
  const r = run(file, "--offer", "500", "--price", "oak=450");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /undercounts small logs/);
});

test("fair offer exits 0 and json parses", () => {
  const r = run(file, "--offer", "5000", "--price", "oak=450", "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).belowThreshold, false);
});

test("bad usage exits 2", () => {
  assert.equal(run(file).status, 2);
  assert.equal(run(file, "--offer", "10", "--rule", "nope").status, 2);
  assert.equal(run("--bogus").status, 2);
});
