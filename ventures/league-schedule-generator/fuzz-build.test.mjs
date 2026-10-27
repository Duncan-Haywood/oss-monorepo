import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("random leagues (courts, times, blackouts, closures, limits) build to valid schedules", () => {
  const r = spawnSync(process.execPath, ["eval/fuzz-build.mjs", "150", "11"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /built 150, rejected 0, invalid 0/);
});
