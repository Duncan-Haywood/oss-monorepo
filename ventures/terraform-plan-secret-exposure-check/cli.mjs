#!/usr/bin/env node
// Zero-dependency CLI: check a local Terraform *structured* plan file for
// secret-shaped values the provider schema did not mark `sensitive`. No
// network call -- it reads only the file you name.
//
//   terraform plan -out=tfplan && terraform show -json tfplan > plan.json
//   node cli.mjs check plan.json
//   node cli.mjs check plan.json --json

import fs from "node:fs/promises";
import { parsePlan, checkPlan } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, positional: [] };
  for (const a of argv) {
    if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else args.positional.push(a);
  }
  return args;
}

function renderHuman(result) {
  const lines = [
    `${result.resourcesChecked} resource change(s) and ${result.outputsChecked} output(s) checked: ${result.findings.length} unmarked secret-shaped value(s) found.`,
  ];
  for (const f of result.findings) {
    lines.push(
      `  ${f.resourceAddress}  [${f.side}]  ${f.path}  ->  ${f.label} (${f.code})  ${f.redacted}`,
    );
  }
  if (result.findings.length) {
    lines.push("");
    lines.push(
      "Each of these prints its real value in plaintext into any log or diff that reads this plan. " +
        'Add `sensitive = true` to the attribute in the resource/output, or a `sensitive` variable if ' +
        "it comes from input, then re-plan.",
    );
  }
  return lines.join("\n");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8") } = {}) {
  const args = parseArgs(argv);

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs check <plan.json> [--json]",
        "",
        "<plan.json> is the structured plan from:",
        "  terraform plan -out=tfplan && terraform show -json tfplan > plan.json",
        "",
        "Exits 1 if any unmarked secret-shaped value is found, so it can gate CI",
        "before an apply.",
      ].join("\n"),
    };
  }

  if (args.sub === "check") {
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
    const result = checkPlan(plan);
    const exitCode = result.findings.length > 0 ? 1 : 0;
    if (args.json) return { exitCode, output: JSON.stringify(result, null, 2) };
    return { exitCode, output: renderHuman(result) };
  }

  return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
