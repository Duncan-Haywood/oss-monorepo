#!/usr/bin/env node
// CLI: reads an AWS IAM role trust policy and reports which GitHub Actions
// OIDC misconfiguration patterns it shows.
//
//   node check.mjs trust-policy.json [--json]
//   aws iam get-role --role-name my-role \
//     --query Role.AssumeRolePolicyDocument | node check.mjs -
//
// This makes no network request of any kind. It reads a file (or stdin),
// parses JSON, and classifies it — so it is safe to run against a production
// role's policy without granting this tool anything, and it works offline and
// inside CI with no credentials.
//
// Exit code 0 when at least one GitHub OIDC statement was analysed and no
// "danger" finding is present; 1 when a danger finding is present or nothing
// could be analysed; 2 on a usage error.

import { readFileSync } from 'node:fs';
import { analyzeTrustPolicyText } from './analyze.mjs';

function formatText(report) {
  const lines = [];

  if (report.parseError && report.findings.length === 0) {
    lines.push(`Could not check this policy: ${report.parseError}`);
    return lines.join('\n');
  }

  lines.push(
    `Analysed ${report.statementsAnalysed} GitHub OIDC statement(s)` +
      (report.statementsSkipped ? `, skipped ${report.statementsSkipped} unrelated statement(s)` : '') +
      '.',
  );
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('None of the patterns this tool checks for were found.');
  } else {
    for (const f of report.findings) {
      const mark = f.severity === 'danger' ? '!!' : '--';
      lines.push(`${mark} [${f.severity.toUpperCase()}] ${f.title}`);
      // The detail carries backtick-quoted policy fragments for the browser
      // report; strip the markers so terminal output reads as plain prose.
      lines.push(`     ${f.detail.replace(/`/g, '')}`);
      lines.push(`     evidence: ${f.evidence}`);
      lines.push('');
    }
    lines.push(`${report.dangerCount} danger, ${report.noticeCount} notice.`);
  }

  lines.push('');
  lines.push(
    'This reads the trust policy only. It cannot see what permissions the role grants, ' +
      'who can push to the repository, or whether an environment has reviewers — ' +
      'see README.md for what this tool does and does not check.',
  );
  return lines.join('\n');
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const args = { path: null, json: false };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (!args.path && !arg.startsWith('--')) args.path = arg;
  }
  return args;
}

/** Pure orchestration, kept separate from main() so tests can drive it
 *  without a process or a filesystem. */
export function runCheck(policyText) {
  return analyzeTrustPolicyText(policyText);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.path) {
    console.error('Usage: node check.mjs <trust-policy.json | -> [--json]');
    process.exit(2);
  }

  let text;
  if (args.path === '-') {
    text = readStdin();
  } else {
    try {
      text = readFileSync(args.path, 'utf8');
    } catch (err) {
      console.error(`Could not read ${args.path}: ${err.message}`);
      process.exit(2);
    }
  }

  if (text.trim() === '') {
    console.error('No policy content was provided.');
    process.exit(2);
  }

  const report = runCheck(text);

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
