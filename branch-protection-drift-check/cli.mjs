#!/usr/bin/env node
// Zero-dependency CLI: same engine.mjs the browser page imports, reading
// two files from disk instead of two textareas. No network calls -- fetch
// your own branch-protection JSON with
//   gh api repos/:owner/:repo/branches/:branch/protection > actual.json
// first; this tool never does that for you.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  compare,
  hasDrift,
  isUnprotected,
  summaryLine,
  parsePolicyText,
  parseActualText,
  DRIFT,
  STRONGER,
  NOT_POLICED,
} from "./engine.mjs";

function usage() {
  return `branch-protection-drift-check

Usage:
  node cli.mjs --actual <file> --policy <file> [--format text|json] [--fail-on-drift]

  --actual <file>   JSON from: gh api repos/:owner/:repo/branches/:branch/protection
  --policy <file>   Your declared policy: JSON, or plain "key: value" lines.
                     See README.md for the field list.
  --format          "text" (default) or "json".
  --fail-on-drift   Exit 2 if any policed rule has drifted weaker than policy.
`;
}

export function parseArgs(argv) {
  const args = { format: "text", failOnDrift: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--actual") args.actual = argv[++i];
    else if (arg === "--policy") args.policy = argv[++i];
    else if (arg === "--format") args.format = argv[++i];
    else if (arg === "--fail-on-drift") args.failOnDrift = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unrecognized argument: ${arg}`);
  }
  return args;
}

export function renderText(rows, actual) {
  const lines = [summaryLine(rows, actual), ""];
  for (const row of rows) {
    if (row.status === NOT_POLICED) continue;
    const marker = row.status === DRIFT ? "DRIFT  " : row.status === STRONGER ? "stronger" : "ok      ";
    if (row.kind === "set") {
      const detail = row.missing.length ? `missing: ${row.missing.join(", ")}` : row.extra.length ? `extra (fine): ${row.extra.join(", ")}` : "matches";
      lines.push(`${marker}  ${row.label} — ${detail}`);
    } else {
      lines.push(`${marker}  ${row.label} — actual: ${JSON.stringify(row.actual)}, policy: ${JSON.stringify(row.declared)}`);
    }
  }
  const unpoliced = rows.filter((r) => r.status === NOT_POLICED).map((r) => r.label);
  if (unpoliced.length) lines.push("", `Not policed (policy is silent on): ${unpoliced.join(", ")}`);
  return lines.join("\n");
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.actual || !args.policy) {
    process.stdout.write(usage());
    process.exit(args.help ? 0 : 1);
    return;
  }
  const actual = parseActualText(readFileSync(args.actual, "utf8"));
  const policy = parsePolicyText(readFileSync(args.policy, "utf8"));
  const rows = compare(actual, policy);

  if (args.format === "json") {
    process.stdout.write(JSON.stringify({ unprotected: isUnprotected(actual), rows }, null, 2) + "\n");
  } else {
    process.stdout.write(renderText(rows, actual) + "\n");
  }

  if (args.failOnDrift && hasDrift(rows)) process.exit(2);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
