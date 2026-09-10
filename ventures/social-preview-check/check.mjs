#!/usr/bin/env node
// CLI: fetches a URL's HTML plus its og:image/twitter:image, and reports
// which social-link-preview problems the page has -- a missing or
// unreachable image, a relative og:image URL, an image below the platform's
// documented minimum size, a missing twitter:card, or a duplicated tag.
// Your machine, your network -- no request goes through this portfolio or
// anywhere but the URL you pass and whatever it points its preview image at.
//
//   node check.mjs <url> [--json] [--timeout <ms>]
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

  const tags = report.probe.tags;
  if (tags) {
    lines.push(`  <title>: ${tags.title ?? '(not set)'}`);
    lines.push(`  og:title: ${tags.og.title ?? '(not set)'}`);
    lines.push(`  og:description: ${tags.og.description ?? '(not set)'}`);
    lines.push(`  og:image: ${tags.og.image ?? '(not set)'}`);
    lines.push(`  twitter:card: ${tags.twitter.card ?? '(not set)'}`);
    lines.push(`  twitter:image: ${tags.twitter.image ?? '(not set)'}`);
  }
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('None of the patterns this tool checks for were found.');
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
    'This is evidence about what a crawler could see in this one response -- ' +
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
