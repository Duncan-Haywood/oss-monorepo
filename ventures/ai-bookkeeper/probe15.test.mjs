import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe15.mjs: 27 agent-written descriptors, tuned on themselves.
test("probe 15: built-in keywords file all 27 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe15.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /27 descriptors: 27 right, 0 wrong, 0 no suggestion/);
});
