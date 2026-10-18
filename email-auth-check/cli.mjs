#!/usr/bin/env node
// Zero-dependency CLI: looks up SPF, DKIM (at nine common selectors), DMARC
// and BIMI for a domain over public DNS-over-HTTPS, and prints a plain-
// English, evidence-first report -- each finding names the exact record or
// tag it read and what it means, never a bare pass/fail score.
//
//   node cli.mjs example.com
//   node cli.mjs example.com --json
//   node cli.mjs example.com --timeout 5000
//
// Runs entirely from your own machine straight to Cloudflare's public DNS
// resolver -- nothing goes through this portfolio, and nothing about the
// domain you check is sent anywhere else. Exit code 0 when the domain has
// no danger-severity finding and every lookup completed; 1 when at least
// one danger finding is present or a lookup failed to complete -- so this
// is usable directly as a CI gate against your own domain's mail setup:
//
//   # in your own CI, not this portfolio's -- your domain, your gate
//   - run: node cli.mjs yourdomain.com

import { runFullCheck } from './lookup.mjs';

function parseArgs(argv) {
  const args = { domain: null, json: false, timeoutMs: undefined, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--timeout') args.timeoutMs = Number(argv[i += 1]);
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!args.domain && !a.startsWith('--')) args.domain = a;
  }
  return args;
}

/** Strips a scheme/path a user pasted by habit down to a bare domain. */
export function normalizeDomainArg(input) {
  return String(input ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

const SEVERITY_MARK = { danger: '!!', notice: '--', info: '..' };

export function formatText(report) {
  const lines = [];
  lines.push(`Domain: ${report.domain}`);
  lines.push('');
  for (const f of report.findings) {
    lines.push(`${SEVERITY_MARK[f.severity] ?? '--'} [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`     ${f.detail}`);
    lines.push(`     evidence: ${f.evidence}`);
    lines.push('');
  }
  lines.push(
    `${report.dangerCount} danger, ${report.noticeCount} notice, ${report.infoCount} informational finding(s).`,
  );
  if (report.incomplete) {
    lines.push('One or more DNS lookups did not complete -- re-run once network access is stable.');
  }
  lines.push('');
  lines.push(
    'This is evidence read directly from public DNS records, not a determination that mail ' +
      'from this domain is or is not secure -- see README.md for exactly what is and is not checked.',
  );
  return lines.join('\n');
}

/** Pure orchestration: given a check function (real DoH, or a stub in
 * tests), run it and format. Kept separate from main() so tests can inject
 * a fake `checkFn` instead of hitting the network. */
export async function run(argv, { checkFn = runFullCheck } = {}) {
  const args = parseArgs(argv);

  if (args.help || !args.domain) {
    return {
      exitCode: args.help ? 0 : 2,
      output: 'Usage: node cli.mjs <domain> [--json] [--timeout <ms>]',
    };
  }

  const domain = normalizeDomainArg(args.domain);
  if (!domain) {
    return { exitCode: 2, output: `Not a valid domain: ${args.domain}` };
  }

  const report = await checkFn(domain, args.timeoutMs ? { timeoutMs: args.timeoutMs } : {});
  const exitCode = report.ok && !report.incomplete ? 0 : 1;
  const output = args.json ? JSON.stringify(report, null, 2) : formatText(report);
  return { exitCode, output };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  if (exitCode === 2) console.error(output);
  else console.log(output);
  process.exitCode = exitCode;
}
