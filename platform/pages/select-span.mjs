#!/usr/bin/env node
// Let a drop-down whose choices are longer than its grid column take the whole row.
//
// Why this exists
// ---------------
// Most tool forms lay their fields out two to a row (`.fields { display: grid;
// grid-template-columns: repeat(2, 1fr) }`). A native <select> cannot wrap, so
// a choice longer than half the form is cut under the arrow. Measured
// 2026-11-14 with `select-clip.mjs` on the 112 bid calculators and estimators
// that carry a select: 74 default choices cut at 1,280 px on 47 pages, all in
// such a column, about 228 px of text room. The visitor read "Hang only — slab
// on the existing jamb (the cheap spe", "Retrofit existing opening — swap the
// sash and the w", "Swap only — wax, set, hook the existing supply (the
// cheap sp" (docs/reports/polish-2026-11-14-select-span.md).
//
// The fix is a layout one, decided per field and written into the page, not
// guessed at run time: a script that widens a field after paint would shift the
// form under the visitor. This tool opens each page in a browser at 1,280 px,
// finds every select whose LONGEST option (not just the default: every choice
// should read in full) does not fit its box, walks up to the grid item that
// holds it in a two-column grid, and, when that item is a single field (one
// control and its label, never a region), writes a block into the venture's
// <head>:
//
//   <!-- select-span:start --> <style> ITEM { grid-column: 1 / -1 } </style> <!-- select-span:end -->
//
// A grid of one column (every phone layout here) is unchanged by the rule, so
// it only acts where there is a second column to give. When the spanned field
// would leave its left neighbour alone on a row with an empty cell beside it,
// the neighbour spans too (no holes, and no `grid-auto-flow: dense`, which
// would make the visual order differ from the tab order). Selectors are built
// from the select's id with `:has()` and checked to match exactly one element;
// a browser without `:has()` drops the rule and keeps today's layout.
//
// Rows a script builds inside an empty host (`<div id="surfaces"></div>`, the
// hosts `rows-reserve.mjs` finds) are skipped: a rule keyed to the first rows'
// ids misses rows a visitor adds.
//
// Grids of three or more columns are left alone: a full-row span there is
// heavier than the problem, and a partial span can leave holes that only
// `dense` packing would fill.
//
// What it does not fix: a choice longer than the whole form (a phone at 320 px,
// or a 500 px option). Only a shorter visible label does that.
//
// Usage:
//   node platform/pages/select-span.mjs [--write] [slug ...]
// Serves `ventures/` itself on a free port and blocks every other request.
// Without slugs it looks at every venture whose index.html has a <select>.
// Without --write it prints what it would write. Re-running replaces the
// block (and removes it when nothing needs a span any more). Not part of CI:
// it needs Playwright, which is not a dependency of this repo.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bareDivIds } from './rows-reserve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENTURES = path.resolve(HERE, '..', '..', 'ventures');
export const START = '<!-- select-span:start -->';
export const END = '<!-- select-span:end -->';
export const WIDTH = 1280;
const ARROW = 20; // as select-clip.mjs

/** The <head> block for these grid-item selectors, or '' when there are none. */
export function renderBlock(selectors) {
  if (!selectors.length) return '';
  return `  ${START}
  <style>
    /* A field whose longest choice is wider than its column takes the whole row, so the choice
       reads in full instead of being cut under the arrow. Written by platform/pages/select-span.mjs
       (docs/reports/polish-2026-11-14-select-span.md); re-run it after changing the options. */
    ${selectors.join(',\n    ')} { grid-column: 1 / -1; }
  </style>
  ${END}
`;
}

/** Put `block` into `html` just before </head>, replacing an earlier one; '' removes it. */
export function applyBlock(html, block) {
  const s = html.indexOf(START);
  if (s !== -1) {
    const e = html.indexOf(END, s);
    if (e === -1) throw new Error('select-span block has a start and no end');
    // Take the whole lines the old block sat on.
    const lineStart = html.lastIndexOf('\n', s) + 1;
    let lineEnd = html.indexOf('\n', e + END.length);
    lineEnd = lineEnd === -1 ? html.length : lineEnd + 1;
    html = html.slice(0, lineStart) + html.slice(lineEnd);
  }
  if (!block) return html;
  const h = html.indexOf('</head>');
  if (h === -1) throw new Error('no </head>');
  const at = html.lastIndexOf('\n', h) + 1;
  // `</style></head>` on one line: the block goes between them, never before the `</style>`.
  if (html.slice(at, h).trim()) return `${html.slice(0, h)}\n${block}${html.slice(h)}`;
  return html.slice(0, at) + block + html.slice(at);
}

// Runs in the page. Returns the selectors of the grid items to span.
function findSpans([arrow, hosts]) {
  const ctx = document.createElement('canvas').getContext('2d');
  const cols = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display !== 'grid' && cs.display !== 'inline-grid') return 0;
    return cs.gridTemplateColumns.split(' ').filter(Boolean).length;
  };
  const sel = (el) => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    return el.tagName.toLowerCase() + [...el.classList].map((c) => `.${CSS.escape(c)}`).join('');
  };
  // The grid item of a multi-column grid that holds `el`, or null.
  const gridItem = (el) => {
    for (let n = el; n.parentElement && n !== document.body; n = n.parentElement) {
      const c = cols(n.parentElement);
      if (c === 2) return n;
      if (c > 2) return null;
    }
    return null;
  };
  const selectorFor = (item, anchor) => {
    if (item.id) return `#${CSS.escape(item.id)}`;
    const parent = `${sel(item.parentElement)} > ${item.tagName.toLowerCase()}`;
    if (!anchor) return null;
    const has = anchor.parentElement === item ? `:has(> #${CSS.escape(anchor.id)})` : `:has(#${CSS.escape(anchor.id)})`;
    const s = parent + has;
    const hits = document.querySelectorAll(s);
    return hits.length === 1 && hits[0] === item ? s : null;
  };
  const CONTROLS = 'select, textarea, input:not([type=hidden])';
  const items = new Map(); // item -> selector
  for (const s of document.querySelectorAll('select[id]')) {
    if (!s.offsetParent || s.multiple || s.size > 1 || !s.options.length) continue;
    const cs = getComputedStyle(s);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    let need = 0;
    for (const o of s.options) need = Math.max(need, ctx.measureText(o.text.trim()).width);
    const avail = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      - (cs.appearance === 'none' ? 0 : arrow);
    if (need <= avail + 1) continue;
    const item = gridItem(s);
    if (!item || items.has(item)) continue;
    // A field, not a region: the item holds this one control (and a label), never a section.
    if (item.querySelectorAll(CONTROLS).length !== 1) continue;
    // A row a script built inside an empty host (`<div id="surfaces"></div>`, the rows-reserve
    // hosts): a rule keyed to row 1's ids would miss every row the visitor adds. Those want a
    // per-template fix (row-cards).
    if (hosts.some((h) => document.getElementById(h)?.contains(item))) continue;
    // Already the full row (a span the page set itself)?
    const g = item.parentElement.getBoundingClientRect();
    if (item.getBoundingClientRect().width >= g.width - 2) continue;
    const q = selectorFor(item, s);
    if (q) items.set(item, q);
  }
  return [...items.values()];
}

// Runs in the page with the spans applied. Returns selectors for left
// neighbours a span left alone on their row (an empty cell to their right).
function findHoles(spanSelectors) {
  const out = [];
  const spanned = new Set(spanSelectors.flatMap((q) => [...document.querySelectorAll(q)]));
  for (const item of spanned) {
    let prev = item.previousElementSibling;
    while (prev && (getComputedStyle(prev).display === 'none' || getComputedStyle(prev).position === 'absolute')) {
      prev = prev.previousElementSibling;
    }
    if (!prev || spanned.has(prev)) continue;
    if (prev.querySelectorAll('select, textarea, input:not([type=hidden])').length > 1) continue;
    const g = item.parentElement.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(item.parentElement).columnGap) || 0;
    const p = prev.getBoundingClientRect();
    const i = item.getBoundingClientRect();
    if (p.top < i.top - 1 && p.right < g.right - gap - 2) {
      if (prev.id) { out.push(`#${CSS.escape(prev.id)}`); continue; }
      const anchor = prev.querySelector('[id]');
      if (!anchor) continue;
      const parent = item.parentElement;
      const base = (parent.id ? `#${CSS.escape(parent.id)}` : parent.tagName.toLowerCase()
        + [...parent.classList].map((c) => `.${CSS.escape(c)}`).join('')) + ` > ${prev.tagName.toLowerCase()}`;
      const has = anchor.parentElement === prev ? `:has(> #${CSS.escape(anchor.id)})` : `:has(#${CSS.escape(anchor.id)})`;
      const q = base + has;
      const hits = document.querySelectorAll(q);
      if (hits.length === 1 && hits[0] === prev) out.push(q);
    }
  }
  return out;
}

function serve(root) {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
    '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    let f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
    try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch { /* 404 below */ }
    if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  let slugs = args.filter((a) => !a.startsWith('--'));
  if (!slugs.length) {
    slugs = fs.readdirSync(VENTURES).filter((d) => {
      const f = path.join(VENTURES, d, 'index.html');
      return fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('<select');
    }).sort();
  }
  const { default: pw } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.js');
  const server = await serve(VENTURES);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.route((u) => !u.toString().startsWith(origin), (r) => r.abort());
  let changed = 0;
  for (const slug of slugs) {
    const file = path.join(VENTURES, slug, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    // Measure the page as it would be without an old block, so a re-run starts clean.
    const bare = applyBlock(html, '');
    await page.route(`${origin}/${slug}/`, (r) => r.fulfill({ contentType: 'text/html', body: bare }));
    try {
      await page.goto(`${origin}/${slug}/`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(150);
    } catch { await page.unroute(`${origin}/${slug}/`); continue; }
    let spans = await page.evaluate(findSpans, [ARROW, bareDivIds(bare)]);
    for (let i = 0; i < 3 && spans.length; i++) {
      const tag = await page.addStyleTag({ content: `${spans.join(',')}{grid-column:1/-1}` });
      const holes = await page.evaluate(findHoles, spans);
      await tag.evaluate((n) => n.remove());
      if (!holes.length) break;
      spans = [...new Set([...spans, ...holes])];
    }
    await page.unroute(`${origin}/${slug}/`);
    const next = applyBlock(html, renderBlock(spans));
    if (next === html) continue;
    changed += 1;
    console.log(`${slug}: ${spans.length ? spans.join(', ') : '(block removed)'}`);
    if (write) fs.writeFileSync(file, next);
  }
  await browser.close();
  server.close();
  console.log(`${changed} page(s) ${write ? 'written' : 'would change'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
