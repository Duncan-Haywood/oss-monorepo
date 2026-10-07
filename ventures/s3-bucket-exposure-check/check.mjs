#!/usr/bin/env node
// CLI: sends two unsigned GET requests to a named S3 bucket's own REST
// endpoint -- one asking it to list its contents, one asking to read its
// ACL -- and reports whether anonymous listing is enabled and whether the
// ACL grants read/write to "AllUsers" or "AuthenticatedUsers". Object
// CONTENTS are never fetched, only key (file) names and ACL grant metadata.
// Your machine, real requests -- no request goes through this portfolio.
//
//   node check.mjs <bucket-name> [--json] [--timeout <ms>]
//
// Only run this against a bucket you own or are authorised to test -- treat
// it the same as you would `curl` or the AWS CLI aimed at someone else's
// bucket. This never sends anything but GET requests and never
// writes/modifies anything on the target.
//
// Exit code 0 when no exposure is found (including "bucket does not
// exist"); 1 when at least one finding is confirmed.

import { checkBucket } from './probe.mjs';
import { buildReport } from './analyze.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Bucket: ${report.bucket}`);

  if (report.notFound) {
    lines.push('This bucket name does not exist (NoSuchBucket) -- check for a typo.');
    return lines.join('\n');
  }

  if (report.findings.length === 0) {
    lines.push('No exposure found: anonymous listing is blocked and no public ACL grant was found.');
  } else {
    for (const f of report.findings) {
      lines.push(`!! [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      if (f.sampleKeys?.length) lines.push(`     keys: ${f.sampleKeys.join(', ')}`);
      lines.push('');
    }
  }

  if (report.blockedCount > 0) {
    lines.push(`${report.blockedCount} request(s) cleanly blocked (AccessDenied) -- a healthy outcome.`);
  }
  if (report.errors.length > 0) {
    lines.push(`${report.errors.length} request(s) could not be classified: ${report.errors.join('; ')}`);
  }

  lines.push('');
  lines.push(
    'This is evidence from two unsigned requests, not a full security audit -- see README.md for ' +
      'what this tool does and does not check.',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  let bucket = null;
  let json = false;
  let timeoutMs;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--timeout') timeoutMs = Number(argv[++i]);
    else if (!argv[i].startsWith('--') && bucket === null) bucket = argv[i];
  }
  return { bucket, json, timeoutMs };
}

/** Pure orchestration: given a checkBucket function (real network, or a
 * stub in tests), fetch and classify. Kept separate from main() so tests
 * can inject a fake `checkBucketFn` instead of hitting the network. */
export async function runCheck(bucket, { checkBucketFn = checkBucket, timeoutMs } = {}) {
  const raw = await checkBucketFn(bucket, timeoutMs ? { timeoutMs } : undefined);
  return buildReport(bucket, raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.bucket) {
    console.error('Usage: node check.mjs <bucket-name> [--json] [--timeout <ms>]');
    console.error('Only run this against a bucket you own or are authorised to test.');
    process.exit(2);
  }

  let report;
  try {
    report = await runCheck(args.bucket, { timeoutMs: args.timeoutMs });
  } catch (err) {
    console.error(err.message ?? String(err));
    process.exit(2);
  }

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
