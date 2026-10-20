#!/usr/bin/env node
// CLI: sends one real GET request to a URL you name and reports which
// cookie-security misconfiguration patterns the response's Set-Cookie
// headers show. Your machine, your network -- no request goes through this
// portfolio or anywhere but the URL you pass.
//
//   node check.mjs <url> [--json] [--timeout <ms>]
//
// Only point this at a system you own or are authorised to test. This
// sends one ordinary, unauthenticated GET request -- nothing here bypasses
// authentication, reads protected data, or does anything a browser
// wouldn't also do by visiting the URL -- but treat it the same as you
// would curl or any other request tool aimed at someone else's server.
//
// Exit code 0 when the probe completed and no "danger"-severity finding is
// present; 1 when a danger finding is present or the probe failed to
// complete (network error, timeout, bad URL).

import { runProbe } from './probe.mjs';
import { buildReport } from './analyze.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Target: ${report.target}`);
  if (!report.probe.ok) {
    lines.push(`Request failed: ${report.probe.error}`);
    lines.push('');
    lines.push('The probe did not complete -- re-run once the target is reachable.');
    return lines.join('\n');
  }
  lines.push(`Status: ${report.probe.status}  (${report.probe.protocol ?? 'unknown scheme'})`);
  lines.push('');

  if (report.probe.setCookie.length === 0) {
    lines.push('No Set-Cookie header on this response -- nothing to check.');
  } else {
    lines.push(`${report.probe.setCookie.length} cookie(s) set on this response:`);
    for (const raw of report.probe.setCookie) lines.push(`  ${raw}`);
  }
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('None of the patterns this tool checks for were found.');
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
    'This is evidence from this one response, not a full security assessment -- ' +
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
export async function runCheck(target, { probeFn = runProbe, timeoutMs } = {}) {
  const probe = await probeFn(target, timeoutMs ? { timeoutMs } : {});
  return buildReport(target, probe);
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
    console.log(JSON.stringify({ target: report.target, probe: report.probe }, null, 2));
  } else {
    console.log(formatText(report));
  }
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
