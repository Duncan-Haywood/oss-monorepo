import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe9.mjs: 50 agent-written descriptors, tuned on themselves.
test("probe 9: built-in keywords file all 50 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe9.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /50 descriptors: 50 right, 0 wrong, 0 no suggestion/);
});
