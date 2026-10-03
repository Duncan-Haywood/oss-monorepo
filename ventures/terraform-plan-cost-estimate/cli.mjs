#!/usr/bin/env node
// Zero-dependency CLI: estimate the monthly AWS cost delta of a local
// Terraform *structured* plan file. No network call -- it reads only the file
// you name, against the price table bundled in engine.mjs.
//
//   terraform plan -out=tfplan && terraform show -json tfplan > plan.json
//   node cli.mjs estimate plan.json
//   node cli.mjs estimate plan.json --region eu-west-1 --json
//   node cli.mjs estimate plan.json --max-delta 200      # CI gate
//
// Exit codes: 0 within budget (or no budget set), 1 the estimated monthly
// delta exceeds --max-delta, 2 the file or an option could not be used.

import fs from "node:fs/promises";
import {
  parsePlan,
  estimatePlan,
  checkBudget,
  formatUsd,
  formatDelta,
  summarize,
  PRICE_TABLE_DATE,
  REGION_MULTIPLIERS,
  BASE_REGION,
} from "./engine.mjs";

export const DISCLAIMER =
  "Estimate from an approximate bundled us-east-1 on-demand price table, not a quote or billing advice. " +
  "Usage-based charges are not included. Verify against the AWS pricing pages and the AWS Pricing Calculator before relying on it.";

export function parseArgs(argv) {
  const args = { json: false, region: null, maxDelta: null, positional: [], errors: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const valueOf = (name) => {
      if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
      if (a === name) {
        i += 1;
        if (i >= argv.length) args.errors.push(`${name} needs a value`);
        return argv[i];
      }
      return undefined;
    };
    if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--region" || a.startsWith("--region=")) args.region = valueOf("--region");
    else if (a === "--max-delta" || a.startsWith("--max-delta=")) args.maxDelta = valueOf("--max-delta");
    else if (a.startsWith("--")) args.errors.push(`unknown option ${a}`);
    else if (!args.sub) args.sub = a;
    else args.positional.push(a);
  }
  return args;
}

const pad = (s, n) => String(s).padEnd(n);

export function renderHuman(report, budget) {
  const t = report.totals;
  const lines = [summarize(report), ""];
  lines.push(`  Added ${formatDelta(t.added)}   Removed ${formatDelta(t.removed)}   Net ${formatDelta(t.delta)} per month`);
  if (report.detectedRegion && report.detectedRegion !== report.region) {
    lines.push(`  Note: the plan's provider config names region ${report.detectedRegion}; re-run with --region ${report.detectedRegion} to price it there.`);
  }
  lines.push("");

  if (report.drivers.length) {
    lines.push("Top cost drivers:");
    for (const d of report.drivers) lines.push(`  ${pad(formatDelta(d.delta), 13)} ${d.address}  (${d.action}, ${d.type})`);
    lines.push("");
  }

  if (report.items.length) {
    lines.push("Priced resources:");
    for (const i of report.items) {
      lines.push(`  ${pad(formatDelta(i.delta), 13)} ${i.address}  [${i.action}]  ${formatUsd(i.before)} -> ${formatUsd(i.after)}`);
      for (const c of i.components) lines.push(`      ${pad(formatUsd(c.monthly), 11)} ${c.label}`);
    }
    lines.push("");
  } else {
    lines.push("No resource in this plan could be priced from the bundled table.");
    lines.push("");
  }

  if (report.usageBased.length) {
    lines.push(`Usage-based (named, not estimated) -- ${report.usageBased.length}:`);
    for (const u of report.usageBased) lines.push(`  ${u.address}  [${u.action}] ${u.usage.join(" ")}`);
    lines.push("");
  }
  if (report.unpriced.length) {
    lines.push(`UNPRICED -- ${report.unpriced.length} changed resource(s) are NOT in the estimate:`);
    for (const u of report.unpriced) lines.push(`  ${u.address}  [${u.action}]  ${u.reason}`);
    lines.push("");
  }
  const notes = [...new Set(report.items.flatMap((i) => i.usage))];
  if (notes.length) {
    lines.push("Assumptions and exclusions:");
    for (const n of notes) lines.push(`  - ${n}`);
    lines.push("");
  }
  lines.push(
    `${report.noChargeCount} changed resource(s) have no direct charge; ${report.unchangedCount} unchanged. ` +
      `Price table dated ${report.priceTableDate} (region ${report.region}, x${report.regionMultiplier}).`,
  );
  if (budget) {
    lines.push(
      budget.exceeded
        ? `BUDGET EXCEEDED: ${formatDelta(budget.delta)}/month is above --max-delta ${formatUsd(budget.max)}.`
        : `Budget ok: ${formatDelta(budget.delta)}/month is within --max-delta ${formatUsd(budget.max)}.`,
    );
    if (report.partial) lines.push("Warning: unpriced resources are excluded, so the real delta may be higher than this gate saw.");
  }
  lines.push(DISCLAIMER);
  return lines.join("\n");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8") } = {}) {
  const args = parseArgs(argv);

  if (args.help || (!args.sub && !args.errors.length)) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs estimate <plan.json> [--region REGION] [--max-delta USD] [--json]",
        "",
        "<plan.json> is the structured plan from:",
        "  terraform plan -out=tfplan && terraform show -json tfplan > plan.json",
        "",
        `--region     one of: ${Object.keys(REGION_MULTIPLIERS).join(", ")} (default ${BASE_REGION})`,
        "--max-delta  fail (exit 1) when the estimated monthly delta is above this many USD",
        "--json       machine-readable output",
        "",
        `Prices: approximate us-east-1 on-demand table dated ${PRICE_TABLE_DATE}, scaled by a rough regional multiplier.`,
        DISCLAIMER,
        "No network call is made; the plan file never leaves this machine.",
        "Exit: 0 ok, 1 over --max-delta, 2 unreadable file or bad option.",
      ].join("\n"),
    };
  }

  if (args.errors.length) return { exitCode: 2, output: `Error: ${args.errors.join("; ")}. Try --help.` };
  if (args.sub !== "estimate") return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };

  let maxDelta = null;
  if (args.maxDelta !== null) {
    maxDelta = Number(args.maxDelta);
    if (args.maxDelta === "" || !Number.isFinite(maxDelta)) {
      return { exitCode: 2, output: `Error: --max-delta "${args.maxDelta}" is not a number of USD per month.` };
    }
  }
  const region = args.region ?? BASE_REGION;
  if (!Object.hasOwn(REGION_MULTIPLIERS, region)) {
    return { exitCode: 2, output: `Error: unknown --region "${region}". Pick one of: ${Object.keys(REGION_MULTIPLIERS).join(", ")}` };
  }

  const [planPath] = args.positional;
  if (!planPath) return { exitCode: 2, output: "Usage: node cli.mjs estimate <plan.json>" };

  let text;
  try {
    text = await readFile(planPath);
  } catch (err) {
    return { exitCode: 2, output: `Error: ${err.message}` };
  }
  let report;
  try {
    report = estimatePlan(parsePlan(text), { region });
  } catch (err) {
    return { exitCode: 2, output: `Error: ${err.message}` };
  }

  const budget = maxDelta === null ? null : checkBudget(report, maxDelta);
  const exitCode = budget?.exceeded ? 1 : 0;
  if (args.json) {
    return { exitCode, output: JSON.stringify({ ...report, budget, disclaimer: DISCLAIMER }, null, 2) };
  }
  return { exitCode, output: renderHuman(report, budget) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
