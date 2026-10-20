#!/usr/bin/env node
// CLI: scans a Chrome/Edge extension source tree for `chrome.*` API usage and
// checks it against manifest.json's permissions. Run locally or as a step in
// your own CI -- nothing here makes a network call or reads anything outside
// the path you point it at.
//
//   node check.mjs [path] [--manifest <file>] [--json]
//
// Exit code 0 when a manifest.json was found, every declared required
// permission with a checkable signature is actually used, no detected API
// call is missing its permission, and no host permission is a broad
// all-sites pattern; 1 otherwise. That makes it usable as a CI gate:
// `node check.mjs . || exit 1`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { detectApiUsage, parseManifest, buildReport } from './scan.mjs';

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const MANIFEST_NAME = 'manifest.json';
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.output', 'vendor',
]);

function isSkippableDir(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

/** Walks `root`, returning source files to scan and every manifest.json found. */
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
      manifest = { permissions: [], optionalPermissions: [], hostPermissions: [], manifestVersion: null, parseNote: 'file not found' };
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
      : 'Manifest: none found (no manifest.json in this tree).',
  );
  if (additionalManifestPaths.length > 0) {
    lines.push(`Note: ${additionalManifestPaths.length} additional manifest.json file(s) found and not read: ${additionalManifestPaths.join(', ')} -- this tool checks one manifest per run.`);
  }
  lines.push('');

  for (const perm of report.permissions) {
    const marker = { 'declared-and-detected': 'OK', 'declared-unused': 'X', 'detected-undeclared': '!' }[perm.status] ?? '?';
    const optNote = perm.optionalOnly ? ' (optional_permissions)' : '';
    lines.push(`[${marker}] ${perm.label} (${perm.id})${optNote} -- ${perm.status}`);
    if (perm.detectedCount > 0) {
      lines.push(`    used ${perm.detectedCount} time(s), e.g.:`);
      for (const ex of perm.examples.slice(0, 3)) lines.push(`      ${ex.path}:${ex.line}  ${ex.snippet}`);
    }
    if (perm.status === 'declared-unused' && !perm.optionalOnly) {
      lines.push('    Declared in permissions[] but no matching chrome.* call was found -- this is the #1 reason Chrome Web Store review flags a submission ("Purple Potassium"). Remove it, or move it to optional_permissions if it is only sometimes needed.');
    }
    if (perm.status === 'detected-undeclared') {
      lines.push('    Used in source but not declared anywhere in the manifest -- this will fail at runtime, not just at review.');
    }
    lines.push('');
  }

  if (report.uncheckable.length > 0) {
    lines.push('Declared, not automatically checkable:');
    for (const u of report.uncheckable) lines.push(`  - ${u.id}${u.optionalOnly ? ' (optional_permissions)' : ''}: ${u.reason}`);
    lines.push('');
  }

  if (report.unmappedDeclared.length > 0) {
    lines.push(`Declared, no code-usage signature in this tool yet: ${report.unmappedDeclared.join(', ')}`);
    lines.push('');
  }

  if (report.hostPermissions.length > 0) {
    lines.push('Host permissions:');
    for (const h of report.hostPermissions) {
      lines.push(`  - ${h.pattern}${h.broad ? '  -- broad "every site" access; Chrome Web Store review asks for a specific justification for this' : ''}`);
    }
    lines.push('');
  }

  lines.push(
    report.ok
      ? 'Every checkable declared permission is used, every detected API call is declared, and no host permission is a broad all-sites pattern.'
      : 'This is evidence of what the code and the manifest say -- not a determination that Chrome Web Store review will pass.',
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
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatText(result));
  }
  process.exit(result.report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
