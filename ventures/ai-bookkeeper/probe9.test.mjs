import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe9.mjs: 52 agent-written descriptors, tuned on themselves (README Next, 2026-10-30).
test("probe 9: built-in keywords file all 52 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe9.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /52 descriptors: 52 right, 0 wrong, 0 no suggestion/);
});
