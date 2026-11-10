// Loads every tool page at a phone width and checks that the floating
// "Speak or type" button (assistant.mjs) still draws its microphone.
//
// Why this exists
// ---------------
// The button is injected into pages the site build does not style, so the
// page's own CSS reaches it. On 2026-11-10, 65 of the 955 tool pages that
// show the button drew it as a blank white square: each styles a bare
// `svg { background: #fff }` for its charts, and the white icon sat on a white
// square. wall-framing-takeoff's `svg` rule also stretched the icon to 22 px.
// The launcher now resets the icon by name, and assistant.test.mjs pins that
// reset. This check is the browser half, which catches the next page rule
// nobody anticipated (a `path { fill: ... }`, an `svg { width: 100% }` that wins).
//
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/ask-voice-icon.mjs
//
// Same BASE_URL / DIST / PLAYWRIGHT / CHROME_PATH variables as sideways.mjs,
// and the same trap: check that the server answering is serving this tree.
// Exits 1 when any page's icon fails, listing each one and why.
// Not part of CI: Playwright is not a dependency of this repo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const loaded = await import(process.env.PLAYWRIGHT || 'playwright');
const playwright = loaded.chromium ? loaded : loaded.default;
const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');
const DIST = process.env.DIST || path.join(HERE, 'dist');
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;

if (!fs.existsSync(DIST)) {
  console.error(`No built site at ${DIST}. Run: node platform/pages/build.mjs`);
  process.exit(2);
}

// Tool pages: top-level folders whose index loads pf-site.js, which carries
// the launcher. The launcher itself decides whether a page gets the button
// (two or more number inputs), so pages without one are counted, not failed.
const pages = fs.readdirSync(DIST)
  .map((name) => `${name}/`)
  .filter((rel) => {
    try { return fs.readFileSync(path.join(DIST, rel, 'index.html'), 'utf8').includes('pf-site.js'); }
    catch { return false; }
  })
  .sort();
if (!pages.length) {
  console.error(`No tool pages under ${DIST} load pf-site.js; nothing to check.`);
  process.exit(2);
}

/** Run in the page: what is wrong with the button's icon, or null if there is no button. */
function inspectIcon() {
  const btn = document.querySelector('.pf-ask-voice');
  if (!btn) return null;
  const svg = btn.querySelector('svg');
  const issues = [];
  const svgBg = getComputedStyle(svg).backgroundColor;
  const fill = getComputedStyle(svg.querySelector('path')).fill;
  const behind = svgBg === 'rgba(0, 0, 0, 0)' ? getComputedStyle(btn).backgroundColor : svgBg;
  if (fill === behind) issues.push(`icon fill ${fill} on ${behind}`);
  if (svgBg !== 'rgba(0, 0, 0, 0)') issues.push(`svg background ${svgBg}`);
  const box = svg.getBoundingClientRect();
  if (Math.round(box.width) !== 20 || Math.round(box.height) !== 20) {
    issues.push(`icon ${Math.round(box.width)}x${Math.round(box.height)}, not 20x20`);
  }
  return issues;
}

const browser = await playwright.chromium.launch(chromePath ? { executablePath: chromePath } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
// Only the local site: no fonts, analytics or model downloads from elsewhere.
await context.route('**/*', (route) => (route.request().url().startsWith(BASE) ? route.continue() : route.abort()));
const page = await context.newPage();

let ok = 0;
let noButton = 0;
const bad = [];
for (const rel of pages) {
  try {
    await page.goto(`${BASE}/${rel}`, { waitUntil: 'load', timeout: 20000 });
  } catch (err) {
    bad.push([rel, `did not load: ${err.message.split('\n')[0]}`]);
    continue;
  }
  const issues = await page.evaluate(inspectIcon);
  if (issues === null) noButton += 1;
  else if (issues.length) bad.push([rel, issues.join('; ')]);
  else ok += 1;
}
await browser.close();

console.log(`${pages.length} tool pages: ${ok} draw the mic, ${bad.length} do not, ${noButton} have no button.`);
for (const [rel, why] of bad) console.log(`  ${rel}  ${why}`);
process.exit(bad.length ? 1 : 0);
