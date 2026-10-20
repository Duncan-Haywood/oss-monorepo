#!/usr/bin/env node
// Zero-dependency CLI: check local Kubernetes workload YAML for missing or
// invalid resource requests/limits. No network call, no kubeconfig -- it
// reads only the file you name.
//
//   node cli.mjs check manifests.yaml
//   node cli.mjs check manifests.yaml --fail-on-risk
//   node cli.mjs check manifests.yaml --json

import fs from "node:fs/promises";
import { analyzeSources, summaryLine, RISK } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOnRisk: false, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on-risk") args.failOnRisk = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else args.positional.push(a);
  }
  return args;
}

function describe(f) {
  const where = `[${f.severity.toUpperCase()}] ${f.resource} (${f.role} "${f.container}")`;
  return `${where}\n      ${f.title}\n      ${f.impact}\n      Fix: ${f.fix}`;
}

function renderHuman(result) {
  const lines = [summaryLine(result)];
  if (result.skipped.length) {
    lines.push(`Skipped (no pod template this tool recognises): ${result.skipped.join(", ")}`);
  }
  for (const f of result.findings) lines.push(`  ${describe(f)}`);
  return lines.join("\n");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8") } = {}) {
  const args = parseArgs(argv);

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs check <manifests.yaml> [--fail-on-risk] [--json]",
        "",
        "<manifests.yaml> is one or more `---`-separated Kubernetes manifest",
        "documents -- a raw file, or the output of `helm template` / `kustomize build`.",
        "",
        "Checks every Pod, Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, and",
        "CronJob for missing memory/CPU/ephemeral-storage requests and limits, and",
        "for a request set above its own limit (which the API server rejects).",
        "",
        "Without --fail-on-risk, exit code is always 0 (informational). With it,",
        "exits 1 if any RISK-severity finding is present (an unbounded container,",
        "or a request above its own limit).",
      ].join("\n"),
    };
  }

  if (args.sub === "check") {
    const [manifestPath] = args.positional;
    if (!manifestPath) return { exitCode: 2, output: "Usage: node cli.mjs check <manifests.yaml>" };
    let text;
    try {
      text = await readFile(manifestPath);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    const result = analyzeSources([{ name: manifestPath, text }]);
    if (result.errors.length) {
      return { exitCode: 2, output: result.errors.map((e) => `Error parsing ${e.name}: ${e.message}`).join("\n") };
    }

    const exitCode = args.failOnRisk && result.counts.risk > 0 ? 1 : 0;
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
