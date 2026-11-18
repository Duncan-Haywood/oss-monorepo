import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe24.mjs: 31 agent-written descriptors, tuned on themselves.
test("probe 24: built-in keywords file all 31 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe24.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /31 descriptors: 31 right, 0 wrong, 0 no suggestion/);
});
