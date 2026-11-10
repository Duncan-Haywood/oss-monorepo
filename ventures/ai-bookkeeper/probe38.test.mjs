import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// eval/probe38.mjs: 23 agent-written descriptors (locksmiths, florists, tattoo artists, massage
// therapists, phone repair shops), tuned on themselves (HISTORY.md, 2026-11-10).
test("probe 38: built-in keywords file all 23 descriptors, none wrongly", () => {
  const out = execFileSync(process.execPath, ["eval/probe38.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /23 descriptors: 23 right, 0 wrong, 0 no suggestion/);
});
