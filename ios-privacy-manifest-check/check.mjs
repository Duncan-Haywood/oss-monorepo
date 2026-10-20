#!/usr/bin/env node
// CLI: scans an iOS/macOS source tree for Required Reason API usage and
// checks it against a PrivacyInfo.xcprivacy manifest. Run locally or as a
// step in your own CI -- nothing here makes a network call or reads
// anything outside the path you point it at.
//
//   node check.mjs [path] [--manifest <file>] [--json]
//
// Exit code 0 when every detected category is declared with a recognised
// reason code and a manifest was found; 1 otherwise (including "no manifest
// found at all" and "manifest exists but is missing a category"). That
// makes it usable as a CI gate: `node check.mjs . || exit 1`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { detectApiUsage, parseManifest, buildReport, suggestedSnippet } from './scan.mjs';

const SOURCE_EXTENSIONS = new Set(['.swift', '.m', '.mm', '.h']);
const MANIFEST_NAME = 'PrivacyInfo.xcprivacy';
const SKIP_DIRS = new Set([
  '.git', '.build', '.swiftpm', 'Pods', 'Carthage', 'DerivedData',
  'node_modules', 'build', 'Build',
]);

function isSkippableDir(name) {
  return SKIP_DIRS.has(name) || name.endsWith('.xcodeproj') || name.endsWith('.xcworkspace') || name.startsWith('.');
}

/** Walks `root`, returning source files to scan and every PrivacyInfo.xcprivacy found. */
export function collectFiles(root) {
  const sourceFiles = [];
  const manifestPaths = [];

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
      if (entry.name === MANIFEST_NAME) {
        manifestPaths.push(full);
      } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
        sourceFiles.push(full);
      }
    }
  }

  walk(root);
  return { sourceFiles, manifestPaths };
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
export function runCheck({ root, manifestOverride }) {
  const { sourceFiles, manifestPaths } = collectFiles(root);
  const files = readFilesAsRecords(sourceFiles, root);
  const detected = detectApiUsage(files);

  let manifest = null;
  let manifestSourcePath = null;
  if (manifestOverride) {
    manifestSourcePath = manifestOverride;
    try {
      manifest = parseManifest(readFileSync(manifestOverride, 'utf8'));
    } catch {
      manifest = { categories: new Map(), parseNote: 'file not found' };
    }
  } else if (manifestPaths.length > 0) {
    manifestSourcePath = manifestPaths[0];
    manifest = parseManifest(readFileSync(manifestPaths[0], 'utf8'));
  }

  const report = buildReport(detected, manifest);
  return {
    report,
    scannedFileCount: files.length,
    manifestPath: manifestSourcePath ? relativeTo(root, manifestSourcePath) : null,
    additionalManifestPaths: manifestPaths.slice(1).map((p) => relativeTo(root, p)),
  };
}

function formatText(result) {
  const { report, scannedFileCount, manifestPath, additionalManifestPaths } = result;
  const lines = [];
  lines.push(`Scanned ${scannedFileCount} source file(s).`);
  lines.push(
    manifestPath
      ? `Manifest: ${manifestPath}${report.manifestParseNote ? ` (${report.manifestParseNote})` : ''}`
      : 'Manifest: none found (no PrivacyInfo.xcprivacy in this tree).',
  );
  if (additionalManifestPaths.length > 0) {
    lines.push(`Note: ${additionalManifestPaths.length} additional PrivacyInfo.xcprivacy file(s) found and not read: ${additionalManifestPaths.join(', ')} -- this tool checks one manifest per run.`);
  }
  lines.push('');

  for (const category of report.categories) {
    const marker = { 'not-detected': '.', declared: 'OK', 'declared-but-not-detected': '?', undeclared: 'X' }[category.status];
    lines.push(`[${marker}] ${category.label} (${category.id})`);
    if (category.detectedCount > 0) {
      lines.push(`    detected ${category.detectedCount} time(s), e.g.:`);
      for (const ex of category.examples.slice(0, 3)) {
        lines.push(`      ${ex.path}:${ex.line}  ${ex.snippet}`);
      }
    }
    if (category.declaredReasons.length > 0) {
      lines.push(`    declared with reason(s): ${category.declaredReasons.join(', ')}`);
    }
    if (category.invalidReasonCodes.length > 0) {
      lines.push(`    WARNING: not a published reason code for this category: ${category.invalidReasonCodes.join(', ')}`);
    }
    if (category.status === 'undeclared') {
      lines.push('    Add an entry for this category -- pick the reason that actually matches your use:');
      for (const r of category.validReasons) lines.push(`      ${r.code}: ${r.description}`);
      lines.push('    Suggested entry:');
      for (const l of suggestedSnippet(category.id).split('\n')) lines.push(`      ${l}`);
    }
    lines.push('');
  }

  lines.push(
    report.ok
      ? 'Every detected Required Reason API category is declared with a recognised code.'
      : 'This is evidence of what the code and the manifest say -- not a determination that App Review will pass. You choose which reason code actually applies.',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { root: '.', manifest: null, json: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--manifest') args.manifest = argv[++i];
    else rest.push(argv[i]);
  }
  if (rest.length > 0) args.root = rest[0];
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
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

  const result = runCheck({ root: args.root, manifestOverride: args.manifest });

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
