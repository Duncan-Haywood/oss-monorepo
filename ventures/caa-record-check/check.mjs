#!/usr/bin/env node
// CLI: for each hostname given, resolves the CAA record set that actually
// governs certificate issuance (following RFC 8659's tree-walk up to the
// first ancestor that publishes one), reports every record's flag/tag/value,
// flags malformed records and a critical-flagged unrecognized tag, and --
// with --ca -- names whether one specific certificate authority is
// authorized to issue for it. Real DNS-over-HTTPS requests from your own
// machine; no request of any kind is ever sent to the hostname itself, only
// to Cloudflare's public resolver, reading DNS data already published for
// anyone to see.
//
//   node check.mjs <hostname> [<hostname> ...] [--ca <ca-domain>] [--json] [--timeout <ms>]
//
// Exit code 0 when every hostname resolves cleanly (and, with --ca, that CA
// is authorized); 1 when a hostname has a malformed record, a critical
// unrecognized tag, or (with --ca) the named CA is blocked; 2 on a usage
// error or a lookup that could not complete at all.

import { resolveCaaSet } from './lookup.mjs';
import { classify, buildReport, KNOWN_CAS } from './analyze.mjs';

function formatVerdict(label, v) {
  const mark = v.authorized ? 'OK  ' : 'FAIL';
  return `  [${mark}] ${label}: ${v.authorized ? 'authorized' : 'NOT authorized'} (${v.reason})`;
}

function formatText(report) {
  const lines = [];
  lines.push(`Hostnames checked: ${report.hostnamesChecked}`);
  lines.push('');

  for (const r of report.results) {
    lines.push(`== ${r.hostname} ==`);
    if (r.category === 'lookup-error') {
      lines.push(`  DNS lookup did not complete: ${r.error}`);
      lines.push('');
      continue;
    }
    const { lookup, analysis } = r;
    if (lookup.canonicalName !== lookup.queriedName) {
      lines.push(`  CNAME alias -> ${lookup.canonicalName}`);
    }
    if (analysis.noCaaAnywhere) {
      lines.push(`  No CAA record found anywhere from ${lookup.canonicalName} up to the top level -- any CA may issue.`);
    } else {
      lines.push(`  CAA record set found at: ${lookup.foundAtName}${lookup.foundAtName !== lookup.canonicalName ? ' (an ancestor, not the exact name)' : ''}`);
      for (const rec of lookup.records) {
        if (!rec.ok) {
          lines.push(`    !! MALFORMED: ${rec.error} (raw: ${rec.raw})`);
        } else {
          lines.push(`    ${rec.critical ? '[critical] ' : ''}${rec.tag} "${rec.value}"`);
        }
      }
    }
    if (analysis.criticalUnknown.length > 0) {
      lines.push(`  !! CRITICAL, UNRECOGNIZED TAG(S): ${analysis.criticalUnknown.map((c) => c.tag).join(', ')} -- any CA that does not implement this tag MUST refuse to issue for this name at all, per RFC 8659. In practice that is every public CA that doesn't specifically support it.`);
    }
    if (analysis.iodef.length > 0) {
      lines.push(`  Violation reports go to: ${analysis.iodef.join(', ')}`);
    }
    if (r.requestedCaVerdict) {
      lines.push(formatVerdict(`${r.requestedCaVerdict.name} (non-wildcard)`, r.requestedCaVerdict.nonWildcard));
      lines.push(formatVerdict(`${r.requestedCaVerdict.name} (wildcard)`, r.requestedCaVerdict.wildcard));
    }
    lines.push('');
  }

  if (report.errors.length > 0) {
    lines.push(`${report.errors.length} hostname(s) could not be looked up: ${report.errors.map((e) => `${e.hostname} (${e.error})`).join('; ')}`);
  }
  lines.push('');
  lines.push(
    'This reads public DNS CAA records and reports what RFC 8659 says they mean -- it does not ' +
      'contact the hostname, and a clean report is not a guarantee a given CA will actually issue ' +
      '(the CA makes that decision, and may apply checks of its own on top of this).',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const hostnames = [];
  let json = false;
  let timeoutMs;
  let ca;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--timeout') timeoutMs = Number(argv[++i]);
    else if (argv[i] === '--ca') ca = argv[++i];
    else if (!argv[i].startsWith('--')) hostnames.push(argv[i]);
  }
  return { hostnames, json, timeoutMs, ca };
}

/** Pure orchestration, kept separate from main() so tests can inject a fake resolver. */
export async function runCheck(hostnames, { resolveCaaSetFn = resolveCaaSet, timeoutMs, ca } = {}) {
  const results = await Promise.all(
    hostnames.map(async (hostname) => {
      const lookup = await resolveCaaSetFn(hostname, timeoutMs ? { timeoutMs } : undefined);
      return classify(hostname, lookup, ca);
    }),
  );
  return buildReport(hostnames, results);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.hostnames.length === 0) {
    console.error('Usage: node check.mjs <hostname> [<hostname> ...] [--ca <ca-domain>] [--json] [--timeout <ms>]');
    console.error(`Known CA shortlist: ${KNOWN_CAS.map((c) => c.domain).join(', ')} (or pass any other CA domain with --ca)`);
    process.exit(2);
  }

  const report = await runCheck(args.hostnames, { timeoutMs: args.timeoutMs, ca: args.ca });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatText(report));
  }
  if (report.errors.length > 0) process.exit(2);
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
