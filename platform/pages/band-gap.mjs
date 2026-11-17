// Loads every tool page that carries the site band and measures the space
// between the band's bottom edge and the first thing a visitor sees below it.
//
// Why this exists
// ---------------
// The chrome stylesheet zeroes the venture body's top padding so the band meets
// the top edge. Measured on 2026-11-13, 123 of 1,354 band pages then drew their
// eyebrow or h1 0 to 2px under the band, or 3px into it, because that padding
// had been their only space above the first line. The build now gives those
// bands a 16px margin (`bodyTopPadded`, `data-pfs-gap`); this check finds the
// next page that hugs the band some other way (a linked stylesheet, a
// negative margin, a new venture template).
// Report: docs/reports/polish-2026-11-13-band-gap.md.
//
//   node platform/pages/build.mjs
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/band-gap.mjs                 # 1280 and 390, fails under 8px
//   WIDTH=390 MIN=12 node platform/pages/band-gap.mjs
//   SLUGS=status-keeper,kickstarter-fee-calculator node platform/pages/band-gap.mjs
//
// "First thing" is the first text whose parent is visible, or the first box
// with a border, shadow, a background narrower than the window, or a control.
// Skip links (`.skip`, `.sr`, `.sr-only`, `.visually-hidden`) are not content.
// Text is measured by its line box, so a large h1 with tight line-height can
// read a few px less than the space a reader sees.
//
// Not part of CI: it needs Playwright, which is not a dependency of this repo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');
const DIST = process.env.DIST || path.join(here, 'dist');
const WIDTHS = (process.env.WIDTH || '1280,390').split(',').map(Number);
const MIN = Number(process.env.MIN || 8);
const TABS = Number(process.env.TABS || 6);
const pwPath = process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.js';
const pw = (await import(pwPath)).default ?? (await import(pwPath));

function bandPages() {
  if (process.env.SLUGS) return process.env.SLUGS.split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
      else if (e.name === 'index.html' && rel) {
        const html = fs.readFileSync(path.join(dir, e.name), 'utf8');
        if (html.includes('class="pf-chrome pf-chrome-top"')) out.push(rel);
      }
    }
  };
  walk(DIST, '');
  return out.sort();
}

function measure() {
  const nav = document.querySelector('nav.pf-chrome-top[data-pfs-head]');
  if (!nav) return null;
  const bottom = nav.getBoundingClientRect().bottom;
  const SKIP = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'];
  const hidden = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.matches('.skip,.sr,.sr-only,.visually-hidden')) return true;
      const st = getComputedStyle(n);
      if (st.display === 'none' || st.visibility === 'hidden' || st.position === 'fixed') return true;
    }
    return false;
  };
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : '');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  walker.currentNode = nav;
  let n;
  while ((n = walker.nextNode())) {
    if (nav.contains(n)) continue;
    if (n.nodeType === 3) {
      const p = n.parentElement;
      if (!n.textContent.trim() || !p || SKIP.includes(p.tagName) || hidden(p)) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const box = r.getBoundingClientRect();
      if (!box.height) continue;
      return { gap: Math.round(box.top - bottom), first: `text in ${name(p)}` };
    }
    if (SKIP.includes(n.tagName) || hidden(n)) continue;
    const box = n.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const st = getComputedStyle(n);
    const bg = !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(st.backgroundColor) && box.width < innerWidth - 2;
    const edge = parseFloat(st.borderTopWidth) > 0 || st.boxShadow !== 'none';
    const control = /^(IMG|INPUT|SELECT|TEXTAREA|BUTTON|svg|CANVAS|VIDEO|HR)$/.test(n.tagName);
    if (bg || edge || control) return { gap: Math.round(box.top - bottom), first: name(n) };
  }
  return null;
}

const pages = bandPages();
if (!pages.length) {
  console.error(`band-gap: no band pages under ${DIST}`);
  process.exit(2);
}
const browser = await pw.chromium.launch();
const failures = [];
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  const queue = [...pages];
  const gaps = [];
  await Promise.all(Array.from({ length: TABS }, async () => {
    const page = await ctx.newPage();
    while (queue.length) {
      const slug = queue.shift();
      try {
        await page.goto(`${BASE}/${slug}/`, { waitUntil: 'load', timeout: 30000 });
        const r = await page.evaluate(measure);
        if (!r) continue;
        gaps.push(r.gap);
        if (r.gap < MIN) failures.push({ width, slug, ...r });
      } catch (e) {
        failures.push({ width, slug, gap: null, first: String(e).split('\n')[0] });
      }
    }
    await page.close();
  }));
  await ctx.close();
  gaps.sort((a, b) => a - b);
  console.log(`${width}px: ${gaps.length} pages, median ${gaps[gaps.length >> 1]}px, ${gaps.filter((g) => g < MIN).length} under ${MIN}px`);
}
await browser.close();
for (const f of failures) console.log(`  ${f.width}px ${f.slug}: ${f.gap === null ? 'error' : `${f.gap}px`} (${f.first})`);
process.exit(failures.length ? 1 : 0);
