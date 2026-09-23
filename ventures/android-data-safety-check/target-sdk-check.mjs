#!/usr/bin/env node
// CLI: reads a declared targetSdkVersion out of an Android project's
// AndroidManifest.xml or Gradle build files and checks it against Google
// Play's published target API level enforcement requirement for the chosen
// form factor. Run locally or as a step in your own CI -- nothing here
// makes a network call.
//
//   node target-sdk-check.mjs [path] [--form-factor <id>] [--json]
//   node target-sdk-check.mjs --list-form-factors
//
// Exit code 0 when the highest declared value meets the "existing app"
// floor for the chosen form factor (the bar an update to an already
// published app must clear); 1 otherwise, including "no targetSdkVersion
// found at all". Usable as a CI gate:
// `node target-sdk-check.mjs . --form-factor phone-tablet || exit 1`.

import { statSync } from 'node:fs';
import { collectFiles } from './check.mjs';
import { readFileSync } from 'node:fs';
import {
  detectTargetSdk,
  buildTargetSdkReport,
  FORM_FACTORS,
  TARGET_API_REQUIREMENT,
} from './target-sdk-scan.mjs';

function readFilesAsRecords(paths, cwd) {
  return paths.map((p) => {
    let content = '';
    try {
      content = readFileSync(p, 'utf8');
    } catch {
      content = '';
    }
    return { path: relativeTo(cwd, p), content };
  });
}

function relativeTo(root, full) {
  return full.startsWith(root) ? full.slice(root.length).replace(/^[/\\]/, '') : full;
}

/** Pure orchestration, no process.exit -- kept separate from main() for tests. */
export function runTargetSdkCheck({ root, formFactorId, today }) {
  const { scannablePaths } = collectFiles(root);
  const files = readFilesAsRecords(scannablePaths, root);
  const detected = detectTargetSdk(files);
  const report = buildTargetSdkReport(detected, formFactorId, today);
  return { report, scannedFileCount: files.length, scannedPaths: files.map((f) => f.path) };
}

function fmtDays(n) {
  if (n === 0) return 'today';
  return n > 0 ? `in ${n} day(s)` : `${Math.abs(n)} day(s) ago`;
}

function formatText(result) {
  const { report, scannedFileCount, scannedPaths } = result;
  const lines = [];
  lines.push(`Scanned ${scannedFileCount} file(s): ${scannedPaths.join(', ') || '(none found)'}`);
  lines.push(`Form factor: ${report.formFactor.label} (${report.formFactor.id})`);
  lines.push('');

  if (report.highest === null) {
    lines.push('No targetSdkVersion/targetSdk declaration found.');
  } else {
    lines.push(`Highest declared targetSdkVersion found: ${report.highest}`);
    for (const d of report.declarations) lines.push(`  ${d.path}:${d.line}  ${d.value}`);
  }
  if (report.unresolvedRefs.length > 0) {
    lines.push('');
    lines.push(`${report.unresolvedRefs.length} declaration(s) reference a variable or version catalog this scan cannot resolve:`);
    for (const r of report.unresolvedRefs) lines.push(`  ${r.path}:${r.line}  ${r.reference}`);
  }

  lines.push('');
  lines.push(
    `Required for an update to an existing app: API ${report.formFactor.requiredExisting}+ ` +
      `(you: ${report.meetsExisting ? 'meets it' : 'below it'})`,
  );
  lines.push(
    `Required for a newly published app: API ${report.formFactor.requiredNew}+ ` +
      `(you: ${report.meetsNew ? 'meets it' : 'below it'})`,
  );
  lines.push('');
  lines.push(`Primary enforcement deadline: ${TARGET_API_REQUIREMENT.primaryDeadline} (${fmtDays(report.daysUntilPrimaryDeadline)})`);
  lines.push(`Extension deadline (if requested in Play Console): ${TARGET_API_REQUIREMENT.extensionDeadline} (${fmtDays(report.daysUntilExtensionDeadline)})`);
  lines.push('');
  lines.push(TARGET_API_REQUIREMENT.consequence);
  lines.push(`Source, as of ${TARGET_API_REQUIREMENT.asOf}: ${TARGET_API_REQUIREMENT.source} -- re-check the live page before relying on this.`);

  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { root: '.', formFactor: 'phone-tablet', json: false, listFormFactors: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--form-factor') args.formFactor = argv[++i];
    else if (argv[i] === '--list-form-factors') args.listFormFactors = true;
    else rest.push(argv[i]);
  }
  if (rest.length > 0) args.root = rest[0];
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.listFormFactors) {
    for (const f of FORM_FACTORS) console.log(`${f.id}\t${f.label}\texisting>=${f.requiredExisting}\tnew>=${f.requiredNew}`);
    process.exit(0);
  }

  let rootStat;
  try {
    rootStat = statSync(args.root);
  } catch {
    console.error(`Path not found: ${args.root}`);
    process.exit(2);
  }
  if (!rootStat.isDirectory()) {
    console.error(`Not a directory: ${args.root}`);
    process.exit(2);
  }

  const result = runTargetSdkCheck({ root: args.root, formFactorId: args.formFactor });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatText(result));
  }
  process.exit(result.report.meetsExisting ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
