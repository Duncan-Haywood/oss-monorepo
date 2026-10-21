#!/usr/bin/env node
// The BANKING77 benchmark behind the README's numbers. Everything is chosen on dev.csv (training split) and then
// scored once on test.csv (the dataset's held-out test split):
//   1. fit the confidence model on dev.csv, with 0, 10 and 40 past questions per intent from examples.csv;
//   2. pick the confidence bar on dev.csv that answers most correctly with wrong answers <= 5% of answers;
//   3. score test.csv with that model and bar.
//   node fixtures/banking77/benchmark.mjs            the table
//   node fixtures/banking77/benchmark.mjs --defaults the fitted models as JSON (agent.mjs DEFAULT_CALIBRATION*)
import { readFileSync } from "node:fs";
import { parseKnowledge, buildAgent } from "../../agent.mjs";
import { parseCases, evaluate } from "../../eval.mjs";
import { calibrate } from "../../calibrate.mjs";

const here = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
export const articles = parseKnowledge(here("kb.md"));
export const dev = parseCases(here("dev.csv"));
export const test = parseCases(here("test.csv"));

// Past questions: the first n of each intent in examples.csv (its third column names the intent).
export function examples(n) {
  const per = {}, out = [];
  const rows = here("examples.csv").trim().split("\n").slice(1).map((l) => l.slice(l.lastIndexOf(",") + 1));
  parseCases(here("examples.csv")).forEach((c, i) => { per[rows[i]] = (per[rows[i]] || 0) + 1; if (per[rows[i]] <= n) out.push({ question: c.question, label: c.expect[0] }); });
  return out;
}

export function run(n, maxWrong = 0.05) {
  const ex = n ? { examples: examples(n) } : {};
  const calibration = calibrate(buildAgent(articles, ex), dev);
  const agent = buildAgent(articles, { ...ex, calibration });
  const onDev = evaluate(agent, dev, { maxWrong });
  calibration.bar = onDev.recommended;
  const onTest = evaluate(agent, test, { maxWrong, threshold: onDev.recommended });
  return { examples: n, calibration, dev: onDev.summary, test: onTest.summary, bar: onDev.recommended };
}

if (process.argv[1]?.endsWith("benchmark.mjs")) {
  const runs = [0, 10, 40].map((n) => run(n));
  if (process.argv.includes("--defaults")) console.log(JSON.stringify(Object.fromEntries(runs.map((r) => [r.examples, r.calibration])), null, 1));
  else {
    console.log(`BANKING77, ${articles.length} articles; dev ${dev.length} questions, test ${test.length} (bar chosen on dev for wrong answers <= 5% of answers)\n`);
    console.log("past questions | bar   | answered right | answered wrong (% of answers) | offered articles (a right one) | handed off rightly | handed off, article had it");
    for (const r of runs) { const t = r.test; console.log([String(r.examples).padEnd(14), r.bar.toFixed(3), `${t.correct} (${t.resolved_pct}%)`.padEnd(14), `${t.wrong} (${t.wrong_of_answered_pct}%)`.padEnd(29), `${t.suggested + t.suggested_wrong} (${t.suggested})`.padEnd(30), String(t.handoff_ok).padEnd(18), t.missed].join(" | ")); }
  }
}
