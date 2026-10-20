#!/usr/bin/env node
// CLI: fetches a sitemap.xml you name over real HTTP(S), reads every <loc>/
// <lastmod> pair, then reads (headers only, never the body) each <loc>'s live
// page to check whether its <lastmod> claim holds up -- invalid/malformed
// W3C-Datetime format, a future-dated <lastmod>, duplicate <loc> entries with
// conflicting <lastmod> values, a suspiciously uniform <lastmod> across
// nearly every URL (the "freshness-faking" anti-pattern), and a <lastmod>
// the live page's own Last-Modified response header doesn't confirm. Your
// machine, your network -- nothing goes through this portfolio.
//
//   node check.mjs <sitemap-url> [--json] [--timeout <ms>] [--max-urls <n>]
//                  [--uniform-threshold <0-1>] [--uniform-min-count <n>]
//
// Exit code 0 when every check that could run found nothing wrong; 1 when a
// danger-severity finding was produced, the sitemap itself could not be
// fetched, or a <loc>'s live headers could not be fetched (unverified is not
// the same as confirmed-clean -- see README.md).

import { buildReport } from './engine.mjs';
import { fetchBody, fetchHeaders } from './fetch-url.mjs';

const DEFAULT_MAX_URLS = 50;

function parseArgs(argv) {
  const args = {
    target: null,
    json: false,
    timeoutMs: undefined,
    maxUrls: DEFAULT_MAX_URLS,
    uniformThreshold: undefined,
    uniformMinCount: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[++i]);
    else if (argv[i] === '--max-urls') args.maxUrls = Number(argv[++i]);
    else if (argv[i] === '--uniform-threshold') args.uniformThreshold = Number(argv[++i]);
    else if (argv[i] === '--uniform-min-count') args.uniformMinCount = Number(argv[++i]);
    else if (!args.target && !argv[i].startsWith('--')) args.target = argv[i];
  }
  return args;
}

/** Pure orchestration: given injectable fetch functions, fetch and classify.
 * Kept separate from main() so tests can supply fakes instead of hitting the
 * network. */
export async function runCheck(target, {
  fetchBodyFn = fetchBody,
  fetchHeadersFn = fetchHeaders,
  timeoutMs,
  maxUrls = DEFAULT_MAX_URLS,
  uniformThreshold,
  uniformMinCount,
} = {}) {
  const opts = timeoutMs ? { timeoutMs } : {};
  const sitemapFetch = await fetchBodyFn(target, opts);
  if (!sitemapFetch.ok) {
    return {
      target,
      fetchError: sitemapFetch.error,
      urlsChecked: 0,
      urlsTruncated: false,
      report: { kind: null, entries: [], findings: [], dangerCount: 0, noticeCount: 0, uncheckedCount: 0, incomplete: true, ok: false, parseError: null },
    };
  }

  // First pass: parse without live results, purely to know which <loc>s to
  // fetch headers for (only entries with an actual <lastmod> claim benefit
  // from a live check -- an entry with none has no claim to confirm).
  const firstPass = buildReport({ xml: sitemapFetch.body, uniformThreshold, uniformMinCount });
  if (firstPass.parseError) {
    return { target, fetchError: null, urlsChecked: 0, urlsTruncated: false, report: firstPass };
  }

  const locsWithClaim = [...new Set(
    firstPass.entries.filter((e) => e.validation.valid).map((e) => e.loc),
  )];
  const toFetch = locsWithClaim.slice(0, maxUrls);
  const truncated = locsWithClaim.length > toFetch.length;

  const liveResults = new Map();
  await Promise.all(
    toFetch.map(async (loc) => {
      const result = await fetchHeadersFn(loc, opts);
      liveResults.set(loc, result);
    }),
  );

  const report = buildReport({ xml: sitemapFetch.body, uniformThreshold, uniformMinCount, liveResults });
  return { target, fetchError: null, urlsChecked: toFetch.length, urlsTruncated: truncated, report };
}

function formatText({ target, fetchError, urlsChecked, urlsTruncated, report }) {
  const lines = [];
  lines.push(`Sitemap: ${target}`);
  lines.push('');

  if (fetchError) {
    lines.push(`Could not fetch the sitemap: ${fetchError}`);
    lines.push('');
    lines.push('Nothing else could be checked.');
    return lines.join('\n');
  }

  if (report.parseError) {
    lines.push(`Could not parse this as a sitemap: ${report.parseError}`);
    return lines.join('\n');
  }

  lines.push(`Kind: ${report.kind}`);
  lines.push(`Entries: ${report.entries.length}`);
  lines.push(`Live headers fetched for: ${urlsChecked} URL(s) with a valid <lastmod> claim${urlsTruncated ? ' (truncated by --max-urls)' : ''}`);
  lines.push('');

  if (report.findings.length === 0) {
    lines.push(report.incomplete
      ? 'No misconfiguration found in what could be checked, but the run is not complete -- see above.'
      : 'None of the checked freshness issues were found.');
  } else {
    for (const f of report.findings) {
      const mark = f.severity === 'danger' ? '!!' : '--';
      lines.push(`${mark} [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push('');
    }
  }

  lines.push(
    'This is evidence from the sitemap and pages fetched above, not a full technical-SEO audit -- ' +
      'see README.md for what this tool does and does not check.',
  );
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error('Usage: node check.mjs <sitemap-url> [--json] [--timeout <ms>] [--max-urls <n>] [--uniform-threshold <0-1>] [--uniform-min-count <n>]');
    process.exit(2);
  }
  try {
    // eslint-disable-next-line no-new
    new URL(args.target);
  } catch {
    console.error(`Not a valid URL: ${args.target}`);
    process.exit(2);
  }

  const result = await runCheck(args.target, {
    timeoutMs: args.timeoutMs,
    maxUrls: args.maxUrls,
    uniformThreshold: args.uniformThreshold,
    uniformMinCount: args.uniformMinCount,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatText(result));
  }

  const failed = Boolean(result.fetchError) || Boolean(result.report.parseError) || !result.report.ok;
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
