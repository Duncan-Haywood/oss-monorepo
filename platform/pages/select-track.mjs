#!/usr/bin/env node
// Widen a responsive grid's columns just enough for the longest drop-down choice in it.
//
// Why this exists
// ---------------
// About 170 tools lay their settings out in a responsive grid,
// `.grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)) }`: four
// columns of about 228 px on a laptop, one column on a phone. A native <select>
// cannot wrap, so a choice longer than about 186 px of text is cut under the
// arrow: "Send away or rebook (no revenue, go", "Month first (03/04 = Ma",
// "Orders or conversions (cou". Measured 2026-11-14 on `ventures/` at 1,280 px:
// 442 selects with a choice cut, 280 of them in a four-column grid, nearly all
// of those auto-fit grids (docs/reports/polish-2026-11-14-select-track.md).
//
// `select-span.mjs` fixes two-column grids by giving the field the whole row. In
// a four-column grid that is heavier than the problem, and a partial span
// (`span 2`) leaves a hole whenever the field falls in the last column, which
// only `grid-auto-flow: dense` would fill, at the cost of a visual order that
// differs from the tab order. These grids already say what they want: "as many
// columns as fit, each at least 220 px". The fix is to raise that minimum to
// what the longest choice needs, for that one grid. Every field keeps its
// place and order, there are no holes, and the grid still reflows at every
// width; it just shows three columns where it showed four.
//
// What it writes, per page, decided offline (no script, no shift after paint):
//
//   <!-- select-track:start -->
//   <style>@media (min-width: Bpx) { GRID { grid-template-columns:
//     repeat(auto-fit, minmax(min(100%, Npx), 1fr)); } }</style>
//   <!-- select-track:end -->
//
// N is the widest choice's text plus the select's padding, border, arrow and
// whatever the grid item adds around it. B is the narrowest tested viewport
// from which the page's own grid always has two or more columns, so a page
// that forces one column on phones (`@media (max-width: 720px) { .grid {
// grid-template-columns: 1fr } }`) keeps that. GRID is `div.grid:has(#id)`
// keyed to a select in it and checked to match exactly that one grid; a
// browser without `:has()` drops the rule and keeps today's layout.
//
// It only touches grids whose own rule is `repeat(auto-fit|auto-fill,
// minmax(...))`: a fixed `repeat(3, 1fr)` row usually means "these three go
// together". A choice so long that its track would leave the grid a single
// column at 1,280 px is left cut (one long choice should not turn a form into
// a list; that wants a shorter label), and the grid is widened for its other
// cut choices only. Grids inside an empty script host are skipped (the
// rows-reserve hosts, as select-span does). After writing the rule in the
// page it checks, at every tested width, that the grid never has more columns
// than before and that the cut selects in it now fit at 1,280 px; a grid that
// fails is left out.
//
// Usage:
//   node platform/pages/select-track.mjs [--write] [slug ...]
// Serves `ventures/` itself on a free port and blocks every other request.
// Without slugs it looks at every venture whose index.html has a <select>.
// Without --write it prints what it would write. Re-running replaces the block
// (and removes it when nothing needs it). Not part of CI: it needs Playwright,
// which is not a dependency of this repo.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bareDivIds } from './rows-reserve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENTURES = path.resolve(HERE, '..', '..', 'ventures');
export const START = '<!-- select-track:start -->';
export const END = '<!-- select-track:end -->';
export const WIDTH = 1280;
export const WIDTHS = Array.from({ length: (WIDTH - 320) / 20 + 1 }, (_, i) => 320 + i * 20);
const ARROW = 20; // as select-clip.mjs

/** The rule for one grid: { selector, min (px), from (px viewport) }. */
export function renderRule({ selector, min, from }) {
  return `@media (min-width: ${from}px) { ${selector} { grid-template-columns: repeat(auto-fit, minmax(min(100%, ${min}px), 1fr)); } }`;
}

/** The <head> block for these grids, or '' when there are none. */
export function renderBlock(grids) {
  if (!grids.length) return '';
  return `  ${START}
  <style>
    /* A grid whose longest drop-down choice is wider than its column gets columns wide enough for
       it, so the choice reads in full instead of being cut under the arrow. Written by
       platform/pages/select-track.mjs (docs/reports/polish-2026-11-14-select-track.md); re-run it
       after changing the options. */
    ${grids.map(renderRule).join('\n    ')}
  </style>
  ${END}
`;
}

/** Put `block` into `html` just before </head>, replacing an earlier one; '' removes it. */
export function applyBlock(html, block) {
  const s = html.indexOf(START);
  if (s !== -1) {
    const e = html.indexOf(END, s);
    if (e === -1) throw new Error('select-track block has a start and no end');
    const lineStart = html.lastIndexOf('\n', s) + 1;
    let lineEnd = html.indexOf('\n', e + END.length);
    lineEnd = lineEnd === -1 ? html.length : lineEnd + 1;
    html = html.slice(0, lineStart) + html.slice(lineEnd);
  }
  if (!block) return html;
  const h = html.indexOf('</head>');
  if (h === -1) throw new Error('no </head>');
  const at = html.lastIndexOf('\n', h) + 1;
  if (html.slice(at, h).trim()) return `${html.slice(0, h)}\n${block}${html.slice(h)}`;
  return html.slice(0, at) + block + html.slice(at);
}

// Runs in the page at 1,280 px. Returns one entry per grid to widen:
// { selector, min, ids } where ids are the cut selects in it.
export function findGrids([arrow, hosts]) {
  const ctx = document.createElement('canvas').getContext('2d');
  const cols = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display !== 'grid' && cs.display !== 'inline-grid') return 0;
    return cs.gridTemplateColumns.split(' ').filter((t) => parseFloat(t) > 0).length;
  };
  const sel = (el) => el.tagName.toLowerCase() + [...el.classList].map((c) => `.${CSS.escape(c)}`).join('');
  // Does a top-level style rule that matches this grid declare an auto-fit/auto-fill track?
  const responsive = (grid) => {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) {
        if (!(r instanceof CSSStyleRule)) continue;
        const t = r.style.gridTemplateColumns || '';
        if (!/auto-fi(t|ll)/.test(t)) continue;
        try { if (grid.matches(r.selectorText)) return true; } catch { /* odd selector */ }
      }
    }
    return false;
  };
  const grids = new Map(); // grid -> [{ id, min }] for its cut selects
  for (const s of document.querySelectorAll('select[id]')) {
    if (!s.offsetParent || s.multiple || s.size > 1 || !s.options.length) continue;
    const cs = getComputedStyle(s);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    let need = 0;
    for (const o of s.options) need = Math.max(need, ctx.measureText(o.text.trim()).width);
    const avail = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      - (cs.appearance === 'none' ? 0 : arrow);
    if (need <= avail + 1) continue;
    let item = null;
    for (let n = s; n.parentElement && n !== document.body; n = n.parentElement) {
      if (cols(n.parentElement) >= 2) { item = n; break; }
    }
    if (!item) continue;
    const grid = item.parentElement;
    if (cols(grid) < 3) continue; // two columns: select-span.mjs
    if (hosts.some((h) => document.getElementById(h)?.contains(grid))) continue;
    if (!responsive(grid)) continue;
    // What the column has to be: the choice, plus everything between it and the column's edge.
    const min = Math.ceil(need + (item.getBoundingClientRect().width - avail)) + 2;
    const g = grids.get(grid) || [];
    g.push({ id: s.id, min });
    grids.set(grid, g);
  }
  const out = [];
  for (const [grid, g] of grids) {
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const width = grid.clientWidth - parseFloat(getComputedStyle(grid).paddingLeft) - parseFloat(getComputedStyle(grid).paddingRight);
    // A choice that would leave the grid one column is a label problem, not a track one: leave
    // it cut, and widen for the others in the grid.
    const fits = g.filter((x) => 2 * x.min + gap <= width);
    if (!fits.length) continue;
    const min = Math.max(...fits.map((x) => x.min));
    const anchor = document.getElementById(fits[0].id);
    const base = grid.id ? `#${CSS.escape(grid.id)}` : sel(grid);
    const selector = grid.id ? base : `${base}:has(#${CSS.escape(anchor.id)})`;
    const hits = document.querySelectorAll(selector);
    if (hits.length !== 1 || hits[0] !== grid) continue;
    out.push({ selector, min, ids: fits.map((x) => x.id) });
  }
  return out;
}

// Runs in the page: column counts for each selector.
function countCols(selectors) {
  return selectors.map((q) => {
    const el = document.querySelector(q);
    if (!el) return -1;
    return getComputedStyle(el).gridTemplateColumns.split(' ').filter((t) => parseFloat(t) > 0).length;
  });
}

// Runs in the page: ids of selects whose longest choice still does not fit.
function stillCut([arrow, ids]) {
  const ctx = document.createElement('canvas').getContext('2d');
  return ids.filter((id) => {
    const s = document.getElementById(id);
    const cs = getComputedStyle(s);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    let need = 0;
    for (const o of s.options) need = Math.max(need, ctx.measureText(o.text.trim()).width);
    const avail = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      - (cs.appearance === 'none' ? 0 : arrow);
    return need > avail + 1;
  });
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
  let fixed = 0;
  for (const slug of slugs) {
    const file = path.join(VENTURES, slug, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const bare = applyBlock(html, '');
    const url = `${origin}/${slug}/`;
    await page.route(url, (r) => r.fulfill({ contentType: 'text/html', body: bare }));
    await page.setViewportSize({ width: WIDTH, height: 900 });
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(150);
    } catch { await page.unroute(url); continue; }
    let grids = await page.evaluate(findGrids, [ARROW, bareDivIds(bare)]);
    if (grids.length) {
      // The page's own column counts at every width, then where each grid has two or more for good.
      const before = [];
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        before.push(await page.evaluate(countCols, grids.map((g) => g.selector)));
      }
      grids = grids.map((g, i) => {
        let from = WIDTH;
        for (let k = WIDTHS.length - 1; k >= 0 && before[k][i] >= 2; k--) from = WIDTHS[k];
        return { ...g, from, i };
      }).filter((g) => g.from < WIDTH);
      // Apply, then check: never more columns than before, and the cut selects fit at 1,280.
      const tag = await page.addStyleTag({ content: grids.map(renderRule).join('\n') });
      const bad = new Set();
      for (let k = 0; k < WIDTHS.length; k++) {
        await page.setViewportSize({ width: WIDTHS[k], height: 900 });
        const now = await page.evaluate(countCols, grids.map((g) => g.selector));
        grids.forEach((g, j) => { if (now[j] > before[k][g.i]) bad.add(j); });
      }
      for (let j = 0; j < grids.length; j++) {
        if (bad.has(j)) continue;
        const left = await page.evaluate(stillCut, [ARROW, grids[j].ids]);
        if (left.length) bad.add(j);
      }
      await tag.evaluate((n) => n.remove());
      for (const j of bad) console.log(`${slug}: skipped ${grids[j].selector} (check failed)`);
      grids = grids.filter((_, j) => !bad.has(j));
    }
    await page.unroute(url);
    const next = applyBlock(html, renderBlock(grids.map(({ selector, min, from }) => ({ selector, min, from }))));
    if (next === html) continue;
    changed += 1;
    fixed += grids.reduce((n, g) => n + g.ids.length, 0);
    console.log(`${slug}: ${grids.length ? grids.map((g) => `${g.selector} ≥${g.min}px from ${g.from}px (${g.ids.join(' ')})`).join('; ') : '(block removed)'}`);
    if (write) fs.writeFileSync(file, next);
  }
  await browser.close();
  server.close();
  console.log(`${changed} page(s) ${write ? 'written' : 'would change'}; ${fixed} select(s) read in full at ${WIDTH}px`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
