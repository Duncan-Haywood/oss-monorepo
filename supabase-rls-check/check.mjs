#!/usr/bin/env node
// CLI: reads a Supabase project's own public schema listing, then sends one
// real, read-only GET per table using the anon key you provide, and reports
// which tables return real rows to that unauthenticated request -- the
// CVE-2025-48757 / "missing RLS" exposure class. Your machine, your
// project's REST endpoint -- no request goes through this portfolio.
//
//   node check.mjs <project-url> <anon-key> [--json] [--timeout <ms>]
//
// Only run this against a Supabase project you own or are authorised to
// test. The anon key is meant to be public-ish by Supabase's own design (it
// is embedded in every client app that uses the project), but the table
// contents it can reveal are not -- treat this the same as you would `curl`
// aimed at someone else's server. This never writes, updates, or deletes
// anything: every request is GET, capped at one row, with an exact count.
//
// Exit code 0 when the schema was readable and no table returned a real row
// to the anon key; 1 when at least one table is exposed or the schema/some
// tables could not be checked at all.

import { runProbes } from './probe.mjs';
import { buildReport } from './analyze.mjs';

function formatText(report) {
  const lines = [];
  lines.push(`Project: ${report.baseUrl}`);
  lines.push(`Tables checked: ${report.tablesChecked}${report.truncated ? ' (list truncated at the cap)' : ''}`);
  lines.push('');

  if (report.schemaError) {
    lines.push(`Could not read the project's schema: ${report.schemaError}`);
    lines.push('Check the project URL and anon key, then re-run.');
    return lines.join('\n');
  }

  if (report.findings.length === 0) {
    lines.push('No table returned a real row to this anon key.');
  } else {
    for (const f of report.findings) {
      lines.push(`!! [DANGER] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push(`     evidence: ${f.evidenceStatus}`);
      lines.push('');
    }
  }

  if (report.unconfirmed.length > 0) {
    lines.push('');
    lines.push(
      `${report.unconfirmed.length} table(s) returned zero rows with no way to tell "RLS is blocking this" ` +
        `from "this table is just empty": ${report.unconfirmed.map((c) => c.table).join(', ')}. ` +
        'Insert one throwaway test row (or check the Supabase dashboard directly) to resolve which.',
    );
  }
  if (report.errors.length > 0) {
    lines.push('');
    lines.push(`${report.errors.length} table(s) could not be checked: ${report.errors.map((c) => `${c.table} (${c.error})`).join('; ')}`);
  }
  if (report.blocked.length > 0) {
    lines.push('');
    lines.push(`${report.blocked.length} table(s) correctly rejected this anon key (401/403): ${report.blocked.map((c) => c.table).join(', ')}`);
  }

  lines.push('');
  lines.push(
    'This is evidence from the requests above, not a full security audit -- see README.md for ' +
      'what this tool does and does not check.',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const args = { projectUrl: positional[0] ?? null, anonKey: positional[1] ?? null, json: false, timeoutMs: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[++i]);
  }
  return args;
}

/** Pure orchestration: given a probe function (real network, or a stub in
 * tests), fetch and classify. Kept separate from main() so tests can inject
 * a fake `probeFn` instead of hitting the network. */
export async function runCheck(projectUrl, anonKey, { probeFn = runProbes, timeoutMs } = {}) {
  const { baseUrl, results, schemaError, truncated } = await probeFn(projectUrl, anonKey, timeoutMs ? { timeoutMs } : {});
  return buildReport(baseUrl, results, { schemaError, truncated });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.projectUrl || !args.anonKey) {
    console.error('Usage: node check.mjs <project-url> <anon-key> [--json] [--timeout <ms>]');
    console.error('Only run this against a Supabase project you own or are authorised to test.');
    process.exit(2);
  }
  try {
    // eslint-disable-next-line no-new
    new URL(args.projectUrl);
  } catch {
    console.error(`Not a valid URL: ${args.projectUrl}`);
    process.exit(2);
  }

  const report = await runCheck(args.projectUrl, args.anonKey, { timeoutMs: args.timeoutMs });

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
