#!/usr/bin/env node
// Zero-dependency, zero-network CLI: look up US call-recording consent rules
// by state, assess a two-state call, and generate a disclosure script. This
// is a reference lookup against a fixed table (see engine.mjs for sourcing
// and scope), never a live legal determination.
//
//   node cli.mjs check California Texas
//   node cli.mjs check CA TX --json
//   node cli.mjs states
//   node cli.mjs states --json
//   node cli.mjs script all-party --company "Acme Inc." --purpose "training purposes"

import { listStates, getRule, assessCall, disclosureScript, FEDERAL_CITATION, INTERSTATE_PRECEDENT } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--company") args.company = argv[++i];
    else if (a === "--purpose") args.purpose = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (!a.startsWith("-")) args.positional.push(a);
  }
  return args;
}

const HELP = [
  "Usage:",
  "  node cli.mjs check <caller state> <recipient state> [--json]",
  "  node cli.mjs states [--json]",
  '  node cli.mjs script <all-party|one-party> [--company "Name"] [--purpose "reason"] [--json]',
  "",
  "check: looks up both states' default call-recording consent rule and",
  "reports the practical combined requirement for a call between them.",
  "Exits 1 when the requirement is all-party consent (get everyone's verbal",
  "yes before you rely on recording), 0 when one-party consent is sufficient.",
  "States accept full names or two-letter abbreviations, case-insensitive.",
  "",
  "states: lists all 51 jurisdictions (50 states + DC) and their default",
  "classification and statute citation (all-party jurisdictions only).",
  "",
  "script: prints a ready-to-read call-opening line for the given",
  "requirement. Not a substitute for reading the actual guidance -- this is",
  "the words to say once you already know which rule applies.",
  "",
  "This is a reference lookup against a fixed table of default state rules,",
  "not a legal determination for any specific call. It does not model",
  "exceptions (911, law enforcement, in-person conversations, a parent",
  "recording a minor's calls, industry-specific notice rules) and state law",
  "changes without notice. Verify before relying on this. Not legal advice.",
].join("\n");

function renderCheck(result) {
  const lines = [];
  lines.push(`Caller:    ${result.caller.state} — ${result.caller.type}${result.caller.statute ? ` (${result.caller.statute})` : ""}`);
  lines.push(`Recipient: ${result.recipient.state} — ${result.recipient.type}${result.recipient.statute ? ` (${result.recipient.statute})` : ""}`);
  lines.push("");
  lines.push(`Requirement: ${result.requirement === "all-party" ? "ALL-PARTY CONSENT REQUIRED" : "ONE-PARTY CONSENT SUFFICIENT"}`);
  lines.push(result.reason);
  if (result.interstate) {
    lines.push("");
    lines.push(`Federal baseline: ${FEDERAL_CITATION}`);
    if (result.requirement === "all-party") lines.push(`Precedent: ${INTERSTATE_PRECEDENT}`);
  }
  lines.push("");
  lines.push("This is a default-rule reference, not a legal determination for this specific call. Not legal advice. Verify against the current statute text or an attorney before relying on it.");
  return lines.join("\n");
}

function renderStates() {
  const lines = ["Jurisdiction | Type | Statute", "---"];
  for (const name of listStates()) {
    const rule = getRule(name);
    lines.push(`${name} | ${rule.type}${rule.statute ? ` | ${rule.statute}` : " |"}`);
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

  if (args.sub === "check") {
    if (args.positional.length !== 2) {
      return { exitCode: 2, output: "Usage: node cli.mjs check <caller state> <recipient state>" };
    }
    let result;
    try {
      result = assessCall(args.positional[0], args.positional[1]);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    const exitCode = result.requirement === "all-party" ? 1 : 0;
    if (args.json) return { exitCode, output: JSON.stringify(result, null, 2) };
    return { exitCode, output: renderCheck(result) };
  }

  if (args.sub === "script") {
    const requirement = args.positional[0];
    if (requirement !== "all-party" && requirement !== "one-party") {
      return { exitCode: 2, output: 'Usage: node cli.mjs script <all-party|one-party> [--company "Name"] [--purpose "reason"]' };
    }
    const script = disclosureScript(requirement, { company: args.company, purpose: args.purpose });
    if (args.json) return { exitCode: 0, output: JSON.stringify({ requirement, script }, null, 2) };
    return { exitCode: 0, output: script };
  }

  return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
