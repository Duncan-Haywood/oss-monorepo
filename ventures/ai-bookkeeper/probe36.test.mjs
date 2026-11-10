import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe36.mjs: 25 agent-written descriptors (house cleaners, window washers, HVAC installers,
// mobile welders, bike repair shops), tuned on themselves (HISTORY.md, 2026-11-10).
test("probe 35: built-in keywords file all 25 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe36.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /25 descriptors: 25 right, 0 wrong, 0 no suggestion/);
});
