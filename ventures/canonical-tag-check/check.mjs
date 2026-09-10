#!/usr/bin/env node
// CLI: fetches a URL you name for real (following redirects), reads its
// canonical link tag(s), and -- when there is exactly one -- fetches that
// URL too, then reports which canonicalization misconfiguration patterns
// the evidence shows. Your machine, your network -- no request goes through
// this portfolio or anywhere but the URL(s) this check needs.
//
//   node check.mjs <url> [--json] [--timeout <ms>]
//
// This sends ordinary, unauthenticated GET requests -- nothing here bypasses
// authentication, reads protected data, or does anything a browser wouldn't
// also do by visiting the URL. Exit code 0 when the page fetched
// successfully and no danger-severity finding is present; 1 when a danger
// finding is present or the fetch failed to complete (network error,
// timeout, bad URL).

import { runProbe } from './probe.mjs';
import { buildReport } from './analyze.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Target: ${report.target}`);
  if (report.page && report.page.ok) {
    const hop = report.page.redirectCount ? ` (${report.page.redirectCount} redirect(s))` : '';
    lines.push(`Fetched: ${report.page.finalUrl}${hop} -> HTTP ${report.page.status}`);
  }
  lines.push('');

  if (report.incomplete) {
    lines.push(`Could not fetch the page: ${report.page?.error || 'unknown error'}. Re-run once the target is reachable.`);
    lines.push('');
  } else if (report.findings.length === 0) {
    lines.push('No canonical-tag issues found in this page.');
  } else {
    for (const f of report.findings) {
      const mark = f.severity === 'danger' ? '!!' : '--';
      lines.push(`${mark} [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push(`     evidence: ${f.evidence}`);
      lines.push('');
    }
  }

  lines.push(
    'This is evidence from the fetch(es) above, not a full SEO audit -- ' +
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
  const result = await probeFn(target, timeoutMs ? { timeoutMs } : {});
  return buildReport(result.target, result.page, result.canonicalTarget);
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
    console.log(JSON.stringify({ target: report.target, page: report.page, canonicalTarget: report.canonicalTarget }, null, 2));
  } else {
    console.log(formatText(report));
  }
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
