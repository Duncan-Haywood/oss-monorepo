#!/usr/bin/env node
// CLI: sends one real, unauthenticated, read-only GET request -- the
// anonymous listing endpoint -- to an AWS S3 bucket, a Google Cloud Storage
// bucket, or an Azure Blob container you name, and reports whether it
// allows public listing. Your machine, your network -- nothing goes
// through this portfolio.
//
//   node check.mjs <bucket-url> [--json] [--timeout <ms>]
//   node check.mjs --provider s3|gcs|azure --bucket <name> [--account <name>] [--json]
//
// <bucket-url> accepts the URL shape each provider's own docs describe:
//   S3    https://<bucket>.s3.amazonaws.com/   or  https://s3.amazonaws.com/<bucket>
//   GCS   https://storage.googleapis.com/<bucket>/  or  https://<bucket>.storage.googleapis.com/
//   Azure https://<account>.blob.core.windows.net/<container>
//
// Only point this at a bucket or container you own or are authorised to
// test. This sends one ordinary, unauthenticated GET -- the same request
// any anonymous visitor's browser could send -- and never fetches any
// individual object's content, only the listing.
//
// Exit code 0 when the bucket does not allow public listing (private, or
// does not exist); 1 when it does; 2 for a usage error, a request that could
// not complete (network error, timeout, bad name), or a response this tool
// could not classify (an "unknown" state -- never guessed at either way).

import { buildProbeUrl, detectTargetFromUrl, buildReport } from './engine.mjs';
import { runProbe } from './probe.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Target: ${report.target}`);
  lines.push(`Provider: ${report.provider ?? '(unknown)'}`);
  if (report.incomplete) {
    lines.push(`Request failed: ${report.error}`);
    lines.push('');
    lines.push('The probe did not complete -- re-run once the target is reachable.');
    return lines.join('\n');
  }
  lines.push(`Status: ${report.status}`);
  lines.push('');

  if (report.state === 'public-listing') {
    const f = report.findings[0];
    lines.push(`!! [DANGER] ${f.title}`);
    lines.push(`   ${f.detail}`);
    lines.push(
      `   ${f.objectCount}${f.truncated ? '+' : ''} object name(s) visible in this response` +
        (f.sampleKeys.length ? `, for example: ${f.sampleKeys.join(', ')}` : ''),
    );
  } else if (report.state === 'private') {
    lines.push('The bucket exists and denied the anonymous listing request. Not publicly listable.');
  } else if (report.state === 'not-found') {
    lines.push('No bucket/container by that name was found. Nothing to report.');
  } else {
    lines.push('The response did not match a recognised listing-or-error shape for this provider.');
    lines.push('This is inconclusive, not a clean result -- verify by hand before relying on it.');
  }

  lines.push('');
  lines.push(
    'This is evidence from one response, not a full security assessment -- see README.md for what ' +
      'this tool does and does not check.',
  );
  return lines.join('\n');
}

export function parseArgs(argv) {
  const args = { target: null, provider: null, bucket: null, account: null, json: false, timeoutMs: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--timeout') args.timeoutMs = Number(argv[++i]);
    else if (a === '--provider') args.provider = argv[++i];
    else if (a === '--bucket') args.bucket = argv[++i];
    else if (a === '--account') args.account = argv[++i];
    else if (!args.target && !a.startsWith('--')) args.target = a;
  }
  return args;
}

/** Pure orchestration: given a resolved target and a probe function
 * (real network, or a stub in tests), fetch and classify. Kept separate
 * from main() so tests can inject a fake `probeFn` instead of hitting the
 * network. */
export async function runCheck(resolved, { probeFn = runProbe, timeoutMs } = {}) {
  const probe = await probeFn(resolved, timeoutMs ? { timeoutMs } : {});
  return buildReport(resolved.probeUrl, probe);
}

export function resolveFromArgs(args) {
  if (args.provider || args.bucket || args.account) {
    if (!args.provider || !args.bucket) {
      return { ok: false, error: '--provider and --bucket must both be given when using the explicit form' };
    }
    return buildProbeUrl({ provider: args.provider, bucket: args.bucket, account: args.account });
  }
  if (!args.target) {
    return { ok: false, error: 'usage-error' };
  }
  return detectTargetFromUrl(args.target);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resolved = resolveFromArgs(args);

  if (!resolved.ok) {
    if (resolved.error === 'usage-error') {
      console.error('Usage: node check.mjs <bucket-url> [--json] [--timeout <ms>]');
      console.error('   or: node check.mjs --provider s3|gcs|azure --bucket <name> [--account <name>]');
    } else {
      console.error(resolved.error);
    }
    process.exit(2);
  }

  const report = await runCheck(resolved, { timeoutMs: args.timeoutMs });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatText(report));
  }
  process.exit(report.incomplete || report.state === 'unknown' ? 2 : report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
