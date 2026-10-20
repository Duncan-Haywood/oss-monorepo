#!/usr/bin/env node
// Zero-dependency CLI: scans a repository's .github/workflows for
// third-party references pinned to a commit SHA, then fetches each one's
// own definition (over real, unauthenticated HTTPS to raw.githubusercontent.com
// — public repository content only, no token, no login) to check whether
// IT loads something unpinned underneath. See README.md for what this
// answers and does not answer.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { analyzeWorkflows } from "./analyze.mjs";

function usage() {
  return `Usage: node check.mjs [dir] [--format text|json] [--fail-on-risk] [--max-fetches N] [--no-network]

  dir              Repository checkout to scan (default: .)
  --format         text (default) or json
  --fail-on-risk   Exit 2 if any pinned reference loads an unpinned one
  --max-fetches    Cap on network requests per run (default: 30)
  --no-network     Classify top-level references only; skip the transitive
                    fetch entirely (offline, like the sibling pinned-actions-check)
`;
}

function parseArgs(argv) {
  const opts = { dir: ".", format: "text", failOnRisk: false, maxFetches: undefined, network: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--format") opts.format = argv[++i];
    else if (a === "--fail-on-risk") opts.failOnRisk = true;
    else if (a === "--max-fetches") opts.maxFetches = Number(argv[++i]);
    else if (a === "--no-network") opts.network = false;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (!a.startsWith("-")) opts.dir = a;
  }
  return opts;
}

function findWorkflowFiles(root) {
  const dir = join(root, ".github", "workflows");
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => /\.ya?ml$/.test(name))
    .filter((name) => statSync(join(dir, name)).isFile())
    .map((name) => join(dir, name));
}

async function fetchRaw({ owner, repo, ref, path }) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.text();
}

function printText(result, root) {
  for (const report of result.reports) {
    console.log(`\n${relative(root, report.file) || report.file}`);
    if (!report.findings.length) {
      console.log("  no third-party `uses:` references found");
      continue;
    }
    for (const f of report.findings) {
      console.log(`  L${f.line}  ${f.classification.padEnd(8)} ${f.action}@${f.ref ?? "(none)"}`);
    }
    for (const entry of report.nested) {
      const label = `${entry.parent.action}@${entry.parent.ref}`;
      if (entry.status === "unresolved") {
        console.log(`    -> ${label}: could not fetch ${entry.path} (not found, or not a composite action) — unconfirmed`);
      } else if (entry.status === "skipped-limit") {
        console.log(`    -> ${label}: skipped (--max-fetches reached)`);
      } else if (entry.transitivelyUnpinned.length) {
        for (const child of entry.transitivelyUnpinned) {
          console.log(`    -> ${label} loads ${child.action}@${child.ref} UNPINNED at ${entry.path}:${child.line}`);
        }
      } else {
        console.log(`    -> ${label}: ${entry.path} checked, nothing unpinned underneath`);
      }
    }
  }
  console.log(`\n${result.transitiveRiskCount} transitively-unpinned reference(s), ${result.unresolvedCount} unresolved (unconfirmed).`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return 0;
  }

  const files = findWorkflowFiles(opts.dir).map((path) => ({
    name: path,
    text: readFileSync(path, "utf8"),
  }));

  if (!files.length) {
    console.error(`No .github/workflows/*.yml found under ${opts.dir}`);
    return 1;
  }

  const analyzeOpts = { fetchRef: opts.network ? fetchRaw : null };
  if (opts.maxFetches !== undefined) analyzeOpts.maxFetches = opts.maxFetches;

  const result = await analyzeWorkflows(files, analyzeOpts);

  if (opts.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printText(result, opts.dir);
  }

  if (opts.failOnRisk && result.transitiveRiskCount > 0) return 2;
  return 0;
}

main().then((code) => process.exit(code));
