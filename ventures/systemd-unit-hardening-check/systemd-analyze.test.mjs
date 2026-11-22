// Runs eval/systemd-analyze-diff.mjs on a fixed seed when systemd-analyze (systemd
// 250+, for --offline) is installed, and skips otherwise. The only differences
// allowed are the documented gap: system call or address family names systemd does
// not know, which it ignores and this tool does not check.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { run } from "./eval/systemd-analyze-diff.mjs";

let ok = false;
try {
  const v = Number(/systemd (\d+)/.exec(execFileSync("systemd-analyze", ["--version"], { encoding: "utf8" }))?.[1]);
  ok = v >= 250;
} catch { /* not installed */ }

test("findings match systemd-analyze security --offline on 400 random unit trees", { skip: !ok && "systemd-analyze 250+ not installed" }, async () => {
  const r = await run({ seed: 20261122, count: 400 });
  const unexplained = r.diffs.filter((d) => !d.why);
  assert.ok(r.count - r.unloadable > 300);
  assert.deepEqual(unexplained.slice(0, 2).map((d) => ({ miss: d.miss, files: d.files })), [], `${unexplained.length} trees differ`);
});
