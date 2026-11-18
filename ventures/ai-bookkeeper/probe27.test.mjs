import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe27.mjs: 25 agent-written descriptors (locksmiths, piano tuners, chimney sweeps, mobile welders, home stagers), tuned on themselves.
test("probe 26: built-in keywords file all 25 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe27.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /25 descriptors: 25 right, 0 wrong, 0 no suggestion/);
});
