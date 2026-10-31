import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe11.mjs: 41 agent-written descriptors, tuned on themselves.
test("probe 11: built-in keywords file all 41 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe11.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /41 descriptors: 41 right, 0 wrong, 0 no suggestion/);
});
