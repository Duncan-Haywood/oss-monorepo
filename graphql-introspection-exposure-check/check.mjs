#!/usr/bin/env node
// CLI: sends one real introspection-query POST to a GraphQL endpoint URL you
// name and reports whether introspection is enabled, and what it reveals.
// Your machine, your network -- no request goes through this portfolio or
// anywhere but the URL you pass.
//
//   node check.mjs <graphql-endpoint-url> [--json] [--timeout <ms>] [--header "Name: Value"]...
//
// This sends one ordinary, read-only POST -- GraphQL's introspection
// meta-fields cannot mutate anything -- and does nothing a GraphQL client
// wouldn't also do by querying the endpoint directly. Only point it at a
// system you own or are authorised to test, the same rule that applies to
// any request tool aimed at someone else's server.
//
// Exit code 0 when the probe completed and produced no danger-severity
// finding; 1 when a danger finding is present or the probe failed to
// complete (network error, timeout, bad URL, unrecognisable response).

import { sendIntrospectionQuery } from './probe.mjs';
import { buildReport } from './analyze.mjs';

function parseArgs(argv) {
  const args = { target: null, json: false, timeoutMs: undefined, headers: {} };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[++i]);
    else if (argv[i] === '--header') {
      const raw = argv[++i] ?? '';
      const idx = raw.indexOf(':');
      if (idx > 0) args.headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
    } else if (!args.target && !argv[i].startsWith('--')) args.target = argv[i];
  }
  return args;
}

/** Pure orchestration: given a probe function (real network, or a stub in
 * tests), fetch and classify. Kept separate from main() so tests can inject
 * a fake `probeFn` instead of hitting the network. Returns both the raw
 * `probe` and the derived `report` -- `--json` prints the raw probe (so the
 * browser page re-derives findings through the one classification function
 * it also imports, rather than trusting a second, possibly stale copy),
 * while text mode and the exit code use the report. */
export async function runCheck(target, { probeFn = sendIntrospectionQuery, timeoutMs, headers } = {}) {
  const probe = await probeFn(target, { timeoutMs, headers });
  const report = buildReport(target, probe);
  return { probe, report };
}

function formatText(report) {
  const lines = [];
  lines.push(`Target: ${report.target}`);
  lines.push('');

  if (report.incomplete) {
    lines.push(`Probe did not complete: ${report.error}. Re-run once the target is reachable.`);
  } else if (!report.introspectionEnabled) {
    lines.push('Introspection appears disabled or blocked -- the endpoint did not return a schema.');
    if (report.error) lines.push(`  server said: ${report.error}`);
  } else {
    lines.push(
      `Introspection is ENABLED: ${report.queryFieldCount} query field(s), ` +
        `${report.mutationFieldCount} mutation field(s), ${report.subscriptionFieldCount} subscription field(s), ` +
        `${report.customTypeCount} named type(s).`,
    );
    lines.push('');
    for (const f of report.findings) {
      const mark = f.severity === 'danger' ? '!!' : '--';
      lines.push(`${mark} [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push('');
    }
  }

  lines.push(
    'This is evidence from one response, not a full security assessment -- ' +
      'see README.md for what this tool does and does not check.',
  );
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error('Usage: node check.mjs <graphql-endpoint-url> [--json] [--timeout <ms>] [--header "Name: Value"]');
    process.exit(2);
  }
  try {
    // eslint-disable-next-line no-new
    new URL(args.target);
  } catch {
    console.error(`Not a valid URL: ${args.target}`);
    process.exit(2);
  }

  const { probe, report } = await runCheck(args.target, { timeoutMs: args.timeoutMs, headers: args.headers });

  if (args.json) {
    console.log(JSON.stringify({ target: args.target, probe }, null, 2));
  } else {
    console.log(formatText(report));
  }
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
