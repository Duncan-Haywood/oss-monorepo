#!/usr/bin/env node
// CLI: sends two real GET requests to a site you name -- .git/HEAD and
// .git/config, resolved relative to the URL you pass -- and reports whether
// the response bodies are real git-internal content (a publicly exposed
// .git directory) rather than a generic error page. Your machine, your
// network -- no request goes through this portfolio or anywhere but the
// target site.
//
//   node check.mjs <url> [--json] [--timeout <ms>]
//
// Pass the site root (e.g. https://example.com/) unless you specifically
// want to check a subpath's own .git directory, in which case pass that
// subpath with a trailing slash (e.g. https://example.com/app/) -- the two
// probed paths are resolved relative to whatever URL you give, the same way
// a browser resolves a relative link.
//
// Only point this at a system you own or are authorised to test. This
// sends two ordinary, unauthenticated GET requests -- nothing here bypasses
// authentication, reads protected data beyond what the target already
// serves to any anonymous visitor, or does anything a browser wouldn't also
// do by visiting the URL -- but treat it the same as you would curl or any
// other request tool aimed at someone else's server.
//
// Exit code 0 when both probes completed and no exposure finding is
// present; 1 when a finding is present or neither probe could complete
// (network error, timeout, bad URL).

import { runProbe } from './probe.mjs';
import { buildReport } from './analyze.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Target: ${report.target}`);
  if (report.incomplete) {
    lines.push(`Both requests failed: HEAD: ${report.head.error} · config: ${report.config.error}`);
    lines.push('');
    lines.push('Neither probe completed -- re-run once the target is reachable.');
    return lines.join('\n');
  }
  lines.push(`  ${report.head.url ?? '(HEAD not requested)'}  ->  status ${report.head.status ?? '(request failed: ' + report.head.error + ')'}`);
  lines.push(`  ${report.config.url ?? '(config not requested)'}  ->  status ${report.config.status ?? '(request failed: ' + report.config.error + ')'}`);
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('Neither .git/HEAD nor .git/config returned real git-internal content.');
    lines.push('The .git directory does not appear to be publicly exposed.');
  } else {
    for (const f of report.findings) {
      lines.push(`!! [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`   ${f.detail}`);
      lines.push(`   evidence: ${f.evidenceUrl}`);
      lines.push('');
    }
  }

  lines.push(
    'This is evidence from these two responses, not a full security assessment -- ' +
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
    console.log(JSON.stringify({ target: report.target, head: report.head, config: report.config }, null, 2));
  } else {
    console.log(formatText(report));
  }
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
