import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe8.mjs: 56 agent-written descriptors, tuned on themselves (README Next, 2026-10-30).
test("probe 8: built-in keywords file all 56 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe8.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /56 descriptors: 56 right, 0 wrong, 0 no suggestion/);
});
