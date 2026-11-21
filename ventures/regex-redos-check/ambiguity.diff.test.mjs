// Differential test: engine.mjs's verdict against an independent exact oracle (eval/ambiguity.mjs, its own
// parser-free automaton over a generated AST) and against V8's own timing. Every pattern the oracle calls
// exponential and V8 confirms by timing must be an error; every pattern the oracle proves non-exponential must
// not be. SEEDS=n widens the run (eval/README.md has the large sweeps).
import test from "node:test";
import assert from "node:assert/strict";
import { analyzePattern } from "./engine.mjs";
import { rng, randomRegex, toSource, buildAutomaton, findEDA, confirmExponential } from "./eval/ambiguity.mjs";

test("oracle: known cases", () => {
  const chr = (set) => ({ t: "chr", set });
  const cases = [
    [{ t: "star", a: { t: "star", a: chr("a") } }, true], // (a*)*: two loops share a -> a
    [{ t: "star", a: { t: "alt", a: chr("a"), b: chr("a") } }, true],
    [{ t: "star", a: { t: "alt", a: chr("b"), b: { t: "seq", a: chr("c"), b: chr("b") } } }, false],
    [{ t: "seq", a: { t: "star", a: chr("a") }, b: { t: "star", a: chr("a") } }, false], // a*a* is polynomial only
    [{ t: "plus", a: { t: "opt", a: chr("a") } }, false], // (a?)+: only the first iteration may be empty (ECMAScript)
    [{ t: "plus", a: { t: "alt", a: chr("a"), b: { t: "opt", a: chr("a") } } }, true], // (a|a?)+
  ];
  for (const [ast, want] of cases) assert.equal(Boolean(findEDA(buildAutomaton(ast))), want, toSource(ast));
});

test("engine agrees with the exact oracle and with V8's timing on random patterns", () => {
  const count = Number(process.env.SEEDS || 150);
  const rand = rng(20261121);
  const seen = new Set();
  const misses = [];
  let confirmed = 0;
  while (seen.size < count) {
    const ast = randomRegex(rand, 2 + Math.floor(rand() * 6));
    const src = toSource(ast);
    if (seen.has(src)) continue;
    seen.add(src);
    const full = `^(?:${src})$`;
    const eda = findEDA(buildAutomaton(ast));
    const error = analyzePattern(full).findings.some((f) => f.severity === "error");
    if (eda) {
      // V8 merges some single-character alternations into a class, so the oracle's ambiguity is not always slow.
      if (!confirmExponential(full, eda).confirmed) continue;
      confirmed += 1;
      if (!error) misses.push(`missed ${full} (pump ${JSON.stringify(eda.pump)})`);
    } else if (error) misses.push(`false alarm ${full}`);
  }
  assert.ok(confirmed > count / 5, `only ${confirmed} confirmed exponential patterns; the generator drifted`);
  assert.deepEqual(misses, []);
});
