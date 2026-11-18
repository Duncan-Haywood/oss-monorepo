import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe35.mjs: 26 agent-written descriptors (drone photographers, notary signing agents,
// dog groomers, piano tuners, beekeepers), tuned on themselves (HISTORY.md, 2026-11-10).
test("probe 35: built-in keywords file all 26 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe35.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /26 descriptors: 26 right, 0 wrong, 0 no suggestion/);
});
