#!/usr/bin/env node
// CLI: fetches a page's HTML (or an explicit list of script URLs you name),
// finds every script's own sourceMappingURL comment, and reports which
// scripts' production source maps are publicly readable -- and whether they
// embed full original source text (`sourcesContent`) or only file paths.
// Your machine, real requests -- no request goes through this portfolio.
//
//   node check.mjs <page-url> [--json] [--timeout <ms>]
//   node check.mjs --script <js-url> [--script <js-url> ...] [--json]
//
// Only run this against a site you own or are authorised to test -- treat it
// the same as you would `curl` aimed at someone else's server. This never
// sends anything but GET requests and never writes/modifies anything on the
// target.
//
// Exit code 0 when no script's source map was found to be publicly exposed;
// 1 when at least one is exposed, or the page/some scripts could not be
// checked at all.

import { checkPage } from './probe.mjs';
import { buildReport } from './analyze.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Page: ${report.pageUrl ?? '(explicit script list)'}`);
  lines.push(`Scripts checked: ${report.scriptsChecked}${report.truncated ? ' (list truncated at the cap)' : ''}`);
  lines.push('');

  if (report.pageError) {
    lines.push(`Could not read the page: ${report.pageError}`);
    lines.push('Check the URL, or pass explicit script URLs with --script instead.');
    return lines.join('\n');
  }

  if (report.findings.length === 0) {
    lines.push('No script\'s source map was found to be publicly readable.');
  } else {
    for (const f of report.findings) {
      lines.push(`!! [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push(`     map: ${f.mapUrl}`);
      lines.push(`     evidence: ${f.evidenceStatus}`);
      lines.push('');
    }
  }

  if (report.blocked.length > 0) {
    lines.push('');
    lines.push(
      `${report.blocked.length} script(s) reference a map that is not actually served (401/403/404) -- ` +
        `a healthy outcome: ${report.blocked.map((c) => shortName(c.scriptUrl)).join(', ')}`,
    );
  }
  if (report.errors.length > 0) {
    lines.push('');
    lines.push(
      `${report.errors.length} script(s) could not be checked: ` +
        report.errors.map((c) => `${shortName(c.scriptUrl)} (${c.error})`).join('; '),
    );
  }

  lines.push('');
  lines.push(
    'This is evidence from the requests above, not a full security audit -- see README.md for ' +
      'what this tool does and does not check.',
  );
  return lines.join('\n');
}

function shortName(url) {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : url;
  } catch {
    return url;
  }
}

function parseArgs(argv) {
  const scriptUrls = [];
  let pageUrl = null;
  let json = false;
  let timeoutMs;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--timeout') timeoutMs = Number(argv[++i]);
    else if (argv[i] === '--script') scriptUrls.push(argv[++i]);
    else if (!argv[i].startsWith('--') && pageUrl === null) pageUrl = argv[i];
  }
  return { pageUrl, scriptUrls, json, timeoutMs };
}

/** Pure orchestration: given a checkPage function (real network, or a stub in
 * tests), fetch and classify. Kept separate from main() so tests can inject
 * a fake `checkPageFn` instead of hitting the network. */
export async function runCheck(pageUrl, { scriptUrls, checkPageFn = checkPage, timeoutMs } = {}) {
  const { scripts, pageError, truncated } = await checkPageFn(pageUrl, {
    scriptUrls: scriptUrls?.length ? scriptUrls : undefined,
    ...(timeoutMs ? { timeoutMs } : {}),
  });
  return buildReport(pageUrl, scripts, { pageError, truncated });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.pageUrl && args.scriptUrls.length === 0) {
    console.error('Usage: node check.mjs <page-url> [--json] [--timeout <ms>]');
    console.error('       node check.mjs --script <js-url> [--script <js-url> ...] [--json]');
    console.error('Only run this against a site you own or are authorised to test.');
    process.exit(2);
  }
  if (args.pageUrl) {
    try {
      // eslint-disable-next-line no-new
      new URL(args.pageUrl);
    } catch {
      console.error(`Not a valid URL: ${args.pageUrl}`);
      process.exit(2);
    }
  }

  const report = await runCheck(args.pageUrl, { scriptUrls: args.scriptUrls, timeoutMs: args.timeoutMs });

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
