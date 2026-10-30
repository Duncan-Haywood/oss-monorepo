import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe-trades4.mjs: 72 agent-written descriptors, tuned on themselves (README Next, 2026-10-28).
test("probe 4: built-in keywords file all 72 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe-trades4.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /72 descriptors: 72 right, 0 wrong, 0 no suggestion/);
});
