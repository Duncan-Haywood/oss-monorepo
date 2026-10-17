#!/usr/bin/env node
// CLI: for each hostname given, follows its CNAME chain (real DNS, over
// Cloudflare's public DNS-over-HTTPS resolver), and when the chain ends at a
// known takeover-prone provider, sends one live GET request to the hostname
// to check whether that provider's own "nothing is claimed at this name"
// page comes back. Your machine, real requests -- no request goes through
// this portfolio.
//
//   node check.mjs <hostname> [<hostname> ...] [--json] [--timeout <ms>]
//
// Only run this against a hostname you own or are authorised to test -- the
// DNS lookup and the single GET are the same requests any browser visiting
// the hostname already makes. This never attempts to claim, register, or
// configure anything at a provider -- it only detects and reports.
//
// Exit code 0 when no hostname is confirmed or unconfirmed-risky; 1 when at
// least one is, or a lookup could not be completed at all.

import { resolveCnameChain } from './lookup.mjs';
import { fetchHostname } from './probe.mjs';
import { classify, buildReport } from './analyze.mjs';
import { matchProvider } from './fingerprints.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Hostnames checked: ${report.hostnamesChecked}`);
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('No subdomain-takeover risk found among the hostnames checked.');
  } else {
    for (const f of report.findings) {
      lines.push(`!! [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push(`     target: ${f.target}`);
      lines.push(`     docs: ${f.docsUrl}`);
      lines.push('');
    }
  }

  const clean = report.results.filter((r) => r.category === 'no-cname' || r.category === 'not-risky');
  if (clean.length > 0) {
    lines.push(`${clean.length} hostname(s) with no risky CNAME target found.`);
  }
  if (report.errors.length > 0) {
    lines.push(`${report.errors.length} hostname(s) could not be looked up: ${report.errors.map((e) => `${e.hostname} (${e.error})`).join('; ')}`);
  }

  lines.push('');
  lines.push(
    'This is evidence from a DNS lookup and one GET request per hostname, not a full security ' +
      'audit -- see README.md for what this tool does and does not check.',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const hostnames = [];
  let json = false;
  let timeoutMs;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--timeout') timeoutMs = Number(argv[++i]);
    else if (!argv[i].startsWith('--')) hostnames.push(argv[i]);
  }
  return { hostnames, json, timeoutMs };
}

/** Pure orchestration: given injectable lookup/probe functions, resolve and
 * classify every hostname. Kept separate from main() so tests can inject
 * fakes instead of hitting the network. Only sends a probe request when the
 * CNAME chain actually ends at a known provider -- no point sending a live
 * request that classify() cannot use either way. */
export async function runCheck(hostnames, { resolveCnameChainFn = resolveCnameChain, fetchHostnameFn = fetchHostname, timeoutMs } = {}) {
  const results = await Promise.all(
    hostnames.map(async (hostname) => {
      const cname = await resolveCnameChainFn(hostname, timeoutMs ? { timeoutMs } : undefined);
      if (cname.error || !cname.finalTarget || !matchProvider(cname.finalTarget)) {
        return classify(hostname, cname, null);
      }
      const probe = await fetchHostnameFn(hostname, timeoutMs ? { timeoutMs } : undefined);
      return classify(hostname, cname, probe);
    }),
  );
  return buildReport(hostnames, results);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.hostnames.length === 0) {
    console.error('Usage: node check.mjs <hostname> [<hostname> ...] [--json] [--timeout <ms>]');
    console.error('Only run this against a hostname you own or are authorised to test.');
    process.exit(2);
  }

  const report = await runCheck(args.hostnames, { timeoutMs: args.timeoutMs });

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
