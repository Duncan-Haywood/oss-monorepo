// The browser build must report exactly what the native CLI reports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "./dupehound.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixtures = join(root, "tests", "fixtures");

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test("wasm finds the fixture clone", async () => {
  const dh = await load(readFileSync(join(here, "dupehound.wasm")));
  const files = walk(fixtures).map((p) => ({ path: p, text: readFileSync(p, "utf8") }));
  const r = dh.analyze(files);
  assert.ok(r.statistics.clones >= 1);
  assert.ok(r.clones.some((c) => c.first.file.endsWith("a.js") && c.second.file.endsWith("b.js")));
});

test("wasm output equals the native CLI's", async (t) => {
  const bin = join(root, "target", "release", "dupehound");
  if (!existsSync(bin)) return t.skip("native binary not built (cargo build --release)");
  const dh = await load(readFileSync(join(here, "dupehound.wasm")));
  // Use the crate's own sources plus the fixtures: real code, several languages.
  const paths = [...walk(fixtures), ...walk(join(root, "src")), ...walk(join(root, "tests")).filter((p) => p.endsWith(".rs"))];
  const files = paths.map((p) => ({ path: p, text: readFileSync(p, "utf8") }));
  for (const [minTokens, minLines, normalize] of [[50, 5, false], [20, 2, false], [10, 1, false], [50, 5, true], [20, 2, true]]) {
    const w = dh.analyze(files, { minTokens, minLines, normalize });
    const n = JSON.parse(execFileSync(bin, ["--json", ...(normalize ? ["--normalize"] : []), "--min-tokens", String(minTokens), "--min-lines", String(minLines), ...paths]));
    delete w.statistics.seconds; delete n.statistics.seconds;
    assert.deepEqual(w, n, `min_tokens=${minTokens} min_lines=${minLines} normalize=${normalize}`);
  }
});
