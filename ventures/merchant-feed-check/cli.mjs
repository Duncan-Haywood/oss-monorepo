#!/usr/bin/env node
// Zero-dependency CLI: check a local product-feed file (CSV, TSV, or JSON)
// against Google Merchant Center / Meta Catalog's documented product-data
// requirements. No network call -- it reads only the file you name.
//
//   node cli.mjs check feed.csv
//   node cli.mjs check feed.csv --json
//   node cli.mjs check feed.csv --max-warnings 0   # also fail on warnings

import fs from "node:fs/promises";
import { parseFeed, checkFeed } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, maxWarnings: null, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--max-warnings") args.maxWarnings = Number(argv[++i]);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else args.positional.push(a);
  }
  return args;
}

function renderHuman(result) {
  const lines = [];
  lines.push(
    `${result.totalItems} item(s) checked: ${result.itemsWithErrors} with errors, ${result.totalErrors} error(s), ${result.totalWarnings} warning(s).`,
  );
  for (const { item, errors, warnings } of result.items) {
    if (!errors.length && !warnings.length) continue;
    lines.push("");
    lines.push(`  ${item.id || "(no id)"}${item.title ? ` -- ${item.title}` : ""}`);
    for (const e of errors) lines.push(`    ERROR    [${e.code}] ${e.message}`);
    for (const w of warnings) lines.push(`    warning  [${w.code}] ${w.message}`);
  }
  if (result.feedErrors.length) {
    lines.push("");
    lines.push("  Feed-level:");
    for (const e of result.feedErrors) lines.push(`    ERROR    [${e.code}] ${e.message}`);
  }
  if (result.feedWarnings.length) {
    if (!result.feedErrors.length) {
      lines.push("");
      lines.push("  Feed-level:");
    }
    for (const w of result.feedWarnings) lines.push(`    warning  [${w.code}] ${w.message}`);
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
        "  node cli.mjs check <feed.csv|feed.tsv|feed.json> [--json] [--max-warnings N]",
        "",
        "Exits 1 if any item or feed-level error is found. With --max-warnings,",
        "also exits 1 once the warning count exceeds N (default: warnings never fail).",
      ].join("\n"),
    };
  }

  if (args.sub === "check") {
    const [feedPath] = args.positional;
    if (!feedPath) return { exitCode: 2, output: "Usage: node cli.mjs check <feed-file>" };
    let text;
    try {
      text = await readFile(feedPath);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    let items;
    try {
      items = parseFeed(text);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    const result = checkFeed(items);
    const failedOnWarnings = args.maxWarnings !== null && !Number.isNaN(args.maxWarnings) && result.totalWarnings > args.maxWarnings;
    const exitCode = result.totalErrors > 0 || failedOnWarnings ? 1 : 0;

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
