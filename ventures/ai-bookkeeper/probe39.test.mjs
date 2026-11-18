import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe39.mjs: 21 agent-written descriptors (pool service, personal trainers, wedding DJs,
// upholsterers, farriers), tuned on themselves (HISTORY.md, 2026-11-10).
test("probe 39: built-in keywords file all 21 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe39.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /21 descriptors: 21 right, 0 wrong, 0 no suggestion/);
});
