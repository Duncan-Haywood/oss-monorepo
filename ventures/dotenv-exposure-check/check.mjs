#!/usr/bin/env node
// CLI: sends one GET request per well-known dotenv filename (.env,
// .env.local, .env.production, .env.production.local,
// .env.development.local) at a site's root and reports which ones are
// publicly readable -- verified against the real KEY=VALUE line shape of a
// dotenv file, not just an HTTP status, and reporting key NAMES only, never
// values. Your machine, real requests -- no request goes through this
// portfolio.
//
//   node check.mjs <site-url> [--json] [--timeout <ms>]
//
// Only run this against a site you own or are authorised to test -- treat it
// the same as you would `curl` aimed at someone else's server. This never
// sends anything but GET requests and never writes/modifies anything on the
// target.
//
// Exit code 0 when none of the checked paths is exposed; 1 when at least one
// is, or a request could not be completed at all.

import { checkSite } from './probe.mjs';
import { buildReport } from './analyze.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Site: ${report.baseUrl}`);
  lines.push(`Paths checked: ${report.pathsChecked}`);
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('No exposed dotenv file found among the ones this tool checks.');
  } else {
    for (const f of report.findings) {
      lines.push(`!! [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push(`     url: ${f.url}`);
      lines.push(`     keys (names only, never values): ${f.sampleKeys.join(', ')}${f.keyCount > f.sampleKeys.length ? ', …' : ''}`);
      lines.push('');
    }
  }

  if (report.blocked.length > 0) {
    lines.push(`${report.blocked.length} path(s) cleanly blocked (401/403/404) -- a healthy outcome: ${report.blocked.map((c) => c.path).join(', ')}`);
  }
  if (report.notEnv.length > 0) {
    lines.push(`${report.notEnv.length} path(s) returned 200 but did not look like a dotenv file (likely a soft-404 page): ${report.notEnv.map((c) => c.path).join(', ')}`);
  }
  if (report.errors.length > 0) {
    lines.push(`${report.errors.length} path(s) could not be checked: ${report.errors.map((c) => `${c.path} (${c.error})`).join('; ')}`);
  }

  lines.push('');
  lines.push(
    'This is evidence from the requests above, not a full security audit -- see README.md for ' +
      'what this tool does and does not check.',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  let siteUrl = null;
  let json = false;
  let timeoutMs;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--timeout') timeoutMs = Number(argv[++i]);
    else if (!argv[i].startsWith('--') && siteUrl === null) siteUrl = argv[i];
  }
  return { siteUrl, json, timeoutMs };
}

/** Pure orchestration: given a checkSite function (real network, or a stub in
 * tests), fetch and classify. Kept separate from main() so tests can inject
 * a fake `checkSiteFn` instead of hitting the network. */
export async function runCheck(siteUrl, { checkSiteFn = checkSite, timeoutMs } = {}) {
  const { results } = await checkSiteFn(siteUrl, timeoutMs ? { timeoutMs } : undefined);
  return buildReport(siteUrl, results);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.siteUrl) {
    console.error('Usage: node check.mjs <site-url> [--json] [--timeout <ms>]');
    console.error('Only run this against a site you own or are authorised to test.');
    process.exit(2);
  }
  try {
    // eslint-disable-next-line no-new
    new URL(args.siteUrl);
  } catch {
    console.error(`Not a valid URL: ${args.siteUrl}`);
    process.exit(2);
  }

  const report = await runCheck(args.siteUrl, { timeoutMs: args.timeoutMs });

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
