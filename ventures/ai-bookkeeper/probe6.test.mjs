import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe6.mjs: 79 agent-written descriptors, tuned on themselves (README Next, 2026-10-30).
test("probe 6: built-in keywords file all 79 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe6.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /79 descriptors: 79 right, 0 wrong, 0 no suggestion/);
});
