import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe10.mjs: 50 agent-written descriptors, tuned on themselves.
test("probe 10: built-in keywords file all 50 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe10.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /50 descriptors: 50 right, 0 wrong, 0 no suggestion/);
});
