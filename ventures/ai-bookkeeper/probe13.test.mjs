import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe13.mjs: 40 agent-written descriptors, tuned on themselves.
test("probe 13: built-in keywords file all 40 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe13.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /40 descriptors: 40 right, 0 wrong, 0 no suggestion/);
});
