#!/usr/bin/env node
// Zero-dependency CLI. Reads a package.json and, for every dependency that
// resolves to a public npm registry name, makes ONE read-only GET request to
// registry.npmjs.org to check (a) does this name exist at all, and (b) if it
// does, was it published very recently with almost no versions -- the
// fingerprint of a name freshly squatted after being hallucinated by an AI
// coding assistant or guessed by a typosquatter. This is the only part of
// the tool that touches the network -- see index.html for the fully
// offline browser check, which trades the live answer for zero network
// calls of any kind.
//
//   node cli.mjs                    # scan ./package.json
//   node cli.mjs path/to/package.json
//   node cli.mjs --json
//   node cli.mjs --strict           # also exit 1 on a SUSPICIOUS_NEW finding

import fs from "node:fs/promises";
import { extractDependencies, classifyMetadata, registryUrl } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, strict: false, path: "package.json" };
  let sawPath = false;
  for (const a of argv) {
    if (a === "--json") args.json = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!sawPath && !a.startsWith("-")) {
      args.path = a;
      sawPath = true;
    }
  }
  return args;
}

/** Checks one dependency against the registry. Exported for direct testing. */
export async function checkOne(dep, { fetchImpl = fetch } = {}) {
  if (dep.skip) return { ...dep, status: "SKIPPED" };

  let res;
  try {
    res = await fetchImpl(registryUrl(dep.registryName));
  } catch (err) {
    return { ...dep, status: "ERROR", error: err.message };
  }

  if (res.status === 404) return { ...dep, status: "NOT_FOUND" };
  if (!res.ok) return { ...dep, status: "ERROR", error: `registry returned HTTP ${res.status}` };

  let meta;
  try {
    meta = await res.json();
  } catch (err) {
    return { ...dep, status: "ERROR", error: `could not parse registry response: ${err.message}` };
  }

  const { status, ageDays, versionCount } = classifyMetadata(meta);
  return { ...dep, status, ageDays, versionCount };
}

function renderHuman(results) {
  const notFound = results.filter((r) => r.status === "NOT_FOUND");
  const suspicious = results.filter((r) => r.status === "SUSPICIOUS_NEW");
  const errors = results.filter((r) => r.status === "ERROR");
  const skipped = results.filter((r) => r.status === "SKIPPED");

  const lines = [
    `Checked ${results.length - skipped.length} of ${results.length} dependenc${results.length === 1 ? "y" : "ies"} against the public npm registry` +
      (skipped.length ? ` (${skipped.length} skipped: not registry-backed).` : "."),
  ];

  if (notFound.length) {
    lines.push(
      "",
      "DOES NOT EXIST on the registry. If an AI assistant suggested this name, do not",
      "add a private mirror or wait for it to \"become available\" -- verify the",
      "correct package name independently before installing anything under it:",
    );
    for (const r of notFound) lines.push(`  ${r.name}  (${r.field}: "${r.specifier}")`);
  }

  if (suspicious.length) {
    lines.push(
      "",
      "Exists, but was published very recently with almost no version history --",
      "verify this is exactly the package you meant before trusting it in production:",
    );
    for (const r of suspicious) {
      lines.push(`  ${r.name}  created ${r.ageDays} day(s) ago, ${r.versionCount} version(s) published`);
    }
  }

  if (errors.length) {
    lines.push("", "Could not verify (network or parse error -- not a security finding):");
    for (const r of errors) lines.push(`  ${r.name}  ${r.error}`);
  }

  if (!notFound.length && !suspicious.length && !errors.length) {
    lines.push("", "Nothing flagged.");
  }

  return lines.join("\n");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), fetchImpl = fetch } = {}) {
  const args = parseArgs(argv);

  if (args.help) {
    return {
      exitCode: 0,
      output: [
        "Usage:",
        "  node cli.mjs [package.json] [--json] [--strict]",
        "",
        "Makes one read-only GET request per dependency to registry.npmjs.org --",
        "the only network call this tool makes. --strict also fails (exit 1) on",
        "a package that exists but looks freshly squatted (see README).",
      ].join("\n"),
    };
  }

  let text;
  try {
    text = await readFile(args.path);
  } catch (err) {
    return { exitCode: 2, output: `Error: ${err.message}` };
  }

  let deps;
  try {
    deps = extractDependencies(text);
  } catch (err) {
    return { exitCode: 2, output: `Error: ${err.message}` };
  }

  const results = [];
  for (const dep of deps) {
    // Sequential on purpose: this hits a shared public registry on the
    // reader's behalf, and a small CLI run has no reason to hammer it with
    // concurrent requests for a check that is not latency-sensitive.
    results.push(await checkOne(dep, { fetchImpl }));
  }

  const notFoundCount = results.filter((r) => r.status === "NOT_FOUND").length;
  const suspiciousCount = results.filter((r) => r.status === "SUSPICIOUS_NEW").length;
  const exitCode = notFoundCount > 0 || (args.strict && suspiciousCount > 0) ? 1 : 0;

  if (args.json) {
    return { exitCode, output: JSON.stringify(results, null, 2) };
  }
  return { exitCode, output: renderHuman(results) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
