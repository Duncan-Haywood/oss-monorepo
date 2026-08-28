// Loads every published page in a real browser and checks that its text can be
// read and its controls reached.
//
// Why this exists
// ---------------
// `check.mjs` proves the files are right, `journey.mjs` drives the hub deeply
// and `sweep.mjs` proves every tool still computes. All three can pass on a
// page whose numbers are invisible: a tool that calculates correctly and paints
// the answer in near-white on a near-white background is working software and a
// broken product, and nothing in this repository could tell the difference.
//
// It is not a hypothetical. Measured on the built site on 2026-08-28, before
// the pass that added this file:
//
//   - 104 WCAG AA contrast failures across 35 of 165 tool pages.
//   - Four calculators had a dark result panel with no link colour, so the
//     cross-links inside it fell back to the browser's default blue: 1.1:1,
//     invisible rather than merely faint. Those links are the SEO pages the
//     site is written to be found by.
//   - Five pages' comparison tables overflowed their sticky panel, painting the
//     last column of figures outside the panel's dark fill in the panel's own
//     near-white ink — 1.05:1, on the page's light background. The column
//     carried the answer.
//   - Six unit dropdowns had no accessible name at all.
//
// So: the same shape as `sweep.mjs`, deliberately shallow and total, but asking
// the other question. Every page, not just every tool — the SEO articles are
// most of what a search visitor lands on, and two of the defects above lived
// only there.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/contrast.mjs
//
//   # or against production once the owner flip lands:
//   BASE_URL=https://duncan-haywood.github.io/monorepo-projects node platform/pages/contrast.mjs
//
// **Check what is answering before you believe the result.** A server left
// running by an earlier build keeps the port and the run passes against the old
// tree without a word — the same trap `sweep.mjs` and `journey.mjs` document.
// One curl settles it:
//
//   curl -s http://localhost:8793/<slug>/ | grep -c 'the thing you just added'
//
// Not part of CI: it needs Playwright and axe-core, neither of which is a
// dependency of this repo. Run it before claiming a visual change is safe.
//
// PLAYWRIGHT and AXE override the module paths for a global install; CHROME_PATH
// reuses a Chromium already on the machine rather than downloading a second one.
// The scanned page set comes from the built artifact rather than from the hub,
// because the hub lists tools and this checks pages.

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

// Playwright ships CommonJS, so a PLAYWRIGHT naming its entry *file* resolves
// the exports under `.default` while a bare specifier gives them directly.
// Accept either — the same fix sweep.mjs carries, for the same reason.
const playwright = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) {
  console.error('Could not load Playwright. Set PLAYWRIGHT to its entry point, ' +
    'e.g. PLAYWRIGHT=./node_modules/playwright/index.js');
  process.exit(2);
}

const require = createRequire(import.meta.url);
let axeSource;
try {
  axeSource = await fs.readFile(process.env.AXE || require.resolve('axe-core/axe.min.js'), 'utf8');
} catch {
  console.error('Could not load axe-core. Install it (npm i axe-core) or set AXE ' +
    'to its axe.min.js, e.g. AXE=./node_modules/axe-core/axe.min.js');
  process.exit(2);
}

const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');
const DIST = process.env.DIST || path.join(path.dirname(new URL(import.meta.url).pathname), 'dist');
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
const LAUNCH = chromePath ? { executablePath: chromePath } : {};

// The WCAG 2.1 A and AA tags. Deliberately not axe's full "best-practice" set:
// this gate has to stay at zero to be worth anything, and a gate that flags a
// missing landmark on 440 hand-written pages is a gate somebody turns off.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Two widths, because two of the defects this file was written for existed at
// exactly one of them. The overflowing comparison table is a *desktop* bug —
// the sticky panel is narrow on a wide screen, and the page's own media query
// already handles the phone. Sweeping only a phone viewport, as sweep.mjs
// rightly does for whether a tool computes, would have found none of it.
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

/** Every built HTML page, relative to the artifact root. */
async function pagesUnder(dir, rel = '') {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const next = path.join(rel, entry.name);
    if (entry.isDirectory()) out.push(...await pagesUnder(path.join(dir, entry.name), next));
    else if (entry.name.endsWith('.html')) out.push(next);
  }
  return out;
}

let pages;
try {
  // 404 and offline are served by the host, not linked into a journey, and the
  // offline page is deliberately styled against a background it never gets in
  // a normal load.
  pages = (await pagesUnder(DIST))
    .filter((p) => !/(^|\/)(404|offline)\.html$/.test(p))
    .sort();
} catch (error) {
  console.error(`Could not read the built artifact at ${DIST}: ${error.message}`);
  console.error('Build it first: node platform/pages/build.mjs --out=platform/pages/dist');
  process.exit(2);
}

if (pages.length === 0) {
  console.error(`No pages found in ${DIST} — is the site built?`);
  process.exit(1);
}

console.log(`Checking ${pages.length} pages at ${BASE}, ${VIEWPORTS.map((v) => v.name).join(' and ')}\n`);

const browser = await chromium.launch(LAUNCH);
const findings = [];
let checked = 0;

for (const viewport of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  for (const relative of pages) {
    const url = `${BASE}/${relative}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.addScriptTag({ content: axeSource });
      const result = await page.evaluate(
        async (tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }),
        TAGS,
      );
      for (const violation of result.violations) {
        for (const node of violation.nodes) {
          findings.push({
            page: relative,
            viewport: viewport.name,
            rule: violation.id,
            impact: violation.impact,
            help: violation.help,
            why: (node.any?.[0]?.message || node.all?.[0]?.message || '').replace(/\s+/g, ' '),
            html: node.html.replace(/\s+/g, ' ').slice(0, 140),
            target: node.target.join(' '),
          });
        }
      }
    } catch (error) {
      findings.push({
        page: relative, viewport: viewport.name, rule: 'load-failed', impact: 'critical',
        help: 'The page did not load', why: error.message.slice(0, 160), html: '', target: '',
      });
    }
    checked++;
    if (checked % 100 === 0) console.log(`  ...${checked}/${pages.length * VIEWPORTS.length}`);
  }
  await page.close();
}
await browser.close();

if (findings.length === 0) {
  console.log(`\n${pages.length} pages, ${VIEWPORTS.length} viewports: no WCAG A/AA violations.`);
  process.exit(0);
}

// Grouped by rule, then by the exact colour pair or element shape, because the
// failures here arrive in families: one venture's accent token reused across
// twelve pages is one fix, and a list of twelve identical lines hides that.
const byRule = new Map();
for (const f of findings) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, []);
  byRule.get(f.rule).push(f);
}

console.log('');
for (const [rule, group] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`## ${rule}  [${group[0].impact}]  ${group.length} node(s) on ` +
    `${new Set(group.map((f) => f.page)).size} page(s)`);
  console.log(`   ${group[0].help}`);
  const shapes = new Map();
  for (const f of group) {
    const key = f.why || f.html;
    if (!shapes.has(key)) shapes.set(key, { n: 0, pages: new Set(), html: f.html, viewports: new Set() });
    const s = shapes.get(key);
    s.n++; s.pages.add(f.page); s.viewports.add(f.viewport);
  }
  for (const [why, s] of [...shapes].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) {
    console.log(`\n   ${s.n}x  ${why}`);
    console.log(`       ${[...s.viewports].join('+')} · ${[...s.pages].slice(0, 4).join(', ')}` +
      `${s.pages.size > 4 ? ` (+${s.pages.size - 4} more)` : ''}`);
    console.log(`       ${s.html}`);
  }
  console.log('');
}

console.log(`${findings.length} violation(s) across ${new Set(findings.map((f) => f.page)).size} page(s).`);
process.exit(1);
