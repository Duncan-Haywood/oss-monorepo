import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe-trades3.mjs: 78 agent-written descriptors, tuned on themselves (README Next, 2026-10-28).
test("probe 3: built-in keywords file all 78 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe-trades3.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /78 descriptors: 78 right, 0 wrong, 0 no suggestion/);
});
