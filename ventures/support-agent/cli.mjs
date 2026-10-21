#!/usr/bin/env node
// node cli.mjs ask <knowledge.md> "question"        what the agent would do, and why
// node cli.mjs eval <knowledge.md> <questions.csv>  score a question set and recommend the confidence bar
//   --max-wrong 5    cap on wrong answers, % of answers given (default 5)
//   --bar 0.6        score at this bar instead of the recommended one
//   --json           machine-readable output
import { readFileSync } from "node:fs";
import { parseKnowledge, buildAgent, decide } from "./agent.mjs";
import { parseCases, evaluate, reportText } from "./eval.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const json = args.includes("--json"); if (json) args.splice(args.indexOf("--json"), 1);
const maxWrong = flag("--max-wrong"), bar = flag("--bar");
const [cmd, kb, third] = args;
const usage = () => { console.error('usage: node cli.mjs ask <knowledge.md> "question" | node cli.mjs eval <knowledge.md> <questions.csv> [--max-wrong 5] [--bar 0.5] [--json]'); process.exit(2); };
if (!cmd || !kb || !third) usage();
const read = (p) => readFileSync(p === "-" ? 0 : p, "utf8");
const agent = buildAgent(parseKnowledge(read(kb)), bar !== undefined ? { threshold: +bar } : {});

if (cmd === "ask") {
  const d = decide(agent, third);
  if (json) console.log(JSON.stringify(d, null, 2));
  else {
    console.log(`${d.action.toUpperCase()} (confidence ${d.confidence}): ${d.reasons.map((r) => r.label).join("; ")}\n\n${d.text}`);
    if (d.citations.length) console.log(`\nSource: ${d.citations.map((c) => c.title).join(", ")}`);
  }
} else if (cmd === "eval") {
  const r = evaluate(agent, parseCases(read(third)), { maxWrong: maxWrong !== undefined ? +maxWrong / 100 : 0.05, threshold: bar !== undefined ? +bar : undefined });
  console.log(json ? JSON.stringify(r, null, 2) : reportText(r));
} else usage();
