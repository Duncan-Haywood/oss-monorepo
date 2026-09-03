// Breaks one input on every tool and checks the page points at the box it
// rejected.
//
// Why this exists
// ---------------
// 103 tools here answer a bad number with a sentence and an instruction:
//
//     Wood privacy, 6 ft: linear feet must be at least 0
//     check the highlighted input
//
// Run against `main` on 2026-08-29, before `invalid.mjs`: **0 of 103** drew any
// highlight at all. The instruction named something that did not exist, on
// forms carrying twenty to forty numeric inputs and a repeated row per fence
// run, per room, per gutter line. A contractor who typed a minus sign got a
// sentence, no price, and no way to find the box — usually scrolled off a
// phone screen entirely.
//
// So this is the same shape as `sweep.mjs`, `presets.mjs` and `contrast.mjs`:
// shallow, total, and asking one question no other check asks. For each tool it
// finds a numeric field the page itself constrains, puts an out-of-range value
// in it, and reads back what the page marked. Three outcomes matter and they
// are not the same failure:
//
//   ok      the field that was broken is the field that got marked
//   WRONG   something got marked, but not the field that was broken
//   FAIL    the page still promises a highlight and marked nothing
//
// A tool whose message names no field at all — "Add at least one fence run to
// price" — is `ok` too, provided the label stopped promising a highlight. A
// promise kept only sometimes is still a promise broken.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/highlight.mjs
//
//   node platform/pages/highlight.mjs fence-bid-calculator
//
// **Check what is answering before you believe the result.** A server left
// running by an earlier build keeps the port and the run passes against the old
// tree without a word — the trap `sweep.mjs`, `contrast.mjs`, `roundtrip.mjs`
// and `presets.mjs` all document. One curl settles it:
//
//   curl -s http://localhost:8793/pf-invalid.mjs | head -1
//
// Not part of CI: it needs Playwright, which is not a dependency of this repo.
// PLAYWRIGHT overrides the module path for a global install; CHROME_PATH reuses
// a Chromium already on the machine.

import fs from 'node:fs/promises';
import path from 'node:path';

import { HIGHLIGHT_PROMISE, NO_FIELD_LABEL } from './invalid.mjs';

// Playwright ships CommonJS, so a PLAYWRIGHT naming its entry *file* resolves
// the exports under `.default` while a bare specifier gives them directly.
// Accept either — the same fix the other probes here carry.
const playwright = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) {
  console.error('Could not load Playwright. Set PLAYWRIGHT to its entry point, '
    + 'e.g. PLAYWRIGHT=./node_modules/playwright/index.js');
  process.exit(2);
}

const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');
const DIST = process.env.DIST || path.join(path.dirname(new URL(import.meta.url).pathname), 'dist');
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
const LAUNCH = chromePath ? { executablePath: chromePath } : {};

/**
 * The tools that make the promise, read from the artifact rather than guessed.
 *
 * A page that never prints the sentence has nothing to keep, and `invalid.mjs`
 * deliberately leaves it alone — checking it here would report a failure the
 * product does not have.
 */
async function promisingSlugs() {
  const entries = await fs.readdir(DIST, { withFileTypes: true });
  const slugs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const html = await fs.readFile(path.join(DIST, entry.name, 'index.html'), 'utf8');
      if (html.toLowerCase().includes(HIGHLIGHT_PROMISE)) slugs.push(entry.name);
    } catch { /* a directory without an entry page is not a tool */ }
  }
  return slugs.sort();
}

/**
 * Put an out-of-range value in one of the venture's own numeric fields.
 *
 * A field carrying `min="0"` is preferred, because -5 in it is rejected by both
 * the calculator and the markup, which is the ordinary shape of this mistake.
 * Controls the build injected are skipped by their `pf-` class ancestry: they
 * are not the calculator, and breaking one would be testing the chrome.
 */
const BREAK_A_FIELD = () => {
  const own = (node) => {
    for (let el = node; el && el.classList; el = el.parentElement) {
      for (const name of el.classList) if (name.startsWith('pf-')) return false;
    }
    return true;
  };
  const fields = [...document.querySelectorAll('input[type=number]')]
    .filter((node) => own(node) && !node.disabled && !node.readOnly
      && (node.offsetWidth || node.offsetHeight));
  const usable = fields.filter((node) => node.value !== '' && Number(node.value) > 0);
  const target = usable.find((node) => node.min === '0') || usable[0];
  if (!target) return null;
  target.value = '-5';
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return target.id || target.name || target.className;
};

/** What the page did about it. */
const READ_STATE = () => {
  const marked = document.querySelector('[data-pf-invalid]');
  const leaves = [...document.querySelectorAll('*')].filter((node) => !node.children.length);
  const text = (node) => (node.textContent || '').trim();
  return {
    marked: marked ? (marked.id || marked.name || marked.className) : null,
    ariaInvalid: document.querySelectorAll('[aria-invalid="true"]').length,
    promising: leaves.some((node) => text(node).toLowerCase() === 'check the highlighted input'),
    stoodDown: leaves.some((node) => text(node) === 'check the values you entered'),
    hero: text(document.querySelector('.hero-number') || document.body).slice(0, 80),
  };
};

async function checkTool(browser, slug) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));
  try {
    await page.goto(`${BASE}/${slug}/`, { waitUntil: 'networkidle' });
    const broke = await page.evaluate(BREAK_A_FIELD);
    if (!broke) return { slug, status: 'skip', detail: 'no editable numeric field to break' };
    // The mark is applied by a MutationObserver, so it lands a frame after the
    // page has finished rewriting its own output.
    await page.waitForTimeout(200);
    const state = await page.evaluate(READ_STATE);
    if (state.marked && state.marked === broke) {
      return { slug, status: 'ok', detail: `marked ${state.marked}` };
    }
    if (state.marked) {
      return {
        slug,
        status: 'wrong',
        detail: `broke ${broke}, marked ${state.marked} — "${state.hero}"`,
      };
    }
    if (state.stoodDown && !state.promising) {
      return { slug, status: 'ok', detail: `no field named, promise withdrawn — "${state.hero}"` };
    }
    if (!state.promising) {
      return { slug, status: 'skip', detail: `no rejection reached — "${state.hero}"` };
    }
    return { slug, status: 'fail', detail: `still promising a highlight — "${state.hero}"` };
  } catch (error) {
    return { slug, status: 'fail', detail: `probe error: ${error.message.split('\n')[0]}` };
  } finally {
    if (errors.length) console.log(`     ${slug}: ${errors[0]}`);
    await context.close();
  }
}

const only = process.argv.slice(2);
let slugs;
try {
  slugs = await promisingSlugs();
} catch (error) {
  console.error(`Could not read the built artifact at ${DIST}: ${error.message}`);
  console.error('Build it first: node platform/pages/build.mjs --out=platform/pages/dist');
  process.exit(2);
}
if (only.length) slugs = slugs.filter((slug) => only.includes(slug));
if (slugs.length === 0) {
  console.error('No tool in the artifact promises a highlight.');
  process.exit(2);
}

const browser = await chromium.launch(LAUNCH);
const results = [];
for (const slug of slugs) {
  const result = await checkTool(browser, slug);
  results.push(result);
  const mark = { ok: 'ok  ', skip: 'skip', wrong: 'WRONG', fail: 'FAIL' }[result.status];
  console.log(`${mark} ${slug}: ${result.detail}`);
}
await browser.close();

const bad = results.filter((r) => r.status === 'fail' || r.status === 'wrong');
const checked = results.filter((r) => r.status !== 'skip');
console.log(`\n${checked.length - bad.length}/${checked.length} tools point at the input they`
  + ` rejected (${results.length - checked.length} skipped).`);
if (bad.length) {
  console.log(`\n"${HIGHLIGHT_PROMISE}" has to be true, or the label has to say`
    + `\n"${NO_FIELD_LABEL}" instead:`);
  for (const result of bad) console.log(`  ${result.slug}: ${result.detail}`);
}
process.exit(bad.length ? 1 : 0);
