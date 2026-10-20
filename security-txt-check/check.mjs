#!/usr/bin/env node
// CLI: fetches a site's security.txt over real HTTP(S) and validates it
// against RFC 9116 -- a missing or expired Expires, a missing or non-URI
// Contact, a key pasted where an Encryption URI belongs, a Canonical that
// does not name where the file actually lives, the wrong location, and the
// wrong media type. Your machine, your network; nothing goes through this
// portfolio.
//
//   node check.mjs <domain-or-url> [--json] [--timeout <ms>]
//                  [--expiring-soon <days>]
//
// Exit code 0 when nothing danger-severity was found; 1 when there is a
// danger finding or no security.txt could be fetched at all; 2 on a usage
// error. The distinction matters for CI: "we could not find one" and "the one
// you have is broken" are both failures, but only the second is a regression.

import { buildReport, WELL_KNOWN_PATH } from './engine.mjs';
import { candidateUrls, fetchText } from './fetch-url.mjs';

function parseArgs(argv) {
  const args = { target: null, json: false, timeoutMs: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[++i]);
    else if (!args.target && !argv[i].startsWith('--')) args.target = argv[i];
  }
  return args;
}

/**
 * Pure orchestration: given an injectable fetcher, try the RFC location then
 * the legacy one and validate whichever answers. Kept separate from main() so
 * tests supply a fake rather than hitting the network.
 */
export async function runCheck(target, { fetchFn = fetchText, timeoutMs, now = new Date() } = {}) {
  const resolved = candidateUrls(target);
  if (resolved.error) {
    return { target, fetchError: resolved.error, triedUrls: [], servedFrom: null, report: null };
  }

  const opts = timeoutMs ? { timeoutMs } : {};
  const tried = [];
  for (const candidate of resolved.candidates) {
    const res = await fetchFn(candidate, opts);
    tried.push({ url: candidate, status: res.status, error: res.error });
    // A 404 at /.well-known/ is the ordinary case for a site that only has the
    // legacy copy, so it is not an error worth stopping on -- keep going and
    // let the location finding report where it was eventually found.
    if (!res.ok || !res.body || res.body.trim() === '') continue;

    const report = buildReport({
      text: res.body,
      now,
      servedFrom: candidate,
      contentType: res.contentType,
    });
    return { target, fetchError: null, triedUrls: tried, servedFrom: candidate, report };
  }

  return {
    target,
    fetchError: `no security.txt found (tried ${resolved.candidates.join(' and ')})`,
    triedUrls: tried,
    servedFrom: null,
    report: null,
  };
}

function formatText({ target, fetchError, triedUrls, servedFrom, report }) {
  const lines = [`Target: ${target}`, ''];

  if (fetchError) {
    lines.push(`Could not read a security.txt: ${fetchError}`);
    for (const t of triedUrls) {
      lines.push(`  ${t.url} -> ${t.error ? `error: ${t.error}` : `HTTP ${t.status}`}`);
    }
    lines.push('');
    lines.push(
      `RFC 9116 expects the file at ${WELL_KNOWN_PATH}. Publishing one is a short, ` +
      'one-time job and it is what tells a researcher who found a problem where to send it ' +
      'instead of to a public issue tracker.',
    );
    return lines.join('\n');
  }

  lines.push(`Found at: ${servedFrom}`);
  lines.push(`Fields: ${report.fields.length}${report.signed ? ' (cleartext-signed)' : ''}`);
  if (report.expiresDate) lines.push(`Expires: ${report.expiresDate.toISOString()}`);
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('Conforms to every rule this tool checks.');
  } else {
    for (const f of report.findings) {
      const mark = f.severity === 'danger' ? '!!' : '--';
      lines.push(`${mark} [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push('');
    }
  }

  lines.push(
    'This checks the rules RFC 9116 states about the file itself. It does not verify that ' +
    'anyone reads the address you publish, and it is not a security assessment of the site -- ' +
    'see README.md for what is and is not covered.',
  );
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error('Usage: node check.mjs <domain-or-url> [--json] [--timeout <ms>]');
    process.exit(2);
  }

  const result = await runCheck(args.target, { timeoutMs: args.timeoutMs });

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
