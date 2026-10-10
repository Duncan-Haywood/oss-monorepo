import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleCsv } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;
const withFile = (text) => { const d = mkdtempSync(join(tmpdir(), "oncall-")); const f = join(d, "i.csv"); writeFileSync(f, text); return f; };

test("exits 1 and names the overloaded person on the sample", () => {
  const r = spawnSync("node", [cli, withFile(sampleCsv())], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /! Priya/);
});

test("--json is parseable and a missing file is a usage error", () => {
  const r = spawnSync("node", [cli, withFile(sampleCsv()), "--json"], { encoding: "utf8" });
  assert.ok(JSON.parse(r.stdout).summary.pages > 0);
  assert.equal(spawnSync("node", [cli], { encoding: "utf8" }).status, 2);
});

test("a CSV with no responder column exits 2 with the reason", () => {
  const r = spawnSync("node", [cli, withFile("created_at,title\n2026-01-05,x")], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /No responder column/);
});
