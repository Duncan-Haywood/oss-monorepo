#!/usr/bin/env node
// CLI: scans an Android project for permission and known-SDK usage that maps
// to a Google Play "Data safety" category, and checks it against a plain
// list of categories you say you've already declared in Play Console. Run
// locally or as a step in your own CI -- nothing here makes a network call
// or reads anything outside the path you point it at.
//
//   node check.mjs [path] [--declared <file>] [--json]
//
// Exit code 0 when every detected category is in the declared list and a
// declared list was actually given; 1 otherwise (including "no --declared
// list given at all"). That makes it usable as a CI gate:
// `node check.mjs . --declared data-safety-declared.txt || exit 1`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { detectDataTypes, buildReport, parseDeclaredList, suggestedAction, DATA_SAFETY_CATEGORIES } from './scan.mjs';

const SCANNABLE_NAMES = new Set(['AndroidManifest.xml', 'build.gradle', 'build.gradle.kts']);
const SKIP_DIRS = new Set([
  '.git', '.gradle', '.idea', 'build', 'node_modules', 'captures', '.cxx',
]);

function isSkippableDir(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

/** Walks `root`, returning every AndroidManifest.xml / build.gradle(.kts) found. */
export function collectFiles(root) {
  const found = [];

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isSkippableDir(entry.name)) walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SCANNABLE_NAMES.has(entry.name)) found.push(full);
    }
  }

  walk(root);
  return { scannablePaths: found };
}

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

/**
 * Pure orchestration, no process.exit -- kept separate from main() so tests
 * can call it directly against a fixture directory.
 */
export function runCheck({ root, declaredOverride }) {
  const { scannablePaths } = collectFiles(root);
  const files = readFilesAsRecords(scannablePaths, root);
  const detected = detectDataTypes(files);

  let declared = null;
  let unknownLines = [];
  let declaredSourcePath = null;
  if (declaredOverride) {
    declaredSourcePath = declaredOverride;
    let text = '';
    try {
      text = readFileSync(declaredOverride, 'utf8');
    } catch {
      text = '';
    }
    const parsed = parseDeclaredList(text);
    declared = parsed.categories;
    unknownLines = parsed.unknownLines;
  }

  const report = buildReport(detected, declared);
  return {
    report,
    scannedFileCount: files.length,
    scannedPaths: files.map((f) => f.path),
    declaredSourcePath: declaredSourcePath ? relativeTo(root, declaredSourcePath) : null,
    unknownDeclaredLines: unknownLines,
  };
}

function formatText(result) {
  const { report, scannedFileCount, scannedPaths, declaredSourcePath, unknownDeclaredLines } = result;
  const lines = [];
  lines.push(`Scanned ${scannedFileCount} file(s): ${scannedPaths.join(', ') || '(none found)'}`);
  lines.push(
    declaredSourcePath
      ? `Declared-categories file: ${declaredSourcePath}`
      : 'Declared-categories file: none given (pass --declared <file>).',
  );
  if (unknownDeclaredLines.length > 0) {
    lines.push(`Note: ${unknownDeclaredLines.length} line(s) in the declared file did not match a known category id: ${unknownDeclaredLines.join(', ')}`);
  }
  lines.push('');

  for (const category of report.categories) {
    const marker = { 'not-detected': '.', declared: 'OK', 'declared-but-not-detected': '?', undeclared: 'X' }[category.status];
    lines.push(`[${marker}] ${category.label} (${category.id})`);
    if (category.detectedCount > 0) {
      lines.push(`    detected ${category.detectedCount} time(s), e.g.:`);
      for (const ex of category.examples.slice(0, 3)) {
        lines.push(`      ${ex.path}:${ex.line}  ${ex.hint}`);
      }
    }
    if (category.status === 'undeclared') {
      lines.push(`    ${suggestedAction(category.id)}`);
    }
    lines.push('');
  }

  lines.push(
    report.ok
      ? 'Every detected category is in your declared-categories list.'
      : report.declaredProvided
        ? 'This is evidence of what the manifest/Gradle files and your declared list say -- not a determination that Play Console will accept the submission. You decide the actual purpose and whether each type is shared.'
        : 'No declared-categories list was given, so nothing could be confirmed as already declared. Pass --declared <file> once you have one.',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { root: '.', declared: null, json: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--declared') args.declared = argv[++i];
    else if (argv[i] === '--list-categories') args.listCategories = true;
    else rest.push(argv[i]);
  }
  if (rest.length > 0) args.root = rest[0];
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.listCategories) {
    for (const c of DATA_SAFETY_CATEGORIES) console.log(`${c.id}\t${c.label}`);
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

  const result = runCheck({ root: args.root, declaredOverride: args.declared });

  if (args.json) {
    console.log(JSON.stringify(result, (key, value) => (value instanceof Map ? Object.fromEntries(value) : value), 2));
  } else {
    console.log(formatText(result));
  }
  process.exit(result.report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
