#!/usr/bin/env node
// CLI: scans an Obsidian plugin's source tree for the patterns behind common
// community-plugin review delays. Run locally or as a step in your own CI --
// nothing here makes a network call or reads anything outside the path you
// point it at.
//
//   node check.mjs [path] [--manifest <file>] [--versions <file>] [--json]
//
// Exit code 0 when manifest.json and versions.json were both found and valid
// JSON, no required manifest field is missing, no sample-plugin template
// placeholder is left in place, the manifest's version has a matching entry
// in versions.json, and no source file assigns innerHTML/outerHTML or calls
// insertAdjacentHTML; 1 otherwise. That makes it usable as a CI gate:
// `node check.mjs . || exit 1`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import {
  parseManifest,
  parseVersions,
  detectSamplePluginDefaults,
  checkVersionsEntry,
  detectUnsafeDom,
  detectGlobalListeners,
  detectConsoleLog,
  buildReport,
} from './scan.mjs';

const SOURCE_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx']);
const MANIFEST_NAME = 'manifest.json';
const VERSIONS_NAME = 'versions.json';
const SKIP_DIRS = new Set(['.git', 'node_modules', '.obsidian']);

function isSkippableDir(name) {
  return SKIP_DIRS.has(name) || (name.startsWith('.') && name !== '.');
}

function isDeclarationFile(name) {
  return name.toLowerCase().endsWith('.d.ts');
}

/** Walks `root`, returning source files plus every manifest.json/versions.json found. */
export function collectFiles(root) {
  const sourceFiles = [];
  const manifestPaths = [];
  const versionsPaths = [];

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
      const lower = entry.name.toLowerCase();
      if (lower === MANIFEST_NAME) manifestPaths.push(full);
      else if (lower === VERSIONS_NAME) versionsPaths.push(full);
      else if (SOURCE_EXTENSIONS.has(extname(entry.name)) && !isDeclarationFile(entry.name)) sourceFiles.push(full);
    }
  }

  walk(root);
  return { sourceFiles, manifestPaths, versionsPaths };
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

function tryRead(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Pure orchestration, no process.exit -- kept separate from main() so tests
 * can call it directly against a fixture directory.
 */
export function runCheck({ root, manifestOverride, versionsOverride }) {
  const { sourceFiles, manifestPaths, versionsPaths } = collectFiles(root);
  const files = readFilesAsRecords(sourceFiles, root);

  const manifestSourcePath = manifestOverride ?? manifestPaths[0] ?? null;
  const manifestText = manifestSourcePath ? tryRead(manifestSourcePath) : null;
  const manifest = parseManifest(manifestText);

  const versionsSourcePath = versionsOverride ?? versionsPaths[0] ?? null;
  const versionsText = versionsSourcePath ? tryRead(versionsSourcePath) : null;
  const versions = parseVersions(versionsText);

  const samplePluginDefaults = detectSamplePluginDefaults(manifest.data);
  const versionsEntry = checkVersionsEntry(manifest.data, versions.data);
  const unsafeDom = detectUnsafeDom(files);
  const globalListeners = detectGlobalListeners(files);
  const consoleLog = detectConsoleLog(files);
  const report = buildReport({ manifest, versions, samplePluginDefaults, versionsEntry, unsafeDom, globalListeners, consoleLog });

  return {
    report,
    scannedFileCount: files.length,
    manifestPath: manifestSourcePath ? relativeTo(root, manifestSourcePath) : null,
    versionsPath: versionsSourcePath ? relativeTo(root, versionsSourcePath) : null,
    additionalManifestPaths: manifestPaths.slice(1).map((p) => relativeTo(root, p)),
  };
}

function formatText(result) {
  const { report, scannedFileCount, manifestPath, versionsPath, additionalManifestPaths } = result;
  const lines = [];
  lines.push(`Scanned ${scannedFileCount} source file(s).`);
  lines.push(manifestPath ? `manifest.json: ${manifestPath}` : 'manifest.json: none found.');
  lines.push(versionsPath ? `versions.json: ${versionsPath}` : 'versions.json: none found.');
  if (additionalManifestPaths.length > 0) {
    lines.push(`Note: ${additionalManifestPaths.length} additional manifest.json file(s) found and not read: ${additionalManifestPaths.join(', ')} -- this tool checks one plugin per run.`);
  }
  lines.push('');

  if (!report.manifestFound) {
    lines.push('[X] No manifest.json found.');
  } else if (report.manifestParseError) {
    lines.push('[X] manifest.json is not valid JSON.');
  } else if (report.missingRequiredManifest.length > 0) {
    lines.push(`[X] manifest.json is missing required field(s): ${report.missingRequiredManifest.join(', ')}.`);
  } else {
    lines.push('[OK] manifest.json carries every required field (id, name, version, minAppVersion, description, author).');
  }
  if (report.missingRecommendedManifest.length > 0) {
    lines.push(`[i] manifest.json has no ${report.missingRecommendedManifest.join(', ')} field(s) -- optional, not a rejection cause on its own.`);
  }
  lines.push('');

  if (report.samplePluginDefaults.length > 0) {
    lines.push(`[X] manifest.json still carries the sample-plugin template's own placeholder value(s): ${report.samplePluginDefaults.map((d) => `${d.field}="${d.value}"`).join(', ')}. Reviewers reject an unmodified copy of the sample plugin.`);
  } else if (report.manifestFound && !report.manifestParseError) {
    lines.push('[OK] No sample-plugin template placeholder values found.');
  }
  lines.push('');

  if (report.versionsEntry.status === 'present') {
    lines.push(`[OK] versions.json has an entry for the current manifest version (${report.versionsEntry.version} -> minAppVersion ${report.versionsEntry.minAppVersion}).`);
  } else if (report.versionsEntry.status === 'missing') {
    lines.push(`[X] versions.json has no entry for the current manifest version (${report.versionsEntry.version}). Obsidian's release mechanism reads this file to decide which app versions can see the release -- a missing entry is one of the easiest release-blocking mistakes to introduce, because the two files live separately with nothing forcing them to move together.`);
  } else {
    lines.push('[?] versions.json entry not checked (manifest.json or versions.json was not found or not valid JSON).');
  }
  lines.push('');

  if (report.unsafeDom.length > 0) {
    lines.push(`[X] ${report.unsafeDom.length} line(s) assign innerHTML/outerHTML or call insertAdjacentHTML -- Obsidian's own developer guidelines name this pattern as a cross-site-scripting risk and recommend the DOM API or Obsidian's createEl/createSpan/createDiv helpers instead:`);
    for (const f of report.unsafeDom.slice(0, 20)) lines.push(`    ${f.path}:${f.line}  ${f.snippet}`);
    if (report.unsafeDom.length > 20) lines.push(`    ... and ${report.unsafeDom.length - 20} more`);
    lines.push('');
  }

  if (report.globalListeners.length > 0) {
    lines.push(`[i] ${report.globalListeners.length} line(s) call document/window.addEventListener directly. Obsidian's Component API's registerDomEvent removes a listener automatically when the plugin unloads; a direct call needs its own manual cleanup to avoid leaking one across reloads:`);
    for (const f of report.globalListeners.slice(0, 10)) lines.push(`    ${f.path}:${f.line}  ${f.snippet}`);
    if (report.globalListeners.length > 10) lines.push(`    ... and ${report.globalListeners.length - 10} more`);
    lines.push('');
  }

  if (report.consoleLog.length > 0) {
    lines.push(`[i] ${report.consoleLog.length} console.log() call(s) found -- a common first-review note, not a documented rejection cause on its own:`);
    for (const f of report.consoleLog.slice(0, 10)) lines.push(`    ${f.path}:${f.line}  ${f.snippet}`);
    if (report.consoleLog.length > 10) lines.push(`    ... and ${report.consoleLog.length - 10} more`);
    lines.push('');
  }

  lines.push(
    report.ok
      ? 'manifest.json and versions.json agree, no sample-plugin placeholders remain, and no innerHTML/outerHTML/insertAdjacentHTML pattern was found.'
      : 'This is evidence of what the manifest and source say -- not a determination that a community-plugin submission will be approved.',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { root: '.', manifest: null, versions: null, json: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--manifest') args.manifest = argv[++i];
    else if (argv[i] === '--versions') args.versions = argv[++i];
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

  const result = runCheck({ root: args.root, manifestOverride: args.manifest, versionsOverride: args.versions });

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
