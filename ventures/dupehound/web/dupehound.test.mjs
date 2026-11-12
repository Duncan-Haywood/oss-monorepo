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
  // --max-lines lifts the CLI's 1,000-line skip (src/lib.rs is longer); the page applies it before calling wasm.
  const paths = [...walk(fixtures), ...walk(join(root, "src")), ...walk(join(root, "tests")).filter((p) => p.endsWith(".rs"))];
  const files = paths.map((p) => ({ path: p, text: readFileSync(p, "utf8") }));
  for (const [minTokens, minLines, normalize] of [[50, 5, false], [20, 2, false], [10, 1, false], [50, 5, true], [20, 2, true]]) {
    const w = dh.analyze(files, { minTokens, minLines, normalize });
    const n = JSON.parse(execFileSync(bin, ["--json", "--max-lines", "100000", ...(normalize ? ["--normalize"] : []), "--min-tokens", String(minTokens), "--min-lines", String(minLines), ...paths]));
    delete w.statistics.seconds; delete n.statistics.seconds;
    assert.deepEqual(w, n, `min_tokens=${minTokens} min_lines=${minLines} normalize=${normalize}`);
  }
  for (const [minTokens, minLines, normalize] of [[50, 5, false], [10, 1, false], [20, 2, true]]) {
    const w = dh.analyze(files, { minTokens, minLines, normalize, families: true });
    const n = JSON.parse(execFileSync(bin, ["--json", "--max-lines", "100000", "--families", ...(normalize ? ["--normalize"] : []), "--min-tokens", String(minTokens), "--min-lines", String(minLines), ...paths]));
    delete w.statistics.seconds; delete n.statistics.seconds;
    assert.ok(Array.isArray(n.families) && n.families.length > 0, "fixtures yield at least one family");
    assert.deepEqual(w, n, `families: min_tokens=${minTokens} min_lines=${minLines} normalize=${normalize}`);
  }
});

test("--guarded folds synced copies into one and totals the fully guarded", async (t) => {
  const bin = join(root, "target", "release", "dupehound");
  if (!existsSync(bin)) return t.skip("native binary not built (cargo build --release)");
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "dh-guard-"));
  try {
    const block = ["export function shared(a, b) {"]
      .concat(Array.from({ length: 10 }, (_, i) => `  const v${i} = a * ${i} + b - compute(a, ${i}, 'x');`), ["}"])
      .join("\n") + "\n";
    for (const p of ["a", "b", "c"]) {
      mkdirSync(join(dir, "v", p), { recursive: true });
      writeFileSync(join(dir, "v", p, "shared.mjs"), block);
    }
    mkdirSync(join(dir, "v", "e"), { recursive: true });
    writeFileSync(join(dir, "v", "e", "calc.mjs"), "export const unrelated = [1, 2, 3];\n" + block);
    const guards = join(dir, "guards.txt");
    writeFileSync(guards, "# synced by a test\nv/*/shared.mjs\n");
    const run = (...a) => execFileSync(bin, [...a, join(dir, "v")], { encoding: "utf8" });

    const plain = JSON.parse(run("--json", "--families"));
    assert.equal(plain.families.length, 1);
    assert.equal(plain.families[0].occurrences, 4);
    assert.ok(!("guarded" in plain), "no --guarded, no new members");

    const g = JSON.parse(run("--json", "--guarded", guards));
    assert.equal(g.families[0].occurrences, 2, "one stand-in for the synced copies, plus the stray");
    assert.equal(g.families[0].guarded_copies, 3);
    assert.equal(g.families[0].removable_lines, 12);
    assert.deepEqual(g.guarded, { patterns: 1, families: 0, copies: 0, removable_lines: 0, removable_lines_max: 0 });

    writeFileSync(guards, "shared.mjs\ncalc.mjs  # the stray too\n");
    const all = JSON.parse(run("--json", "--guarded", guards));
    assert.equal(all.families.length, 0);
    assert.equal(all.guarded.families, 1);
    assert.equal(all.guarded.copies, 4);
    assert.match(run("--guarded", guards), /Not counted above: 1 families whose every copy matches/);

    writeFileSync(guards, "# nothing\n");
    assert.throws(() => run("--guarded", guards), /no patterns/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
