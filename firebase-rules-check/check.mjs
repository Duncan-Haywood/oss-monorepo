#!/usr/bin/env node
// CLI: sends real, read-only, unauthenticated requests to a Firebase
// project's Realtime Database (shallow key listing) and/or named Firestore
// collections (one document max per collection), and reports which paths
// return real data to that request -- the "default-open" / left-in-test-mode
// security-rules exposure. Your machine, the project's own REST endpoints --
// no request goes through this portfolio.
//
//   node check.mjs <project-id> [--database-url <url>] [--collection <name>]...
//                   [--api-key <key>] [--json] [--timeout <ms>]
//
// Only run this against a Firebase project you own or are authorised to
// test. This never writes, updates, or deletes anything -- every request is
// GET, and the Realtime Database probe uses `shallow=true`, which returns
// child key names only, never field values.
//
// Exit code 0 when at least one path/collection was checked and none
// returned real data to the unauthenticated request; 1 when at least one is
// exposed or nothing could be checked at all.

import { runProbes } from './probe.mjs';
import { buildReport } from './analyze.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Project: ${report.projectId}`);
  if (report.databaseUrl) lines.push(`Realtime Database: ${report.databaseUrl}`);
  lines.push(`Paths/collections checked: ${report.checked}${report.truncated ? ' (list truncated at the cap)' : ''}`);
  lines.push('');

  if (report.checked === 0) {
    lines.push('Nothing to check -- pass --database-url and/or one or more --collection names.');
    return lines.join('\n');
  }

  if (report.findings.length === 0) {
    lines.push('No path or collection returned real data to an unauthenticated request.');
  } else {
    for (const f of report.findings) {
      lines.push(`!! [DANGER] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push(`     evidence: ${f.evidenceStatus}`);
      lines.push('');
    }
  }

  if (report.unconfirmed.length > 0) {
    lines.push('');
    lines.push(
      `${report.unconfirmed.length} path/collection returned zero rows with no way to tell "rules are blocking this" ` +
        'from "this is just empty": ' +
        report.unconfirmed.map((c) => (c.source === 'realtime-database' ? c.path : c.collection)).join(', ') +
        '. Insert one throwaway test value (or check the Firebase console Rules Playground) to resolve which.',
    );
  }
  if (report.errors.length > 0) {
    lines.push('');
    lines.push(`${report.errors.length} path/collection could not be checked: ${report.errors.map((c) => `${c.source === 'realtime-database' ? c.path : c.collection} (${c.error})`).join('; ')}`);
  }
  if (report.blocked.length > 0) {
    lines.push('');
    lines.push(`${report.blocked.length} path/collection correctly rejected this unauthenticated request: ${report.blocked.map((c) => (c.source === 'realtime-database' ? c.path : c.collection)).join(', ')}`);
  }

  lines.push('');
  lines.push('This is evidence from the requests above, not a full security audit -- see README.md for what this tool does and does not check.');
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { projectId: null, databaseUrl: null, collections: [], apiKey: null, json: false, timeoutMs: undefined };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--timeout') args.timeoutMs = Number(argv[++i]);
    else if (a === '--database-url') args.databaseUrl = argv[++i];
    else if (a === '--collection') args.collections.push(argv[++i]);
    else if (a === '--api-key') args.apiKey = argv[++i];
    else if (!a.startsWith('--')) positional.push(a);
  }
  args.projectId = positional[0] ?? null;
  return args;
}

/** Pure orchestration: given a probe function (real network, or a stub in
 * tests), fetch and classify. Kept separate from main() so tests can inject
 * a fake `probeFn` instead of hitting the network. */
export async function runCheck(projectId, opts = {}) {
  const { probeFn = runProbes, timeoutMs, ...probeOpts } = opts;
  const probeResult = await probeFn(projectId, { ...probeOpts, ...(timeoutMs ? { timeoutMs } : {}) });
  return buildReport(probeResult);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.projectId) {
    console.error('Usage: node check.mjs <project-id> [--database-url <url>] [--collection <name>]... [--api-key <key>] [--json] [--timeout <ms>]');
    console.error('Only run this against a Firebase project you own or are authorised to test.');
    process.exit(2);
  }
  if (!args.databaseUrl && args.collections.length === 0) {
    console.error('Nothing to check -- pass --database-url and/or one or more --collection names.');
    process.exit(2);
  }

  const report = await runCheck(args.projectId, {
    databaseUrl: args.databaseUrl,
    collections: args.collections,
    apiKey: args.apiKey ?? undefined,
    timeoutMs: args.timeoutMs,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatText(report));
  }
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
