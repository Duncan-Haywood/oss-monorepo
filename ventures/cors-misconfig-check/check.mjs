#!/usr/bin/env node
// CLI: sends five real GET requests to a URL you name, each with a
// different Origin header, and reports which CORS misconfiguration
// patterns the response headers show. Your machine, your network -- no
// request goes through this portfolio or anywhere but the URL you pass.
//
//   node check.mjs <url> [--json] [--timeout <ms>]
//
// Only point this at a system you own or are authorised to test. This
// sends ordinary, unauthenticated GET requests -- nothing here bypasses
// authentication, reads protected data, or does anything a browser
// wouldn't also do by visiting the URL -- but treat it the same as you
// would curl or any other request tool aimed at someone else's server.
//
// Exit code 0 when every probe completed and none is a "danger"-severity
// finding; 1 when at least one danger finding is present or a probe
// failed to complete (network error, timeout, bad URL).

import { runProbes } from './probe.mjs';
import { buildReport } from './analyze.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Target: ${report.target}`);
  lines.push('');

  for (const probe of report.probes) {
    const origin = probe.requestOrigin ?? '(no Origin header sent)';
    if (!probe.ok) {
      lines.push(`  [${probe.label}] Origin: ${origin} -- request failed: ${probe.error}`);
      continue;
    }
    const acao = probe.headers['access-control-allow-origin'] ?? '(not set)';
    const acac = probe.headers['access-control-allow-credentials'] ?? '(not set)';
    lines.push(`  [${probe.label}] Origin: ${origin}  ->  status ${probe.status}, ACAO: ${acao}, ACAC: ${acac}`);
  }
  lines.push('');

  if (report.incomplete) {
    lines.push(`${report.failedProbes.length} probe(s) did not complete: ${report.failedProbes.join(', ')}. Re-run once the target is reachable.`);
    lines.push('');
  }

  if (report.findings.length === 0) {
    lines.push(report.incomplete
      ? 'No misconfiguration found in the probes that did complete, but the run is not complete -- see above.'
      : 'None of the four dangerous CORS patterns this tool checks for were found.');
  } else {
    for (const f of report.findings) {
      const mark = f.severity === 'danger' ? '!!' : '--';
      lines.push(`${mark} [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push(`     evidence: ${f.evidenceHeader}`);
      lines.push('');
    }
  }

  lines.push(
    'This is evidence from the responses above, not a full security assessment -- ' +
      'see README.md for what this tool does and does not check.',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { target: null, json: false, timeoutMs: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[++i]);
    else if (!args.target && !argv[i].startsWith('--')) args.target = argv[i];
  }
  return args;
}

/** Pure orchestration: given a probe function (real network, or a stub in
 * tests), fetch and classify. Kept separate from main() so tests can inject
 * a fake `probeFn` instead of hitting the network. */
export async function runCheck(target, { probeFn = runProbes, timeoutMs } = {}) {
  const probes = await probeFn(target, timeoutMs ? { timeoutMs } : {});
  return buildReport(target, probes);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error('Usage: node check.mjs <url> [--json] [--timeout <ms>]');
    process.exit(2);
  }
  try {
    // eslint-disable-next-line no-new
    new URL(args.target);
  } catch {
    console.error(`Not a valid URL: ${args.target}`);
    process.exit(2);
  }

  const report = await runCheck(args.target, { timeoutMs: args.timeoutMs });

  if (args.json) {
    console.log(JSON.stringify({ target: report.target, probes: report.probes }, null, 2));
  } else {
    console.log(formatText(report));
  }
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
