import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe14.mjs: 30 agent-written descriptors, tuned on themselves.
test("probe 14: built-in keywords file all 30 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe14.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /30 descriptors: 30 right, 0 wrong, 0 no suggestion/);
});
