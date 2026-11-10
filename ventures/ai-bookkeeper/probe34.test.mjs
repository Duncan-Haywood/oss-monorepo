import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe34.mjs: 28 agent-written descriptors (court-record researchers, wedding officiants,
// home stagers, car detailers, stone fabricators), tuned on themselves (HISTORY.md, 2026-11-10).
test("probe 34: built-in keywords file all 28 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe34.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /28 descriptors: 28 right, 0 wrong, 0 no suggestion/);
});
