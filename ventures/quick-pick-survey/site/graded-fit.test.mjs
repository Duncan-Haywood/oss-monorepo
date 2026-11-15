// node --test site/graded-fit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gradedFit, estimateTau, hasGrades, BIT, MUCH, GRADED_TAU } from "./graded-fit.mjs";
import { fit } from "./rank-core.mjs";
import { encodeAnswers, decodeAnswers, decisionFit, overallOrder, decisionTable, decisionDone, decisionDoneGraded, nextQuestion } from "./decide-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A person with true scores x answering random pairs on the ordinal model at their own tau. */
function gradedAnswers(x, count, tau, seed) {
  const r = mulberry32(seed), n = x.length, out = [];
  for (let k = 0; k < count; k++) {
    const a = Math.floor(r() * n); let b = Math.floor(r() * (n - 1)); if (b >= a) b++;
    const u = Math.min(Math.max(r(), 1e-12), 1 - 1e-12), z = x[a] - x[b] - Math.log(u / (1 - u));
    out.push(z > 0 ? [a, b, false, Math.abs(z) > tau ? MUCH : BIT] : [b, a, false, Math.abs(z) > tau ? MUCH : BIT]);
  }
  return out;
}

test("with no grades the ordinal fit is the plain refit, mode and covariance", () => {
  const a = [[0, 1, false], [1, 2, false], [2, 0, true], [0, 3, false], [3, 1, false], [0, 1, false]];
  const f = fit(4, a), g = gradedFit(4, a);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(f.mu[i] - g.mu[i]) < 1e-9);
  for (let k = 0; k < 16; k++) assert.ok(Math.abs(f.cov[k] - g.cov[k]) < 1e-9);
  assert.equal(hasGrades(a), false);
  assert.equal(hasGrades([[0, 1, false, MUCH]]), true);
  assert.equal(hasGrades([[0, 1, true, MUCH]]), false, "a tie carries no grade");
});

test("'much' moves the scores further than an ungraded pick, and 'a bit' less", () => {
  const base = [[0, 1, false], [0, 1, false], [1, 2, false]];
  const gap = (grade) => { const f = gradedFit(3, base.map(([w, l, t]) => [w, l, t, grade])); return f.mu[0] - f.mu[2]; };
  assert.ok(gap(MUCH) > gap(undefined) && gap(undefined) > gap(BIT) && gap(BIT) > 0, `${gap(MUCH)} ${gap(undefined)} ${gap(BIT)}`);
  // and a "much" pick leaves the gap more certain than a "bit" pick does
  const sd = (grade) => { const f = gradedFit(3, base.map(([w, l, t]) => [w, l, t, grade])); return f.cov[0] + f.cov[8] - 2 * f.cov[2]; };
  assert.ok(sd(MUCH) < sd(undefined), `${sd(MUCH)} ${sd(undefined)}`);
});

test("estimateTau recovers a person's threshold from their own answers, and stays at the default with none", () => {
  const x = [1.5, 0.5, 0, -0.7, -1.3, 0.9];
  const low = estimateTau([[6, gradedAnswers(x, 120, 1, 7)]]);
  const high = estimateTau([[6, gradedAnswers(x, 120, 3.5, 7)]]);
  assert.ok(low < 1.5, `tau for a person at 1: ${low}`);
  assert.ok(high > 2.5, `tau for a person at 3.5: ${high}`);
  assert.equal(estimateTau([[6, [[0, 1, false], [2, 3, false]]]]), GRADED_TAU);
  // a handful of answers stays near the prior
  const few = estimateTau([[6, gradedAnswers(x, 3, 1, 9)]]);
  assert.ok(few > 1.2 && few < 3, `three answers: ${few}`);
});

test("graded decision codes round-trip, and a code made before grades still reads as ungraded", () => {
  const O = ["A", "B", "C"], C = ["Price", "Fit"];
  const answers = { crit: [[0, 1, false, MUCH], [1, 0, true]], opt: [[0, 2, 1, false, BIT], [1, 0, 1, false, MUCH], [1, 1, 2, false]] };
  const code = encodeAnswers({ options: O, criteria: C, answers });
  assert.deepEqual(decodeAnswers(code, O, C).answers, answers);
  const old = encodeAnswers({ options: O, criteria: C, answers: { crit: [[0, 1, false]], opt: [[0, 2, 1, false]] } });
  assert.deepEqual(decodeAnswers(old, O, C).answers, { crit: [[0, 1, false]], opt: [[0, 2, 1, false]] });
});

test("decisionFit reads grades: a 'much' answer outweighs two 'a bit' answers against it", () => {
  // On criterion 0: B beats A by "much" once, A beats B "a bit" twice. Ungraded, A leads 2-1.
  const answers = { crit: [], opt: [[0, 1, 0, false, MUCH], [0, 0, 1, false, BIT], [0, 0, 1, false, BIT]] };
  assert.equal(overallOrder(decisionFit(2, 2, answers, { grades: "ignore" }))[0], 0);
  assert.equal(overallOrder(decisionFit(2, 2, answers, { tau: GRADED_TAU }))[0], 1);
  assert.equal(typeof decisionFit(2, 2, answers).tau, "number");
});

test("the graded stop rechecks at a cautious tau: never stops where the plain check would not, and reads lower", () => {
  // A person who says "much" for every pick, answering the page's own questions until the plain check passes.
  const n = 4, C = 2, x = [[1.2, 0.4, -0.3, -1.3], [0.8, -0.6, 0.3, -0.5]], s = [0.9, -0.9];
  const answers = { crit: [], opt: [] };
  let df = decisionFit(n, C, answers), table = decisionTable(df, { draws: 400 }), k = 0;
  while (!decisionDone(table, answers) && k++ < 60) {
    const q = nextQuestion(df, answers, { seed: 3 });
    const [a, b] = q.pair;
    const d = q.kind === "crit" ? s[a] - s[b] : x[q.c][a] - x[q.c][b];
    const [w, l] = d > 0 ? [a, b] : [b, a];
    if (q.kind === "crit") answers.crit.push([w, l, false, MUCH]); else answers.opt.push([q.c, w, l, false, MUCH]);
    answers.lastKind = q.kind;
    df = decisionFit(n, C, answers); table = decisionTable(df, { draws: 400 });
  }
  assert.ok(decisionDone(table, answers), "the plain check passes within 60 picks");
  const g = decisionDoneGraded(n, C, answers, table);
  assert.notEqual(g.table, table, "the guard refit ran");
  assert.ok(g.table.safe <= table.safe + 1e-9, `guard ${g.table.safe} vs ${table.safe}`);
  // with no grades the guard does not run
  const plain = { crit: answers.crit.map(([w, l]) => [w, l, false]), opt: answers.opt.map(([c, w, l]) => [c, w, l, false]) };
  const pt = decisionTable(decisionFit(n, C, plain), { draws: 400 });
  assert.equal(decisionDoneGraded(n, C, plain, pt).table, pt);
  // and before the plain check passes it never stops
  assert.equal(decisionDoneGraded(n, C, { crit: [], opt: [] }, decisionTable(decisionFit(n, C, { crit: [], opt: [] }), { draws: 100 })).done, false);
});

test("the page offers both grades for each side and keys for them", () => {
  const html = readFileSync(join(here, "decide.html"), "utf8");
  for (const id of ["left-much", "left-bit", "right-bit", "right-much"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /answer\("left", MUCH\)/);
  assert.match(html, /Shift\+&larr;/);
  assert.match(html, /decisionDoneGraded\(n, C, state\.answers, table(, \{ rule \})?\)/, "the page stops through the graded guard");
});
