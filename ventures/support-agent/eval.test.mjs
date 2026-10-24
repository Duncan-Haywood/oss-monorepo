import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseKnowledge, buildAgent, decide } from "./agent.mjs";
import { parseCsv, parseCases, evaluate, outcome, reportText } from "./eval.mjs";
import { fitLogistic } from "./calibrate.mjs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("CSV handles quotes, commas and blank lines", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""\n\n'), [["a", "b"], ["x, y", 'say "hi"']]);
  assert.deepEqual(parseCases("question,expect\nWhere?,track-order|shipping\nHuman,HANDOFF\n,missing"), [
    { question: "Where?", expect: ["track-order", "shipping"] }, { question: "Human", expect: ["handoff"] }]);
});

test("outcomes: a wrong answer and a missed answer are told apart", () => {
  assert.equal(outcome({ action: "answer", citations: [{ articleId: "a" }] }, ["a"]), "correct");
  assert.equal(outcome({ action: "answer", citations: [{ articleId: "b" }] }, ["a"]), "wrong");
  assert.equal(outcome({ action: "answer", citations: [{ articleId: "a" }] }, ["handoff"]), "wrong");
  assert.equal(outcome({ action: "handoff", citations: [] }, ["handoff"]), "handoff_ok");
  assert.equal(outcome({ action: "clarify", citations: [] }, ["a"]), "missed");
  assert.equal(outcome({ action: "suggest", citations: [{ articleId: "b" }, { articleId: "a" }] }, ["a"]), "suggested");
});

test("the recommended bar keeps wrong answers under the cap and answers the most under it", () => {
  const agent = buildAgent(parseKnowledge(read("./fixtures/sample-kb.md")));
  const cases = parseCases(read("./fixtures/sample-questions.csv"));
  const r = evaluate(agent, cases, { maxWrong: 0.05 });
  assert.ok(r.summary.answered === 0 || r.summary.wrong / r.summary.answered <= 0.05);
  for (const s of r.sweep) if (s.answered && s.wrong / s.answered <= 0.05) assert.ok(s.correct <= r.summary.correct, `bar ${s.bar}`);
  // Scoring at a fixed bar matches what decide() does at that bar.
  const fixed = evaluate(agent, cases, { threshold: 0.65 });
  const at = buildAgent(parseKnowledge(read("./fixtures/sample-kb.md")), { threshold: 0.65 });
  const direct = cases.filter((c) => outcome(decide(at, c.question), c.expect) === "correct").length;
  assert.equal(fixed.summary.correct, direct);
  assert.match(reportText(r), /answered correctly/);
});

test("hand-written sample: at least a third answered right with at most one wrong answer at the recommended bar", () => {
  const r = evaluate(buildAgent(parseKnowledge(read("./fixtures/sample-kb.md"))), parseCases(read("./fixtures/sample-questions.csv")));
  assert.ok(r.summary.correct >= 29, `correct ${r.summary.correct}`);
  assert.ok(r.summary.wrong <= 1, `wrong ${r.summary.wrong}`);
});

test("logistic fit separates a feature that predicts the label", () => {
  const rows = Array.from({ length: 200 }, (_, i) => { const x = (i % 20) / 20; return { f: { coverage: x, margin: 0, share: 0.5, score: 1, terms: 0.5, unknown: 0, all: 0, exAgree: 0, exHandoff: 0, exSim: 0 }, y: x > 0.5 ? 1 : 0 }; });
  const cal = fitLogistic(rows);
  assert.ok(cal.weights.coverage > 1, JSON.stringify(cal.weights));
  assert.equal(cal.rows, 200);
});

test("BANKING77 held-out test: the README's numbers, and the built-in models are the ones the benchmark fits", async () => {
  const { run } = await import("./fixtures/banking77/benchmark.mjs");
  const { DEFAULT_CALIBRATION, DEFAULT_CALIBRATION_EXAMPLES } = await import("./agent.mjs");
  const none = run(0), forty = run(40);
  assert.deepEqual([none.test.correct, none.test.wrong, none.bar], [65, 0, 0.923]);
  assert.deepEqual([forty.test.correct, forty.test.wrong, forty.bar], [1007, 66, 0.787]);
  for (const [r, d] of [[none, DEFAULT_CALIBRATION], [forty, DEFAULT_CALIBRATION_EXAMPLES]]) {
    const c = r.calibration;
    assert.deepEqual({ weights: c.weights, bias: c.bias, bar: c.bar }, { weights: d.weights, bias: d.bias, bar: d.bar }, `refresh with: node fixtures/banking77/benchmark.mjs --defaults (${r.examples})`);
  }
});
