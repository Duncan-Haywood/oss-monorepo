// Loads every tool page with a sticky element on a short desktop window and
// checks that no stuck card runs past the window's bottom edge.
//
// Why this exists
// ---------------
// On 2026-11-11, 122 of the 193 sticky result cards on a 1280x800 window were
// taller than the window and had room to travel, so their lower part (copy
// buttons, the hour split, the notes) could not be reached while the card was
// stuck. pf-site.js now caps such a card and lets it scroll inside
// (sticky-fit.mjs, pinned by sticky-fit.test.mjs). This is the browser half
// over the real pages: it catches a page whose own CSS defeats the cap (an
// `overflow: visible !important`, a `max-height` that wins) or a sticky card
// pf-site.js never sees.
//
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/sticky-fit-check.mjs
//
// Same BASE_URL / DIST / PLAYWRIGHT / CHROME_PATH variables as sideways.mjs.
// HEIGHT sets the window height (default 800) and ONLY_SLUGS a comma list.
// Exits 1 listing each page whose stuck card is cut off.
// Not part of CI: Playwright is not a dependency of this repo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const loaded = await import(process.env.PLAYWRIGHT || 'playwright');
const playwright = loaded.chromium ? loaded : loaded.default;
const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');
const DIST = process.env.DIST || path.join(HERE, 'dist');
const HEIGHT = Number(process.env.HEIGHT || 800);
const only = (process.env.ONLY_SLUGS || '').split(',').filter(Boolean);
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;

if (!fs.existsSync(DIST)) {
  console.error(`No built site at ${DIST}. Run: node platform/pages/build.mjs`);
  process.exit(2);
}

const pages = fs.readdirSync(DIST)
  .filter((name) => !only.length || only.includes(name))
  .filter((name) => {
    try {
      const html = fs.readFileSync(path.join(DIST, name, 'index.html'), 'utf8');
      return html.includes('pf-site.js') && /position\s*:\s*sticky/.test(html);
    } catch { return false; }
  })
  .sort();

const browser = await playwright.chromium.launch(chromePath ? { executablePath: chromePath } : {});
const page = await (await browser.newContext({ viewport: { width: 1280, height: HEIGHT } })).newPage();
const failures = [];
let cards = 0;
let fitted = 0;
for (const name of pages) {
  try {
    await page.goto(`${BASE}/${name}/`, { waitUntil: 'load', timeout: 30000 });
  } catch (e) {
    failures.push(`${name}: did not load (${String(e.message || e).split('\n')[0]})`);
    continue;
  }
  await page.waitForTimeout(250);
  const found = await page.evaluate(async () => {
    const out = [];
    const settle = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'sticky' || cs.top === 'auto' || !el.parentElement) continue;
      // Mid-way through the card's column, where it is stuck if it can be.
      const box = el.parentElement.getBoundingClientRect();
      scrollTo(0, scrollY + box.top + box.height / 2 - innerHeight / 2);
      await settle();
      const r = el.getBoundingClientRect();
      const stuck = Math.abs(r.top - parseFloat(cs.top)) < 2;
      out.push({
        name: el.className || el.tagName.toLowerCase(),
        stuck,
        fitted: el.hasAttribute('data-pf-sticky-fit'),
        cut: stuck && r.bottom > innerHeight + 1 && el.scrollHeight <= el.clientHeight + 1
          ? Math.round(r.bottom - innerHeight) : 0,
      });
      scrollTo(0, 0);
    }
    return out;
  });
  for (const c of found) {
    cards += 1;
    if (c.fitted) fitted += 1;
    if (c.cut) failures.push(`${name}: .${c.name} runs ${c.cut}px past a ${HEIGHT}px window while stuck`);
  }
}
await browser.close();

console.log(`${pages.length} pages, ${cards} sticky elements, ${fitted} capped to the window (${HEIGHT}px tall).`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('No stuck card is cut off.');
