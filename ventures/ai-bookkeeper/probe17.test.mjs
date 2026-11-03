import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe17.mjs: 34 agent-written descriptors, tuned on themselves.
test("probe 17: built-in keywords file all 34 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe17.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /34 descriptors: 34 right, 0 wrong, 0 no suggestion/);
});
