#!/usr/bin/env node
// CLI: compare two files of saved LLM outputs and gate on regressions. No network, no model calls.
// Exit 0 ok, 1 over --max-regressions, 2 bad input.
import { readFileSync } from "node:fs";
import { diff, verdict, DEFAULTS } from "./engine.mjs";

const USAGE = `usage: node cli.mjs diff <baseline.jsonl> <candidate.jsonl> [--max-regressions <n>] [--fail-on error|warn] [--max-length-ratio <n>] [--min-similarity <0-1>] [--json]

Each file is JSONL (or a JSON array) of {"id": "...", "output": "..."}; "text", "response", "completion", "content" or "answer" also work for the output field.`;

function fail(msg) { console.error(msg); process.exit(2); }

const argv = process.argv.slice(2);
const cmd = argv.shift();
if (cmd !== "diff") fail(USAGE);
const files = [];
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) { files.push(a); continue; }
  const k = a.slice(2);
  if (k === "json") opt.json = true;
  else { if (argv[i + 1] === undefined) fail(`--${k} needs a value`); opt[k] = argv[++i]; }
}
if (files.length !== 2) fail(USAGE);
const num = (k, d, lo = 0, hi = Infinity) => {
  if (opt[k] === undefined) return d;
  const n = Number(opt[k]);
  if (!Number.isFinite(n) || n < lo || n > hi) fail(`--${k} needs a number from ${lo} to ${hi}, got "${opt[k]}"`);
  return n;
};
const failOn = opt["fail-on"] ?? "error";
if (!["error", "warn"].includes(failOn)) fail(`--fail-on is "error" or "warn", got "${failOn}"`);
const read = (f) => { try { return readFileSync(f, "utf8"); } catch (e) { return fail(`could not read ${f}: ${e.message}`); } };

const result = diff(read(files[0]), read(files[1]), {
  maxLengthRatio: num("max-length-ratio", DEFAULTS.maxLengthRatio, 1),
  minSimilarity: num("min-similarity", DEFAULTS.minSimilarity, 0, 1),
});
if (result.inputErrors.length) fail(result.inputErrors.join("\n"));
if (!result.cases.length) fail("baseline has no records");
const v = verdict(result, { maxRegressions: num("max-regressions", 0), failOn });

if (opt.json) console.log(JSON.stringify({ ...result, verdict: v }, null, 2));
else {
  for (const c of result.cases) {
    if (!c.findings.length) continue;
    console.log(`${c.findings.some((f) => f.severity === "error") ? "REGRESSED" : "warning  "}  ${c.id}`);
    for (const f of c.findings) console.log(`    [${f.severity}] ${f.rule}: ${f.detail}`);
  }
  if (result.extraIds.length) console.log(`\nIn candidate only (ignored): ${result.extraIds.join(", ")}`);
  console.log(`\n${v.text}`);
}
process.exit(v.fail ? 1 : 0);
