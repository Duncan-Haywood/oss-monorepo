#!/usr/bin/env node
// Zero-dependency, zero-network CLI: scan job-posting text for a stated pay
// range and cross-reference a set of US states against a fixed table of
// which ones currently require a posted range. Reference lookup + text
// pattern scan only, never a compliance determination -- see engine.mjs.
//
//   node cli.mjs scan "$60,000 - $80,000 per year" --states CO,NY
//   node cli.mjs scan --file posting.txt --states California,Texas --json
//   node cli.mjs states
//   node cli.mjs states --json

import { readFileSync } from "node:fs";
import { listStates, getRule, rangeRequiredStates, checkPosting } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--states") args.states = argv[++i];
    else if (a === "--file") args.file = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (!a.startsWith("-")) args.positional.push(a);
  }
  return args;
}

const HELP = [
  "Usage:",
  '  node cli.mjs scan "<posting text>" [--states CO,NY,...] [--json]',
  "  node cli.mjs scan --file <path> [--states CO,NY,...] [--json]",
  "  node cli.mjs states [--json]",
  "",
  "scan: reads the posting text (inline argument or --file) and reports",
  "whether it appears to state a dollar RANGE, a single figure, or no dollar",
  "amount, then checks the given --states (comma-separated, full names or",
  "two-letter abbreviations) against a fixed table of which US jurisdictions",
  "currently require a posted range. Exits 1 when at least one given state",
  "requires a range and the text does not appear to have one, 0 otherwise.",
  "",
  "states: lists every jurisdiction this tool has a rule for -- the",
  "range-required ones with their law, effective date, and size threshold.",
  "",
  "This is a literal text-pattern scan plus a reference lookup against a",
  "fixed table, not a compliance determination for any specific posting.",
  "It does not know whether a detected number is a good-faith range, a",
  "wage vs. a bonus, or whether your employer meets the size threshold, and",
  "it covers only state/DC-level posting laws, not city or county",
  "ordinances. State law changes without notice -- verify before relying",
  "on this. Not legal advice.",
].join("\n");

function renderScan(result) {
  const lines = [];
  lines.push(`Posting text scan: ${result.scan.classification.toUpperCase()}`);
  lines.push(result.scan.detail);
  if (result.covered.length) {
    lines.push("");
    lines.push("Selected states that require a range, and this text appears to have one:");
    for (const r of result.covered) lines.push(`  - ${r.state} (${r.law}, effective ${r.effective})`);
  }
  if (result.missing.length) {
    lines.push("");
    lines.push("Selected states that require a range, but none was detected in this text:");
    for (const r of result.missing) lines.push(`  - ${r.state} (${r.law}, effective ${r.effective}, threshold: ${r.threshold})`);
  }
  if (result.notApplicable.length) {
    lines.push("");
    lines.push("Selected states with no state-level posting-range requirement modeled here:");
    for (const r of result.notApplicable) lines.push(`  - ${r.state}`);
  }
  lines.push("");
  lines.push("Reference scan only, not a compliance determination for this posting. Not legal advice. Verify against current state guidance.");
  return lines.join("\n");
}

function renderStates() {
  const lines = ["Jurisdiction | Requires range? | Law | Effective | Threshold", "---"];
  for (const name of listStates()) {
    const rule = getRule(name);
    if (rule.type === "range-required") {
      lines.push(`${name} | yes | ${rule.law} | ${rule.effective} | ${rule.threshold}`);
    } else {
      lines.push(`${name} | no |  |  |`);
    }
  }
  return lines.join("\n");
}

export function run(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) return { exitCode: args.help ? 0 : 1, output: HELP };

  if (args.sub === "states") {
    const rules = listStates().map((name) => ({ name, ...getRule(name) }));
    if (args.json) return { exitCode: 0, output: JSON.stringify(rules, null, 2) };
    return { exitCode: 0, output: renderStates() };
  }

  if (args.sub === "scan") {
    let text = args.positional.join(" ");
    if (args.file) {
      try {
        text = readFileSync(args.file, "utf8");
      } catch (err) {
        return { exitCode: 2, output: `Error reading --file: ${err.message}` };
      }
    }
    if (!text) return { exitCode: 2, output: 'Usage: node cli.mjs scan "<posting text>" [--states CO,NY,...]' };
    const states = args.states ? args.states.split(",").map((s) => s.trim()).filter(Boolean) : [];
    let result;
    try {
      result = checkPosting(text, states);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    const exitCode = result.missing.length > 0 ? 1 : 0;
    if (args.json) return { exitCode, output: JSON.stringify(result, null, 2) };
    return { exitCode, output: renderScan(result) };
  }

  return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}

export { rangeRequiredStates };
