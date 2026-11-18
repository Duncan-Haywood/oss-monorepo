import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe37.mjs: 25 agent-written descriptors (doulas, estheticians, snow plowers, taxidermists,
// vehicle-wrap installers), tuned on themselves (HISTORY.md, 2026-11-10).
test("probe 37: built-in keywords file all 25 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe37.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /25 descriptors: 25 right, 0 wrong, 0 no suggestion/);
});
