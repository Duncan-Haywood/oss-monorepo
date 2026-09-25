#!/usr/bin/env node
// Zero-dependency CLI: reads a requirements.txt (or a PEP 621 pyproject.toml,
// or a plain list) and asks PyPI, per package, whether the resolved release
// carries a publish attestation (PEP 740 provenance -- trusted publishing/
// OIDC via a supported CI) versus a classic, stealable API token. The
// official verifier, `pypi-attestations verify`, checks one already-
// downloaded artifact at a time with no bulk or CI-friendly report -- see
// README.md.
//
//   node cli.mjs requirements.txt
//   node cli.mjs requirements.txt --json
//   node cli.mjs requirements.txt --without-provenance-only
//   node cli.mjs pyproject.toml                    # unpinned deps: checks latest
//   echo "pip\nsix==1.17.0" | node cli.mjs -        # freeform list on stdin

import fs from "node:fs/promises";
import { parseInput, lookupPackage, summarizeReport, mapWithConcurrency } from "./engine.mjs";

const CONCURRENCY = 6;

function parseArgs(argv) {
  const args = { json: false, withoutProvenanceOnly: false, positional: [] };
  for (const a of argv) {
    if (a === "--json") args.json = true;
    else if (a === "--without-provenance-only") args.withoutProvenanceOnly = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else args.positional.push(a);
  }
  return args;
}

async function readStdin(readFn) {
  const chunks = [];
  for await (const chunk of readFn) chunks.push(chunk);
  return Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString("utf8");
}

function renderHuman(rows, summary) {
  const lines = [
    `${summary.withProvenance} of ${summary.total} package(s) have a provenance attestation.`,
  ];
  if (summary.notFound || summary.errors) {
    lines.push(`(${summary.notFound} not found on PyPI, ${summary.errors} lookup error(s) -- see below.)`);
  }
  lines.push("");
  for (const row of rows) {
    if (row.status === "ok" && row.hasProvenance) lines.push(`  PROVENANCE  ${row.name}==${row.resolvedVersion}`);
  }
  for (const row of rows) {
    if (row.status === "ok" && !row.hasProvenance) lines.push(`  none        ${row.name}==${row.resolvedVersion}`);
  }
  for (const row of rows) {
    if (row.status !== "ok") {
      lines.push(`  ${row.status === "not-found" ? "not found " : "error     "}  ${row.name}${row.requestedVersion ? `==${row.requestedVersion}` : ""}  -- ${row.detail}`);
    }
  }
  return lines.join("\n");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), stdin = process.stdin, fetchImpl = fetch } = {}) {
  const args = parseArgs(argv);

  if (args.help || !args.positional.length) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs <requirements.txt | pyproject.toml | list-file>",
        "  node cli.mjs -                     # read a freeform list from stdin",
        "  node cli.mjs <file> --json",
        "  node cli.mjs <file> --without-provenance-only",
        "",
        "Makes two read-only GETs per package to pypi.org (metadata, then the",
        "PEP 740 integrity/provenance endpoint) -- no PyPI token, no account,",
        "nothing of yours is uploaded, only package names and versions from",
        "the file you name go out.",
      ].join("\n"),
    };
  }

  const [target] = args.positional;
  let text;
  try {
    text = target === "-" ? await readStdin(stdin) : await readFile(target);
  } catch (err) {
    return { exitCode: 2, output: `Error: ${err.message}` };
  }

  let entries;
  try {
    entries = parseInput(text);
  } catch (err) {
    return { exitCode: 2, output: `Error: ${err.message}` };
  }
  if (!entries.length) {
    return { exitCode: 2, output: "Error: no packages found in that input." };
  }

  const rows = await mapWithConcurrency(entries, CONCURRENCY, (pkg) => lookupPackage(pkg, { fetchImpl }));

  const filtered = args.withoutProvenanceOnly ? rows.filter((r) => r.status !== "ok" || !r.hasProvenance) : rows;
  const summary = summarizeReport(rows);

  if (args.json) {
    return { exitCode: 0, output: JSON.stringify({ summary, rows: filtered }, null, 2) };
  }
  return { exitCode: 0, output: renderHuman(filtered, summary) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
