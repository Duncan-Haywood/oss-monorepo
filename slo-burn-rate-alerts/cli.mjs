#!/usr/bin/env node
// Zero-dependency CLI: SLO error budget, burn-rate alert policy, and a
// Prometheus rule file. No network call.
//
//   node cli.mjs plan --slo 99.9
//   node cli.mjs plan --slo 99.9 --period 28 --rps 40
//   node cli.mjs rules --slo 99.9 --name api --errors 'http_requests_total{job="api",code=~"5.."}' --total 'http_requests_total{job="api"}' > slo-api.rules.yml
//   node cli.mjs plan --slo 99.9 --json

import { budgetTable, buildPolicy, detectionTime, lint, generateRules, summarize, validateInputs, fmtDuration, promDuration, METHOD_NOTE } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, period: 30, failOn: "error" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--slo") args.slo = Number(argv[++i]);
    else if (a === "--period") args.period = Number(argv[++i]);
    else if (a === "--rps") args.rps = Number(argv[++i]);
    else if (a === "--name") args.name = argv[++i];
    else if (a === "--errors") args.errors = argv[++i];
    else if (a === "--total") args.total = argv[++i];
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else args.unknown = a;
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs plan  --slo <percent> [--period days] [--rps N] [--json] [--fail-on error|warn]",
  "  node cli.mjs rules --slo <percent> --name <slo-name> --errors <selector> --total <selector> [--period days]",
  "",
  "plan   prints the downtime budget, the multi-window burn-rate alert policy, how fast each alert",
  "       fires in a total outage, and findings (unreachable thresholds, low-traffic flapping).",
  "       Exit 1 when a finding is an error (or a warning with --fail-on warn).",
  "rules  prints a Prometheus rule file: SLI recording rules plus one alert per burn-rate window.",
  "No network call. Output is generated from your inputs -- review it before loading it.",
].join("\n");

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) return { exitCode: args.help ? 0 : 1, output: USAGE };
  if (!["plan", "rules"].includes(args.sub)) return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  if (args.unknown) return { exitCode: 2, output: `Unknown option ${args.unknown}. Try --help.` };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };
  const bad = validateInputs({ slo: args.slo, periodDays: args.period });
  if (bad.length) return { exitCode: 2, output: bad.join("\n") };
  if (args.rps !== undefined && !(args.rps >= 0)) return { exitCode: 2, output: "--rps needs a non-negative number." };

  if (args.sub === "rules") {
    try {
      return { exitCode: 0, output: generateRules({ name: args.name, slo: args.slo, periodDays: args.period, errors: args.errors, total: args.total }).trimEnd() };
    } catch (err) {
      return { exitCode: 2, output: err.message };
    }
  }

  const opts = { rps: args.rps ?? null };
  const summary = summarize(args.slo, args.period, opts);
  const budget = budgetTable(args.slo, args.period);
  const policy = buildPolicy(args.slo, args.period).map((p) => ({ ...p, outageDetection: detectionTime(p, 1) }));
  const failing = summary.findings.some((f) => f.severity === "error" || (args.failOn === "warn" && f.severity === "warn"));
  const exitCode = failing ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, budget, policy, method: METHOD_NOTE }, null, 2) };

  const lines = [summary.text, "", "Allowed downtime:"];
  for (const r of budget.rows) lines.push(`  ${r.label.padEnd(22)} ${fmtDuration(r.allowedDowntime)}`);
  lines.push("", "Alert policy (fires when BOTH windows exceed the threshold):");
  for (const p of policy) {
    lines.push(`  ${p.severity.padEnd(6)} ${String(p.burnRate).padStart(5)}x burn  ${promDuration(p.long)}/${promDuration(p.short)}  error ratio > ${(p.errorRatioThreshold * 100).toPrecision(3)}%  total outage detected in ${fmtDuration(p.outageDetection)}${p.reachable ? "" : "  UNREACHABLE"}`);
  }
  if (summary.findings.length) {
    lines.push("", "Findings:");
    for (const f of summary.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}  ${f.message}`);
  }
  lines.push("", METHOD_NOTE);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
