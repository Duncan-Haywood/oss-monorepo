import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe7.mjs: 64 agent-written descriptors, tuned on themselves (README Next, 2026-10-30).
test("probe 7: built-in keywords file all 64 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe7.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /64 descriptors: 64 right, 0 wrong, 0 no suggestion/);
});
