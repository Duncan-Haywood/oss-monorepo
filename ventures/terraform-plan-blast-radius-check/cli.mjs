#!/usr/bin/env node
// Zero-dependency CLI: report the blast radius of a local Terraform
// *structured* plan file before anything applies it. No network call -- it
// reads only the file you name.
//
//   terraform plan -out=tfplan && terraform show -json tfplan > plan.json
//   node cli.mjs check plan.json
//   node cli.mjs check plan.json --json
//   node cli.mjs check plan.json --fail-on=replace-stateful   # CI gate
//
// Exit codes are the gate: 0 nothing matched the chosen threshold, 1 something
// did, 2 the tool could not read or parse the file.

import fs from "node:fs/promises";
import {
  parsePlan,
  analyzePlan,
  summarize,
  ACTION_CREATE,
  ACTION_UPDATE,
  ACTION_DELETE,
  ACTION_REPLACE,
  ACTION_NOOP,
} from "./engine.mjs";

/**
 * What counts as a failure, loosest last.
 *
 * The default is `replace-stateful` rather than `destructive`, deliberately:
 * a gate that fires on every destroy fires on every plan in a repository that
 * uses `count`, and a gate that fires constantly is one somebody adds
 * `continue-on-error` to within a week.
 */
export const FAIL_MODES = {
  "replace-stateful": {
    describe: "a replace on a resource type that holds data (default)",
    select: (r) => r.dataLossRisks,
  },
  "delete-stateful": {
    describe: "the above, plus a true deletion of a data-holding resource",
    select: (r) => [...new Set([...r.dataLossRisks, ...r.statefulDeletions])],
  },
  destructive: {
    describe: "any destroy or replace at all",
    select: (r) => r.destructive,
  },
  never: { describe: "report only; always exit 0", select: () => [] },
};

export function parseArgs(argv) {
  const args = { json: false, failOn: "replace-stateful", positional: [] };
  for (const a of argv) {
    if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("--fail-on=")) args.failOn = a.slice("--fail-on=".length);
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else args.positional.push(a);
  }
  return args;
}

function renderDestructive(entry) {
  const lines = [];
  const badge = entry.dataLossRisk
    ? "DATA LOSS RISK"
    : entry.trueDeletion && entry.stateful
      ? "DESTROYING STORED DATA"
      : entry.trueDeletion
        ? "GOING AWAY"
        : entry.action === ACTION_REPLACE
          ? "replace"
          : "destroy";
  const order = entry.action === ACTION_REPLACE ? (entry.createFirst ? " (create before destroy)" : " (destroy then create)") : "";
  lines.push(`  [${badge}] ${entry.address}${order}`);
  lines.push(`      type: ${entry.type}   module: ${entry.module}`);
  if (entry.stateful) lines.push(`      holds: ${entry.stateful.label} -- ${entry.stateful.loss}`);
  if (entry.replacePaths.length) {
    lines.push(`      forced by: ${entry.replacePaths.join(", ")}`);
  } else if (entry.action === ACTION_REPLACE) {
    lines.push("      forced by: the plan lists no replace_paths for this resource");
  }
  if (entry.actionReasonText) lines.push(`      reason: ${entry.actionReasonText}`);
  if (entry.deposed) lines.push(`      deposed object: ${entry.deposed}`);
  return lines;
}

export function renderHuman(report, failMode) {
  const lines = [summarize(report), ""];

  if (report.dataLossRisks.length) {
    lines.push(`!! ${report.dataLossRisks.length} replace(s) on resource types that hold data:`);
  }
  if (report.statefulDeletions.length) {
    lines.push(`!! ${report.statefulDeletions.length} data-holding resource(s) being destroyed outright:`);
  }

  if (report.destructive.length) {
    lines.push(`Destroys and replaces (${report.destructive.length}), most consequential first:`);
    for (const entry of report.destructive) lines.push(...renderDestructive(entry));
    lines.push("");
  } else {
    lines.push("No resource is destroyed or replaced by this plan.");
    lines.push("");
  }

  const typeRows = report.byType.filter((r) => r.total > 0);
  if (typeRows.length) {
    lines.push("By resource type:");
    for (const row of typeRows) {
      lines.push(
        `  ${row.type}: ${row[ACTION_CREATE]} create, ${row[ACTION_UPDATE]} update, ` +
          `${row[ACTION_REPLACE]} replace, ${row[ACTION_DELETE]} destroy, ${row[ACTION_NOOP]} no-op`,
      );
    }
    lines.push("");
  }

  if (report.byModule.length) {
    lines.push("By module:");
    for (const row of report.byModule) {
      lines.push(
        `  ${row.module}: ${row[ACTION_CREATE]} create, ${row[ACTION_UPDATE]} update, ` +
          `${row[ACTION_REPLACE]} replace, ${row[ACTION_DELETE]} destroy, ${row[ACTION_NOOP]} no-op`,
      );
    }
    lines.push("");
  }

  lines.push(
    `Gate: --fail-on=${failMode} (${FAIL_MODES[failMode].describe}). ` +
      "This report is informational and pattern-based -- read the plan itself before you apply it.",
  );
  return lines.join("\n");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8") } = {}) {
  const args = parseArgs(argv);

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs check <plan.json> [--json] [--fail-on=MODE]",
        "",
        "<plan.json> is the structured plan from:",
        "  terraform plan -out=tfplan && terraform show -json tfplan > plan.json",
        "",
        "MODE is one of:",
        ...Object.entries(FAIL_MODES).map(([k, v]) => `  ${k.padEnd(17)} ${v.describe}`),
        "",
        "Exits 1 when the chosen mode matches something, so it can gate CI before",
        "an apply. Exits 2 if the file cannot be read or is not a structured plan.",
      ].join("\n"),
    };
  }

  if (args.sub !== "check") {
    return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  }

  if (!Object.hasOwn(FAIL_MODES, args.failOn)) {
    return {
      exitCode: 2,
      output: `Error: unknown --fail-on value "${args.failOn}". Pick one of: ${Object.keys(FAIL_MODES).join(", ")}`,
    };
  }

  const [planPath] = args.positional;
  if (!planPath) return { exitCode: 2, output: "Usage: node cli.mjs check <plan.json>" };

  let text;
  try {
    text = await readFile(planPath);
  } catch (err) {
    return { exitCode: 2, output: `Error: ${err.message}` };
  }

  let plan;
  try {
    plan = parsePlan(text);
  } catch (err) {
    return { exitCode: 2, output: `Error: ${err.message}` };
  }

  const report = analyzePlan(plan);
  const matched = FAIL_MODES[args.failOn].select(report);
  const exitCode = matched.length > 0 ? 1 : 0;

  if (args.json) {
    return { exitCode, output: JSON.stringify({ ...report, failOn: args.failOn, failed: exitCode === 1 }, null, 2) };
  }
  return { exitCode, output: renderHuman(report, args.failOn) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
