#!/usr/bin/env node
// Page weight of a built site: what a visitor downloads for each HTML page
// before any image, and how much of the site Cloudflare serves through
// Worker code (the shard directories) rather than as plain static files.
//
//   node platform/pages/page-weight.mjs dist            # report
//   node platform/pages/page-weight.mjs dist --json     # machine-readable
//   node platform/pages/page-weight.mjs dist --budget=150000 --strict
//
// Advice, not a gate: it exits 0 unless --strict is given and a page is over
// the budget. Owner, 2026-11-06: "Lots of downtimes and painfully slow load
// speeds needs to be fixed." Baseline: docs/reports/2026-11-06-site-performance-baseline.md.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { SHARD_DIRS } from './cloudflare/router.mjs';

/** Bytes of a page that are inline <script> and <style> blocks. */
export function inlineBytes(html) {
  let script = 0;
  let style = 0;
  for (const m of html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)) script += Buffer.byteLength(m[0]);
  for (const m of html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)) style += Buffer.byteLength(m[0]);
  return { script, style };
}

export function quantile(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

async function* walk(dir, rel = '') {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(path.join(dir, e.name), r);
    else if (e.isFile()) yield r;
  }
}

/** Measure a built site directory. */
export async function measure(dir, { budget = 150000, top = 15 } = {}) {
  const pages = [];
  let files = 0;
  let shardFiles = 0;
  for await (const rel of walk(dir)) {
    files += 1;
    if (SHARD_DIRS.some((d) => rel.startsWith(`${d}/`))) shardFiles += 1;
    if (!rel.endsWith('.html')) continue;
    const buf = await fs.readFile(path.join(dir, rel));
    const html = buf.toString('utf8');
    pages.push({
      path: rel,
      bytes: buf.length,
      gzip: zlib.gzipSync(buf, { level: 6 }).length,
      ...inlineBytes(html),
    });
  }
  pages.sort((a, b) => b.bytes - a.bytes);
  const sizes = pages.map((p) => p.bytes).sort((a, b) => a - b);
  return {
    files,
    shard_files: shardFiles,
    shard_dirs: SHARD_DIRS,
    html_pages: pages.length,
    budget,
    over_budget: pages.filter((p) => p.bytes > budget).length,
    median: quantile(sizes, 0.5),
    p90: quantile(sizes, 0.9),
    p99: quantile(sizes, 0.99),
    heaviest: pages.slice(0, top),
  };
}

function kb(n) {
  return `${(n / 1000).toFixed(0)} kB`;
}

export function format(r) {
  const lines = [
    `${r.html_pages} HTML pages, ${r.files} files; ${r.shard_files} files (${((100 * r.shard_files) / Math.max(1, r.files)).toFixed(0)}%) are under ${r.shard_dirs.join(', ')} and run Worker code on every request.`,
    `HTML size: median ${kb(r.median)}, p90 ${kb(r.p90)}, p99 ${kb(r.p99)}; ${r.over_budget} page(s) over the ${kb(r.budget)} budget.`,
    '',
    'Heaviest pages (raw, gzip, inline script, inline style):',
  ];
  for (const p of r.heaviest) {
    lines.push(`  ${kb(p.bytes).padStart(8)} ${kb(p.gzip).padStart(8)} ${kb(p.script).padStart(8)} ${kb(p.style).padStart(8)}  /${p.path.replace(/index\.html$/, '')}`);
  }
  return lines.join('\n');
}

async function main(argv) {
  const dir = argv.find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('usage: page-weight.mjs <dist> [--json] [--budget=BYTES] [--strict]');
    return 2;
  }
  const budgetArg = argv.find((a) => a.startsWith('--budget='));
  const budget = budgetArg ? Number(budgetArg.split('=')[1]) : 150000;
  const r = await measure(dir, { budget });
  console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : format(r));
  return argv.includes('--strict') && r.over_budget > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
