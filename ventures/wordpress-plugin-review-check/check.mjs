#!/usr/bin/env node
// CLI: scans a WordPress plugin's source tree for the patterns behind common
// wordpress.org Plugin Directory review rejections. Run locally or as a step
// in your own CI -- nothing here makes a network call or reads anything
// outside the path you point it at.
//
//   node check.mjs [path] [--readme <file>] [--plugin-file <file>] [--json]
//
// Exit code 0 when a readme.txt and a plugin header were found, the readme's
// Stable tag matches the plugin header's Version (or is deliberately
// "trunk"), every required readme/header field is present, no line echoes a
// superglobal with no escaping function, and no file reads $_POST with no
// nonce-verification call anywhere in it; 1 otherwise. That makes it usable
// as a CI gate: `node check.mjs . || exit 1`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import {
  parseReadme,
  findPluginHeaderFile,
  parsePluginHeader,
  detectUnescapedOutput,
  detectMissingNonceChecks,
  buildReport,
} from './scan.mjs';

const PHP_EXTENSIONS = new Set(['.php']);
const README_NAME = 'readme.txt';
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', '.wordpress-org', 'languages',
]);

function isSkippableDir(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

/** Walks `root`, returning PHP source files and every readme.txt found. */
export function collectFiles(root) {
  const sourceFiles = [];
  const readmePaths = [];

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
      if (entry.name.toLowerCase() === README_NAME) {
        readmePaths.push(full);
      } else if (PHP_EXTENSIONS.has(extname(entry.name))) {
        sourceFiles.push(full);
      }
    }
  }

  walk(root);
  return { sourceFiles, readmePaths };
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
export function runCheck({ root, readmeOverride, pluginFileOverride }) {
  const { sourceFiles, readmePaths } = collectFiles(root);
  const files = readFilesAsRecords(sourceFiles, root);

  let readmeSourcePath = null;
  let readmeText = null;
  if (readmeOverride) {
    readmeSourcePath = readmeOverride;
    readmeText = tryRead(readmeOverride);
  } else if (readmePaths.length > 0) {
    readmeSourcePath = readmePaths[0];
    readmeText = tryRead(readmePaths[0]);
  }
  const readme = parseReadme(readmeText);

  let headerFile = null;
  if (pluginFileOverride) {
    headerFile = { path: relativeTo(root, pluginFileOverride), content: tryRead(pluginFileOverride) ?? '' };
  } else {
    headerFile = findPluginHeaderFile(files);
  }
  const pluginHeader = parsePluginHeader(headerFile);

  const unescapedOutput = detectUnescapedOutput(files);
  const missingNonceChecks = detectMissingNonceChecks(files);
  const report = buildReport({ readme, pluginHeader, unescapedOutput, missingNonceChecks });

  return {
    report,
    scannedFileCount: files.length,
    readmePath: readmeSourcePath ? relativeTo(root, readmeSourcePath) : null,
    additionalReadmePaths: readmePaths.slice(1).map((p) => relativeTo(root, p)),
  };
}

function formatText(result) {
  const { report, scannedFileCount, readmePath, additionalReadmePaths } = result;
  const lines = [];
  lines.push(`Scanned ${scannedFileCount} PHP file(s).`);
  lines.push(readmePath ? `readme.txt: ${readmePath}` : 'readme.txt: none found.');
  if (additionalReadmePaths.length > 0) {
    lines.push(`Note: ${additionalReadmePaths.length} additional readme.txt file(s) found and not read: ${additionalReadmePaths.join(', ')} -- this tool checks one readme per run.`);
  }
  lines.push(
    report.pluginHeaderPath
      ? `Plugin header found in: ${report.pluginHeaderPath}`
      : 'Plugin header: none found (no "Plugin Name:" line in any scanned PHP file).',
  );
  lines.push('');

  if (report.stableTagStatus === 'match') {
    lines.push(`[OK] Stable tag (${basename(readmePath ?? 'readme.txt')}) matches Version (${report.pluginHeaderPath ?? 'plugin header'}).`);
  } else if (report.stableTagStatus === 'trunk') {
    lines.push('[i] Stable tag is "trunk" -- the directory always serves the latest commit; no version to compare.');
  } else if (report.stableTagStatus === 'mismatch') {
    lines.push(`[X] Stable tag mismatch: readme.txt says "${report.stableTagMismatch.stableTag}", the plugin header says "${report.stableTagMismatch.pluginVersion}". A mismatch here is one of the most common Plugin Directory review notes -- the directory serves whatever version Stable tag names, so a stale tag ships an old build even after you upload a new one.`);
  } else {
    lines.push('[?] Stable tag not checked (readme.txt or the plugin header Version field was not found).');
  }
  lines.push('');

  if (report.missingRequiredReadme.length > 0) {
    lines.push(`[X] readme.txt is missing required field(s): ${report.missingRequiredReadme.join(', ')}. License and License URI are hard requirements for a directory submission (a GPL-compatible license must be declared); Stable tag is what the directory serves.`);
  }
  if (report.missingRecommendedReadme.length > 0) {
    lines.push(`[i] readme.txt has no ${report.missingRecommendedReadme.join(', ')} field(s) -- recommended, not a rejection cause on its own.`);
  }
  if (report.missingRequiredHeader.length > 0) {
    lines.push(`[X] Plugin header is missing required field(s): ${report.missingRequiredHeader.join(', ')}. Plugin Name is what WordPress needs to list the plugin at all.`);
  }
  if (report.missingRecommendedHeader.length > 0) {
    lines.push(`[i] Plugin header has no ${report.missingRecommendedHeader.join(', ')} field(s) -- recommended, not a rejection cause on its own.`);
  }
  lines.push('');

  if (report.unescapedOutput.length > 0) {
    lines.push(`[X] ${report.unescapedOutput.length} line(s) echo a $_GET/$_POST/$_REQUEST/$_COOKIE/$_SERVER value with no escaping function (esc_html, esc_attr, sanitize_text_field, absint, ...) called on the same line:`);
    for (const f of report.unescapedOutput.slice(0, 20)) lines.push(`    ${f.path}:${f.line}  ${f.snippet}`);
    if (report.unescapedOutput.length > 20) lines.push(`    ... and ${report.unescapedOutput.length - 20} more`);
    lines.push('');
  }

  if (report.missingNonceChecks.length > 0) {
    lines.push(`[X] ${report.missingNonceChecks.length} file(s) read $_POST with no nonce-verification call (check_admin_referer, check_ajax_referer, wp_verify_nonce) anywhere in the file:`);
    for (const f of report.missingNonceChecks) lines.push(`    ${f.path}:${f.line}  ${f.snippet}`);
    lines.push('');
  }

  lines.push(
    report.ok
      ? 'Stable tag matches, required fields are present, and no unescaped-output or missing-nonce pattern was found.'
      : 'This is evidence of what the code and metadata say -- not a determination that Plugin Review will pass.',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { root: '.', readme: null, pluginFile: null, json: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--readme') args.readme = argv[++i];
    else if (argv[i] === '--plugin-file') args.pluginFile = argv[++i];
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

  const result = runCheck({ root: args.root, readmeOverride: args.readme, pluginFileOverride: args.pluginFile });

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
