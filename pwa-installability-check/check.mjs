#!/usr/bin/env node
// CLI: fetches a page, its Web App Manifest, and every icon the manifest
// lists, then reports whether it clears Chrome's installability criteria --
// the same checks Lighthouse's "installable-manifest" audit runs, with no
// Chrome/Puppeteer dependency. Your machine, your network -- no request goes
// through this portfolio or anywhere but the URL you pass (and whatever that
// page's own manifest/icons point at).
//
//   node check.mjs <url> [--json] [--timeout <ms>]
//
// This sends ordinary, unauthenticated GET requests -- nothing here bypasses
// authentication or reads protected data -- but treat it the same as you
// would curl or any other request tool aimed at someone else's server.
//
// Exit code 0 when the page is installable by these checks; 1 when at least
// one danger-severity finding is present or the probe could not complete
// (network error, timeout, bad URL).

import { runProbe } from './probe.mjs';
import { buildReport } from './analyze.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Target: ${report.target}`);
  if (report.manifestUrl) lines.push(`Manifest: ${report.manifestUrl} (${report.iconCount} icon(s) listed)`);
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('No installability issues found by these checks.');
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
    report.ok
      ? 'This page clears the checks this tool runs -- the same criteria Lighthouse\'s ' +
        '"installable-manifest" audit checks. See README.md for what it does not check.'
      : 'This is evidence from the checks above, not a full Lighthouse audit -- ' +
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
  return { report: buildReport(target, probe), probe };
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

  const { report, probe } = await runCheck(args.target, { timeoutMs: args.timeoutMs });

  if (args.json) {
    console.log(JSON.stringify({ target: report.target, probe }, null, 2));
  } else {
    console.log(formatText(report));
  }
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
