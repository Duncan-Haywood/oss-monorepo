// A rate printed as `${rate * 100}%` shows binary floating point to the reader: 0.07 * 100 is
// 7.000000000000001, 0.29 * 100 is 28.999999999999996. The red-team run of 2026-11-12 found it in
// the Form 2210 penalty warning ("7.000000000000001% (the last one on file, 2026 Q4)") and the
// same unrounded pattern in 21 more places across 13 ventures, most of them fed by a rate the
// user types. This scans every shipped script and page so the next copy fails CI (these tests run
// on every pull request touching ventures/**) instead of waiting for a reader to see it.
//
// The fix is to round before printing: `${+(rate * 100).toFixed(4)}%`, or toFixed(n) / a
// formatter. Anything that ends the interpolation in `* 100}` or starts it `${100 *` is flagged.
import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCAN = ["ventures", "platform", "research"];
const EXT = /\.(mjs|cjs|js|ts|html)$/;
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", "_site", "vendor", "__pycache__", ".venv", "venv"]);

export const UNROUNDED_PERCENT = /\$\{(?:[^{}]*\*\s*100|\s*100\s*\*[^{}]*)\s*\}\s?%/g;

export function findUnrounded(text) {
  const hits = [];
  for (const m of text.matchAll(UNROUNDED_PERCENT)) hits.push({ line: text.slice(0, m.index).split("\n").length, match: m[0] });
  return hits;
}

async function* walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) yield* walk(join(dir, e.name)); }
    else if (EXT.test(e.name) && !/\.test\.|\.min\./.test(e.name)) yield join(dir, e.name);
  }
}

test("the pattern flags an unrounded percentage and passes a rounded one", () => {
  assert.equal(findUnrounded("`${rate * 100}% of pay`").length, 1);
  assert.equal(findUnrounded("`${100 * t.limits.boreBearing}%`").length, 1);
  assert.equal(findUnrounded("`${(opts.shortRate ?? 0.24) * 100}% short`").length, 1);
  assert.equal(findUnrounded("`${+(rate * 100).toFixed(4)}%`").length, 0);
  assert.equal(findUnrounded("`${(x * 100).toFixed(1)}%`").length, 0);
  assert.equal(findUnrounded("`${Math.round(x * 100)}%`").length, 0);
  assert.equal(findUnrounded("`${x * 100} cents`").length, 0);
  // The reason the check exists.
  assert.equal(`${0.07 * 100}%`, "7.000000000000001%");
  assert.equal(`${+(0.07 * 100).toFixed(4)}%`, "7%");
});

test("no shipped script or page prints a percentage without rounding it", async () => {
  const bad = [];
  for (const top of SCAN) {
    for await (const file of walk(join(ROOT, top))) {
      const text = await readFile(file, "utf8");
      if (!text.includes("100")) continue;
      for (const h of findUnrounded(text)) bad.push(`${relative(ROOT, file)}:${h.line}: ${h.match}`);
    }
  }
  assert.deepEqual(bad, [], `Round before printing a percentage, e.g. \${+(rate * 100).toFixed(4)}% (0.07 * 100 prints 7.000000000000001):\n${bad.join("\n")}`);
});
