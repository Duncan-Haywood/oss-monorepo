// Finds drop-downs whose chosen option does not fit the box that shows it.
//
// Why this exists
// ---------------
// A native <select> cannot wrap. When its option text is wider than the box,
// the browser cuts it mid-word under the arrow: "windo", "Fron", "8 ft wall
// (92-5/8" precu". Nothing else here notices. axe has no rule for it,
// `sideways.mjs` only sees the page's width, and the text is all there in the
// DOM, so every file check passes. Measured 2026-11-14 on the built site: of
// 606 pages with a select, 139 cut a default choice at 390px and 192 at
// 1,280px, 379 selects in all at the wider width
// (docs/reports/polish-2026-11-14-select-clip.md).
//
// The measure: for every visible single-line select, the width of its
// selected option's text in the select's own computed font (canvas
// measureText) against the select's client width less its horizontal padding
// and 20px for the native arrow. That is the default option on a fresh load,
// which is what a first-time visitor sees. A select under 90px wide whose text
// does not fit is counted as "crushed": that is the table-cell case
// `select-fit.mjs` fixes in the shared chrome.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   node platform/pages/select-clip.mjs                      # every page with a <select>, 390 and 1280
//   WIDTH=320,390 node platform/pages/select-clip.mjs
//   ONLY=wall-framing-takeoff,service-load-check node platform/pages/select-clip.mjs
//   JSON=out.json node platform/pages/select-clip.mjs        # the full list, for a report
//
// It serves `platform/pages/dist` itself on a free port, so there is no stale
// server to be fooled by (the trap `sideways.mjs` documents). It blocks every
// request that leaves that server. About 90 seconds for the 606 pages at two
// widths in a cloud session. Not part of CI: it needs Playwright, which is not
// a dependency of this repo. It reports; it does not fail on a count, because
// a page-level fix (a wider track, a shorter label) is a judgement per page.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARROW = 20; // px a native select keeps for its arrow, Chromium and Firefox.
export const CRUSHED_PX = 90;

/** Does `textWidth` overflow a select box with these computed metrics? */
export function clipped({ textWidth, clientWidth, paddingLeft, paddingRight, appearance }) {
  const avail = clientWidth - paddingLeft - paddingRight - (appearance === 'none' ? 0 : ARROW);
  return textWidth > avail + 1;
}

/** Per width: pages with a clipped select, clipped selects, and crushed ones. */
export function summarise(rows) {
  const out = {};
  for (const r of rows) {
    const s = (out[r.width] ||= { pages: 0, selects: 0, crushed: 0 });
    s.pages += 1;
    s.selects += r.clip.length;
    s.crushed += r.clip.filter((c) => c.w < CRUSHED_PX).length;
  }
  return out;
}

// Runs in the page, so it cannot import clipped(); it repeats that arithmetic,
// and select-fit.test.mjs tests clipped().
function measureInPage(arrow) {
  const ctx = document.createElement('canvas').getContext('2d');
  const out = [];
  for (const s of document.querySelectorAll('select')) {
    if (!s.offsetParent || s.multiple || s.size > 1) continue;
    const o = s.options[s.selectedIndex];
    if (!o) continue;
    const cs = getComputedStyle(s);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const need = ctx.measureText(o.text.trim()).width;
    const avail = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      - (cs.appearance === 'none' ? 0 : arrow);
    if (need > avail + 1) {
      out.push({ id: s.id || s.name || '', text: o.text.trim().slice(0, 60),
        need: Math.round(need), avail: Math.round(avail), w: s.clientWidth });
    }
  }
  return out;
}

function pagesWithSelect(dist, only) {
  const out = [];
  for (const d of fs.readdirSync(dist).sort()) {
    if (only && !only.has(d)) continue;
    const f = path.join(dist, d, 'index.html');
    if (fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('<select')) out.push(`/${d}/`);
  }
  return out;
}

function serve(dist) {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
    '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    let f = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(dist)) { res.writeHead(403); res.end(); return; }
    try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch { /* 404 below */ }
    if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function main() {
  const dist = path.resolve(process.env.DIST || path.join(HERE, 'dist'));
  const widths = (process.env.WIDTH || '390,1280').split(',').map(Number);
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const pages = pagesWithSelect(dist, only);
  const { default: pw } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.js');
  const server = await serve(dist);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await pw.chromium.launch();
  const rows = [];
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.route((u) => !u.toString().startsWith(origin), (r) => r.abort());
    for (const p of pages) {
      try { await page.goto(origin + p, { waitUntil: 'load', timeout: 15000 }); } catch { continue; }
      const clip = await page.evaluate(measureInPage, ARROW);
      if (clip.length) rows.push({ page: p, width, clip });
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(rows, null, 1));
  const totals = {};
  for (const r of rows) totals[r.page] = (totals[r.page] || 0) + r.clip.length;
  console.log(`${pages.length} page(s) with a <select>`);
  for (const [w, s] of Object.entries(summarise(rows))) {
    console.log(`  ${w}px: ${s.pages} page(s) cut a chosen option; ${s.selects} select(s), ${s.crushed} under ${CRUSHED_PX}px`);
  }
  console.log('Most clipped selects (both widths):');
  for (const [p, n] of Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${n}\t${p}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
