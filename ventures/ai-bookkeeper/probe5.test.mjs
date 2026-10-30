import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe5.mjs: 67 agent-written descriptors, tuned on themselves (README Next, 2026-10-30).
test("probe 5: built-in keywords file all 67 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe5.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /67 descriptors: 67 right, 0 wrong, 0 no suggestion/);
});
