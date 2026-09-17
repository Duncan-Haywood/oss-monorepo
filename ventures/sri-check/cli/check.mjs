#!/usr/bin/env node
// CLI: fetches a page you name, finds every script/stylesheet tag it loads
// from a different origin, and reports which ones are missing a
// Subresource Integrity (SRI) hash, missing the crossorigin attribute SRI
// needs to actually be enforced, or declare a hash that no longer matches
// what the CDN currently serves.
//
//   node cli/check.mjs <page-url> [--json] [--timeout <ms>] [--no-fetch-assets]
//
// Sends one GET for the page and one GET per cross-origin asset that
// declares an integrity hash -- your machine, your network, nothing goes
// through this portfolio. --no-fetch-assets skips the second round of
// requests (useful for a very large page) and reports only what the tags
// themselves say, with no hash-mismatch check.
//
// Exit code 0 when the page was reachable and no danger-severity finding
// was produced; 1 when a danger finding is present or the page could not be
// fetched at all.

import { extractCrossOriginAssets, buildReport } from '../sri.mjs';
import { fetchText, fetchAllAssets } from './probe.mjs';

function parseArgs(argv) {
  const args = { page: null, json: false, timeoutMs: undefined, fetchAssets: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[++i]);
    else if (argv[i] === '--no-fetch-assets') args.fetchAssets = false;
    else if (!args.page && !argv[i].startsWith('--')) args.page = argv[i];
  }
  return args;
}

/** Pure orchestration: given injectable fetch functions (real network, or
 * stubs in tests), fetch the page, extract assets, optionally re-fetch each
 * asset with a hash, and classify. Kept separate from main() so tests never
 * touch the network. */
export async function runCheck(
  pageUrl,
  { fetchTextFn = fetchText, fetchAllAssetsFn = fetchAllAssets, timeoutMs, fetchAssets = true } = {},
) {
  const opts = timeoutMs ? { timeoutMs } : {};
  const page = await fetchTextFn(pageUrl, opts);
  if (!page.ok) {
    return {
      page: pageUrl,
      assets: [],
      findings: [],
      dangerCount: 0,
      noticeCount: 0,
      thirdPartyCount: 0,
      ok: false,
      fetchError: page.error,
    };
  }
  const assets = extractCrossOriginAssets(page.text, pageUrl);
  const fetchResults = fetchAssets ? await fetchAllAssetsFn(assets, opts) : new Map();
  return buildReport(pageUrl, assets, fetchResults);
}

function formatText(report) {
  const lines = [];
  lines.push(`Page: ${report.page}`);
  if (report.fetchError) {
    lines.push('', `Could not fetch the page: ${report.fetchError}`);
    return lines.join('\n');
  }
  lines.push(`${report.thirdPartyCount} third-party script/stylesheet tag(s) found.`, '');

  if (report.findings.length === 0) {
    lines.push(
      report.thirdPartyCount === 0
        ? 'No cross-origin script or stylesheet tags on this page -- nothing for SRI to protect here.'
        : 'Every cross-origin tag carries a valid integrity hash that matches what is served right now.',
    );
  } else {
    for (const f of report.findings) {
      const mark = f.severity === 'danger' ? '!!' : '--';
      lines.push(`${mark} [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.url}`);
      lines.push(`     ${f.detail}`, '');
    }
  }
  lines.push(
    'This checks cross-origin <script>/<link rel=stylesheet> tags for missing, misapplied, or stale ' +
      'integrity hashes -- not a full security assessment. See README.md for what it does and does not check.',
  );
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.page) {
    console.error('Usage: node cli/check.mjs <page-url> [--json] [--timeout <ms>] [--no-fetch-assets]');
    process.exit(2);
  }
  try {
    // eslint-disable-next-line no-new
    new URL(args.page);
  } catch {
    console.error(`Not a valid URL: ${args.page}`);
    process.exit(2);
  }

  const report = await runCheck(args.page, { timeoutMs: args.timeoutMs, fetchAssets: args.fetchAssets });

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
