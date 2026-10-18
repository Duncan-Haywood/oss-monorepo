#!/usr/bin/env node
// Zero-dependency CLI: reads a package-lock.json (or package.json, or a
// plain list) and asks the public npm registry, once per package, whether
// the resolved version carries a provenance attestation -- the signal that
// distinguishes a package published via npm trusted publishing (OIDC, no
// long-lived token to steal) or `npm publish --provenance` from one
// published the old way, with a token that can be exfiltrated the way the
// 2025-2026 Shai-Hulud worm did. `npm audit signatures` reports this too,
// but only for packages already in a project you have open, one project at
// a time, with no bulk or CI-friendly report -- see README.md.
//
//   node cli.mjs package-lock.json
//   node cli.mjs package-lock.json --json
//   node cli.mjs package-lock.json --without-provenance-only
//   node cli.mjs package.json                      # unpinned: checks "latest" per package
//   echo "vite\nleft-pad@1.3.0" | node cli.mjs -    # freeform list on stdin

import fs from "node:fs/promises";
import { parseInput, rowFromRegistryResponse, summarizeReport, mapWithConcurrency, registryUrl } from "./engine.mjs";

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
    lines.push(`(${summary.notFound} not found on the registry, ${summary.errors} lookup error(s) -- see below.)`);
  }
  lines.push("");
  for (const row of rows) {
    if (row.status === "ok" && row.hasProvenance) {
      lines.push(`  PROVENANCE  ${row.name}@${row.resolvedVersion}`);
    }
  }
  for (const row of rows) {
    if (row.status === "ok" && !row.hasProvenance) {
      lines.push(`  none        ${row.name}@${row.resolvedVersion}`);
    }
  }
  for (const row of rows) {
    if (row.status !== "ok") {
      lines.push(`  ${row.status === "not-found" ? "not found " : "error     "}  ${row.name}${row.requestedVersion ? `@${row.requestedVersion}` : ""}  -- ${row.detail}`);
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
        "  node cli.mjs <package-lock.json | package.json | list-file>",
        "  node cli.mjs -                     # read a freeform list from stdin",
        "  node cli.mjs <file> --json",
        "  node cli.mjs <file> --without-provenance-only",
        "",
        "Makes one read-only GET per package to registry.npmjs.org (the same",
        "registry npm install already talks to) -- no npm token, no account,",
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

  const rows = await mapWithConcurrency(entries, CONCURRENCY, async (pkg) => {
    try {
      const res = await fetchImpl(registryUrl(pkg.name, pkg.version));
      if (!res.ok) return rowFromRegistryResponse(pkg, { httpStatus: res.status, body: null });
      const body = await res.json();
      return rowFromRegistryResponse(pkg, { httpStatus: res.status, body });
    } catch (error) {
      return rowFromRegistryResponse(pkg, { error });
    }
  });

  const filtered = args.withoutProvenanceOnly
    ? rows.filter((r) => r.status !== "ok" || !r.hasProvenance)
    : rows;
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
