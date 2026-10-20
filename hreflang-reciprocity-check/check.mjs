#!/usr/bin/env node
// CLI: fetches a page you name over real HTTP(S), reads its
// <link rel="alternate" hreflang href> tags, then fetches each
// alternate page those tags name and checks whether it links back -- plus
// invalid/malformed language-region codes, a missing x-default fallback, a
// missing self-reference, and duplicate/conflicting hreflang values. Your
// machine, your network -- nothing goes through this portfolio.
//
//   node check.mjs <url> [--json] [--timeout <ms>] [--max-alternates <n>]
//
// Exit code 0 when every check that could run found nothing wrong; 1 when a
// danger-severity finding was produced, the target itself could not be
// fetched, or an alternate page could not be fetched (reciprocity for that
// page is then unverified, not confirmed clean -- see README.md).

import { extractHreflangLinks, buildReport } from './engine.mjs';
import { fetchPage } from './fetch-page.mjs';

const DEFAULT_MAX_ALTERNATES = 50;

function parseArgs(argv) {
  const args = { target: null, json: false, timeoutMs: undefined, maxAlternates: DEFAULT_MAX_ALTERNATES };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[++i]);
    else if (argv[i] === '--max-alternates') args.maxAlternates = Number(argv[++i]);
    else if (!args.target && !argv[i].startsWith('--')) args.target = argv[i];
  }
  return args;
}

/** Pure orchestration: given injectable fetch functions, fetch and classify.
 * Kept separate from main() so tests can supply a fake instead of hitting
 * the network. */
export async function runCheck(target, { fetchFn = fetchPage, timeoutMs, maxAlternates = DEFAULT_MAX_ALTERNATES } = {}) {
  const opts = timeoutMs ? { timeoutMs } : {};
  const targetFetch = await fetchFn(target, opts);
  if (!targetFetch.ok) {
    // Nothing was checked, so this is not a clean "ok" report -- it is an
    // incomplete one, the same distinction buildReport draws for an
    // alternate that could not be fetched.
    const report = buildReport({ url: target, html: '', alternates: [] });
    report.incomplete = true;
    report.ok = false;
    return { target, fetchError: targetFetch.error, report };
  }

  const ownLinks = extractHreflangLinks(targetFetch.html);
  const seen = new Set();
  const toFetch = [];
  for (const link of ownLinks) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    toFetch.push(link.href);
  }
  const capped = toFetch.slice(0, maxAlternates);
  const truncated = toFetch.length > capped.length;

  const alternates = await Promise.all(
    capped.map(async (href) => {
      const result = await fetchFn(href, opts);
      return { href, html: result.ok ? result.html : null, fetchError: result.ok ? null : result.error };
    }),
  );

  const report = buildReport({ url: target, html: targetFetch.html, alternates });
  return { target, fetchError: null, alternatesTruncated: truncated, report };
}

function formatText({ target, fetchError, alternatesTruncated, report }) {
  const lines = [];
  lines.push(`Target: ${target}`);
  lines.push('');

  if (fetchError) {
    lines.push(`Could not fetch the target page: ${fetchError}`);
    lines.push('');
    lines.push('No hreflang tags could be read, so nothing else was checked.');
    return lines.join('\n');
  }

  if (report.links.length === 0) {
    lines.push('No <link rel="alternate" hreflang href> tags found on this page.');
    return lines.join('\n');
  }

  lines.push(`Found ${report.links.length} hreflang link(s):`);
  for (const link of report.links) {
    lines.push(`  ${link.hreflang.padEnd(12)} -> ${link.href}${link.valid ? '' : '  (invalid)'}`);
  }
  lines.push('');

  if (report.reciprocity.length > 0) {
    lines.push('Reciprocity:');
    for (const r of report.reciprocity) {
      const mark = r.status === 'confirmed' ? 'OK' : r.status === 'missing' ? 'FAIL' : '?';
      const note = r.status === 'unchecked'
        ? (r.reason === 'no-content' ? ' (could not fetch that page)' : ' (no target URL to check against)')
        : '';
      lines.push(`  [${mark}] ${r.href}${note}`);
    }
    lines.push('');
  }

  if (report.findings.length === 0) {
    lines.push(report.incomplete
      ? 'No misconfiguration found in what could be checked, but the run is not complete -- see above.'
      : 'None of the checked hreflang misconfigurations were found.');
  } else {
    for (const f of report.findings) {
      const mark = f.severity === 'danger' ? '!!' : '--';
      lines.push(`${mark} [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push('');
    }
  }

  if (alternatesTruncated) {
    lines.push(`Note: more alternate hrefs were found than --max-alternates allows; only the first ones were fetched.`);
    lines.push('');
  }

  lines.push(
    'This is evidence from the pages fetched above, not a full SEO audit -- ' +
      'see README.md for what this tool does and does not check.',
  );
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error('Usage: node check.mjs <url> [--json] [--timeout <ms>] [--max-alternates <n>]');
    process.exit(2);
  }
  try {
    // eslint-disable-next-line no-new
    new URL(args.target);
  } catch {
    console.error(`Not a valid URL: ${args.target}`);
    process.exit(2);
  }

  const result = await runCheck(args.target, { timeoutMs: args.timeoutMs, maxAlternates: args.maxAlternates });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatText(result));
  }

  const failed = Boolean(result.fetchError) || !result.report.ok;
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
