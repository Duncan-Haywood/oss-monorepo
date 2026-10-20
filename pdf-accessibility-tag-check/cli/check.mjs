#!/usr/bin/env node
// CLI: reads one or more local PDF files (or every .pdf under a directory)
// and prints an accessibility-structure evidence report for each. Nothing
// is uploaded anywhere -- the file never leaves this process.
//
//   node cli/check.mjs report.pdf
//   node cli/check.mjs ./document-library/ --json
//   node cli/check.mjs a.pdf b.pdf --json
//
// Exit code 0 when every file parsed and none has a "danger"-severity
// finding; 1 when at least one file has a danger finding, could not be
// parsed, or could not be read.
//
// Lives in cli/, not the venture root, so the front-door mirror -- which
// walks only the venture's top-level directory -- never picks this up: the
// browser page doesn't need a Node CLI entry point, and every byte here is
// spent against the mirror's MIRROR_BYTE_CEILING for nothing a visitor can
// use. See gitops/tests/test_front_door_serving.py.

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { analyzePdf } from '../engine.mjs';
import { inflate } from './inflate-node.mjs';

async function collectPdfPaths(inputs) {
  const out = [];
  for (const input of inputs) {
    // eslint-disable-next-line no-await-in-loop
    const st = await stat(input).catch(() => null);
    if (!st) { out.push({ path: input, missing: true }); continue; }
    if (st.isDirectory()) {
      // eslint-disable-next-line no-await-in-loop
      const entries = await readdir(input, { withFileTypes: true, recursive: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
          const dir = entry.parentPath ?? entry.path ?? input;
          out.push({ path: path.join(dir, entry.name), missing: false });
        }
      }
    } else {
      out.push({ path: input, missing: false });
    }
  }
  return out;
}

function formatText(filePath, report) {
  const lines = [`${filePath}`];
  if (!report.parsed) {
    lines.push(`  ${report.findings[0].detail}`);
    return lines.join('\n');
  }
  lines.push(`  ${report.pageCount} page(s), ${report.stats.totalImages} image(s), ` +
    `${report.stats.widgetCount} form field widget(s)`);
  if (report.findings.length === 0 && report.notes.length === 0) {
    lines.push('  No findings from these automated checks.');
  }
  for (const f of [...report.findings, ...report.notes]) {
    const mark = f.severity === 'danger' ? '!!' : f.severity === 'notice' ? '--' : '..';
    lines.push(`  ${mark} [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`       ${f.detail}`);
    lines.push(`       evidence: ${f.evidence}`);
  }
  return lines.join('\n');
}

export async function runCheck(filePath) {
  const bytes = new Uint8Array(await readFile(filePath));
  return analyzePdf(bytes, { inflate });
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const inputs = argv.filter((a) => a !== '--json');
  if (inputs.length === 0) {
    console.error('Usage: node check.mjs <file.pdf | directory> [more...] [--json]');
    process.exit(2);
  }

  const files = await collectPdfPaths(inputs);
  if (files.length === 0) {
    console.error('No .pdf files found in the given path(s).');
    process.exit(2);
  }

  const results = [];
  let anyDanger = false;
  for (const { path: filePath, missing } of files) {
    if (missing) {
      results.push({ path: filePath, error: 'not found' });
      anyDanger = true;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const report = await runCheck(filePath).catch((err) => ({ parsed: false, findings: [{ severity: 'danger', detail: `Could not read file: ${err.message}` }] }));
    results.push({ path: filePath, report });
    if (!report.ok) anyDanger = true;
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      if (r.error) { console.log(`${r.path}\n  ${r.error}`); }
      else console.log(formatText(r.path, r.report));
      console.log('');
    }
    console.log(
      'This is evidence from a PDF\'s internal structure (tags, title, language, alt text, form-field ' +
      'labels), not a certification of PDF/UA or Section 508 conformance -- see README.md for what these ' +
      'checks do and do not cover, and have a human confirm any finding before relying on it.',
    );
  }
  process.exit(anyDanger ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
