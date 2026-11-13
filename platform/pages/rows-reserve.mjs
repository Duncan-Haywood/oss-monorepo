#!/usr/bin/env node
// Reserve the height of a tool's starting input rows before its script runs.
//
// Many bid calculators ship an empty `<div id="openings"></div>` and fill it
// with editable starting rows from a module script. Module scripts run after
// parsing, so the browser can paint the page with the host empty and then push
// everything below it down by the rows' height: a layout shift on every load
// (0.008 to 0.16 CLS at 1,280 px on 2026-11-13,
// docs/reports/polish-2026-11-13-rows-reserve.md).
//
// This script finds those hosts in a browser, measures each one's filled height
// across window widths, and writes a small block into the venture's <head>:
//
//   <!-- rows-reserve:start --> <style> min-height while empty </style>
//   <script> marks <html> ready on DOMContentLoaded </script> <!-- rows-reserve:end -->
//
// The reservation only applies while scripting is on, the host is empty and
// DOMContentLoaded has not fired (module scripts have run by then), so a page
// without JavaScript, or a visitor who removes every row, never sees a gap.
// Each band reserves the smallest height measured in it (and 24 px narrower,
// for a desktop scrollbar), so the rows never come in shorter than the space.
//
// Usage (serve ventures/ or the built dist/ first, e.g.
// `python3 -m http.server 8801 -d ventures`):
//   node platform/pages/rows-reserve.mjs --base http://127.0.0.1:8801 [--write] [slug ...]
// Without slugs it looks at every venture whose index.html has a bare
// `<div id="..."></div>`. Without --write it prints what it would write.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENTURES = path.resolve(HERE, '..', '..', 'ventures');

export const START = '<!-- rows-reserve:start -->';
export const END = '<!-- rows-reserve:end -->';
export const READY_CLASS = 'pf-rows-ready';
const BARE_DIV = /<div id="([A-Za-z][\w-]*)"><\/div>/g;
// Measured on 2026-11-13 with no change from the reservation: their shift
// comes from something else (a section revealed late, a canvas, a results
// table), so a block there would only be noise. See the report.
export const SKIP = new Set([
  'delivery-app-margin-calculator', 'hvac-load-calc', 'portable-restroom-event-quote', 'proposal-maker',
  'retainage-cashflow-calculator', 'shed-designer', 'str-host-payout-calculator',
]);

export function bareDivIds(html) {
  return [...html.matchAll(BARE_DIV)].map((m) => m[1]);
}

// samples: [[width, height], ...] ascending by width. Returns mobile-first
// bands [{ from, reserve }]; the first band's `from` is 0.
export function bands(samples, { tolerance = 24, maxBands = 6, scrollbar = 24 } = {}) {
  const at = (lo, hi) => Math.min(...samples.filter(([w]) => w >= lo && w <= hi).map(([, h]) => h));
  let out = [];
  for (const [w, h] of samples) {
    const last = out[out.length - 1];
    if (last && Math.abs(h - last.min) <= tolerance) { last.to = w; last.min = Math.min(last.min, h); continue; }
    out.push({ from: w, to: w, min: h });
  }
  while (out.length > maxBands) {
    let best = 1;
    for (let i = 2; i < out.length; i++) {
      if (Math.abs(out[i].min - out[i - 1].min) < Math.abs(out[best].min - out[best - 1].min)) best = i;
    }
    out[best - 1].to = out[best].to;
    out[best - 1].min = Math.min(out[best - 1].min, out[best].min);
    out.splice(best, 1);
  }
  return out.map((b, i) => ({
    from: i === 0 ? 0 : b.from,
    reserve: Math.max(0, Math.floor(at(i === 0 ? 0 : b.from - scrollbar, i === out.length - 1 ? Infinity : b.to))),
  }));
}

export function renderBlock(hosts) {
  // hosts: [{ id, bands: [{ from, reserve }] }]
  const rules = [];
  const byFrom = new Map();
  for (const { id, bands: bs } of hosts) {
    for (const b of bs) {
      if (!byFrom.has(b.from)) byFrom.set(b.from, []);
      byFrom.get(b.from).push(`html:not(.${READY_CLASS}) #${id}:empty{min-height:${b.reserve}px}`);
    }
  }
  for (const from of [...byFrom.keys()].sort((a, b) => a - b)) {
    const query = from === 0 ? '(scripting:enabled)' : `(scripting:enabled) and (min-width:${from}px)`;
    rules.push(`@media ${query}{${byFrom.get(from).join('')}}`);
  }
  return `${START}\n  <style>${rules.join('\n')}</style>\n`
    + `  <script>addEventListener('DOMContentLoaded',function(){document.documentElement.classList.add('${READY_CLASS}')})</script>\n  ${END}`;
}

export function writeBlock(html, block) {
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (re.test(html)) return html.replace(re, block);
  return html.replace(/\n?(\s*)<\/head>/, (m, ws) => `\n  ${block}\n${ws}</head>`);
}

async function main(argv) {
  const pw = (await import('/opt/node-tools/node_modules/playwright/index.js')).default;
  const base = argv[argv.indexOf('--base') + 1];
  if (!argv.includes('--base') || !base) throw new Error('--base <url serving ventures/ or dist/> is required');
  const write = argv.includes('--write');
  const named = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--base');
  const slugs = (named.length ? named : fs.readdirSync(VENTURES).filter((s) => !SKIP.has(s))).filter((s) => {
    try { return bareDivIds(fs.readFileSync(path.join(VENTURES, s, 'index.html'), 'utf8')).length > 0; } catch { return false; }
  });
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const origin = new URL(base).origin;
  await ctx.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
  const widths = [];
  for (let w = 320; w <= 1600; w += 4) widths.push(w);
  const queue = [...slugs];
  const found = [];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const slug = queue.shift();
      const file = path.join(VENTURES, slug, 'index.html');
      const ids = bareDivIds(fs.readFileSync(file, 'utf8'));
      const page = await ctx.newPage();
      try {
        await page.goto(`${base}/${slug}/`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(200);
        // A rows host: was empty in the source, now holds editable controls.
        const hostIds = await page.evaluate((ids) => ids.filter((id) => {
          const e = document.getElementById(id);
          return e && e.children.length && e.querySelector('input, select, textarea') && e.getBoundingClientRect().height > 0;
        }), ids);
        if (!hostIds.length) continue;
        const samples = Object.fromEntries(hostIds.map((id) => [id, []]));
        for (const w of widths) {
          await page.setViewportSize({ width: w, height: 900 });
          const hs = await page.evaluate((ids) => ids.map((id) => document.getElementById(id).getBoundingClientRect().height), hostIds);
          hostIds.forEach((id, i) => samples[id].push([w, hs[i]]));
        }
        const hosts = hostIds.map((id) => ({ id, bands: bands(samples[id]) }));
        found.push({ slug, hosts });
        const block = renderBlock(hosts);
        if (write) fs.writeFileSync(file, writeBlock(fs.readFileSync(file, 'utf8'), block));
        console.log(`${slug}: ${hosts.map((h) => `#${h.id} ${h.bands.map((b) => `${b.from}+:${b.reserve}`).join(' ')}`).join('; ')}`);
      } catch (err) {
        console.log(`${slug}: failed (${String(err).split('\n')[0]})`);
      } finally {
        await page.close();
      }
    }
  }));
  await browser.close();
  console.log(`${found.length} venture(s) with starting rows${write ? ', written' : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => { console.error(err.message); process.exit(1); });
}
