#!/usr/bin/env node
// Zero-dependency CLI: check local Kubernetes manifest YAML for apiVersion+
// kind pairs a past or future Kubernetes release has removed. No network
// call, no kubeconfig -- it reads only the file you name.
//
//   node cli.mjs check manifests.yaml
//   node cli.mjs check manifests.yaml --target-version 1.25
//   node cli.mjs check manifests.yaml --target-version 1.25 --strict
//   node cli.mjs check manifests.yaml --json

import fs from "node:fs/promises";
import { parseManifests, checkManifests, parseVersion } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, strict: false, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--target-version") args.targetVersion = argv[++i];
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else args.positional.push(a);
  }
  return args;
}

function describe(f) {
  const repl = f.replacement
    ? `${f.replacement.apiVersion}${f.replacement.kind && f.replacement.kind !== f.kind ? `/${f.replacement.kind}` : ""}`
    : "no direct replacement -- see the note";
  const where = `[doc ${f.index}] ${f.kind}/${f.name}`;
  const head = `${where}  ${f.apiVersion}  ->  ${repl}  (removed in Kubernetes ${f.removedIn})`;
  return f.note ? `${head}\n      ${f.note}` : head;
}

function renderHuman(result, { targetVersion, strict }) {
  const lines = [
    `${result.documentsChecked} document(s) checked (${result.manifestsChecked} with a readable apiVersion/kind): ${result.findings.length} deprecated or removed API use(s) found.`,
  ];
  for (const f of result.findings) lines.push(`  ${describe(f)}`);
  if (result.findings.length) {
    lines.push("");
    if (!targetVersion) {
      lines.push(
        "No --target-version was given, so every known deprecated/removed API is listed as informational. " +
          "Pass --target-version <x.y> to fail the check only when your actual cluster version would reject it.",
      );
    } else {
      const removed = result.findings.filter((f) => f.status === "removed").length;
      const deprecated = result.findings.length - removed;
      lines.push(
        `Against Kubernetes ${targetVersion}: ${removed} would fail to apply now, ${deprecated} still work but are on a documented removal schedule.` +
          (strict ? "" : " Re-run with --strict to fail on the deprecated-but-not-yet-removed ones too."),
      );
    }
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
        "  node cli.mjs check <manifests.yaml> [--target-version 1.25] [--strict] [--json]",
        "",
        "<manifests.yaml> is one or more `---`-separated Kubernetes manifest",
        "documents -- a raw file, or the output of `helm template` / `kustomize build`.",
        "",
        "Without --target-version, every documented removal in the manifest is",
        "listed and the command exits 1 if any are found (informational gate).",
        "With --target-version, exits 1 only if the target release would already",
        "reject one of them; add --strict to also fail on ones merely deprecated",
        "as of that version.",
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
    let manifests;
    try {
      manifests = parseManifests(text);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    if (args.targetVersion && !parseVersion(args.targetVersion)) {
      return { exitCode: 2, output: `Error: --target-version must look like "1.25", got "${args.targetVersion}"` };
    }
    const result = checkManifests(manifests, { targetVersion: args.targetVersion ?? null });

    let exitCode = 0;
    if (!args.targetVersion) {
      exitCode = result.findings.length > 0 ? 1 : 0;
    } else {
      const anyRemoved = result.findings.some((f) => f.status === "removed");
      const anyDeprecated = result.findings.some((f) => f.status === "deprecated");
      exitCode = anyRemoved || (args.strict && anyDeprecated) ? 1 : 0;
    }

    if (args.json) return { exitCode, output: JSON.stringify(result, null, 2) };
    return { exitCode, output: renderHuman(result, { targetVersion: args.targetVersion ?? null, strict: args.strict }) };
  }

  return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
