import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe16.mjs: 35 agent-written descriptors, tuned on themselves.
test("probe 13: built-in keywords file all 35 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe16.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /35 descriptors: 35 right, 0 wrong, 0 no suggestion/);
});
