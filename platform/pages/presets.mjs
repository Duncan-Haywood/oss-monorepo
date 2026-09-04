// Selects the "no preset" option on every starting-job picker and checks that
// doing so leaves the takeoff alone.
//
// Why this exists
// ---------------
// 64 trade calculators here open with a picker whose first option is a
// placeholder — "Choose a starting job…", "Custom size" — and whose other
// options stamp a worked example across the form. `roundtrip.mjs` proves the
// figures such a picker writes survive a share link. Nothing proved what
// happens when the contractor picks the placeholder *back*.
//
// What happened was data loss. Measured in Chromium on 2026-08-29 against
// `metal-roof-bid-calculator`: a roofer chooses a starting job, replaces the
// numbers with their own takeoff (77 × 41, $39,125.74), then reopens the
// dropdown and selects "Choose a starting job…" — and the whole takeoff is
// replaced by the first worked example in the list, $11,097.21. No warning, no
// undo, a $28,000 swing, and the page looks exactly as healthy afterwards as
// before.
//
// The cause is one expression, repeated across the family:
//
//     const preset = JOB_PRESETS[Number(select.value)];
//     if (!preset) return;
//
// `Number('')` is `0`, so "no job chosen" reads as *the first preset in the
// list* and the guard never fires. The tools that spell it
// `if (select.value === '') return;` are correct; the two spellings look alike
// and behave completely differently, which is exactly the kind of difference no
// amount of reading catches reliably.
//
// So this is the same shape as `sweep.mjs` and `contrast.mjs`: shallow, total,
// and asking one question no other check asks. It finds pickers structurally —
// a select carrying an empty-valued option whose non-empty options rewrite the
// form — rather than by name, so a new tool with a differently-named picker is
// covered on the day it lands.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/presets.mjs
//
//   node platform/pages/presets.mjs metal-roof-bid-calculator
//
// **Check what is answering before you believe the result.** A server left
// running by an earlier build keeps the port and the run passes against the old
// tree without a word — the trap `sweep.mjs`, `contrast.mjs` and
// `roundtrip.mjs` all document. One curl settles it.
//
// Not part of CI: it needs Playwright, which is not a dependency of this repo.
// PLAYWRIGHT overrides the module path for a global install; CHROME_PATH reuses
// a Chromium already on the machine.

import fs from 'node:fs/promises';
import path from 'node:path';
import { onlySlugs, keepSlug, describeFilter, requireNonEmpty } from './only-slugs.mjs';

// Playwright ships CommonJS, so a PLAYWRIGHT naming its entry *file* resolves
// the exports under `.default` while a bare specifier gives them directly.
// Accept either — the same fix the other three probes here carry.
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

// Read once, at module scope, so every code path in this file sees the same
// filter. `null` means "no filter"; see only-slugs.mjs for why that is kept
// distinct from an empty set.
const only = onlySlugs();

/** Every published tool directory in the built artifact. */
async function toolSlugs() {
  const entries = await fs.readdir(DIST, { withFileTypes: true });
  const slugs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await fs.access(path.join(DIST, entry.name, 'index.html'));
      slugs.push(entry.name);
    } catch { /* a directory without an entry page is not a tool */ }
  }
  return slugs.sort();
}

// `CSS.escape` is a browser global and this half runs in node — the mistake
// that made `roundtrip.mjs`'s first draft report "no editable number inputs" on
// every tool.
const cssId = (id) => `#${id.replace(/[^\w-]/g, (ch) => `\\${ch}`)}`;

/** Every addressable control, as the page holds it. Outputs are excluded. */
const READ_FIELDS = () => {
  const out = {};
  for (const node of document.querySelectorAll('input[id], select[id], textarea[id]')) {
    const type = (node.getAttribute('type') || 'text').toLowerCase();
    if (['button', 'submit', 'reset', 'file', 'image'].includes(type)) continue;
    if (node.readOnly || node.disabled) continue;
    if (node.id.includes('${')) continue;
    out[node.id] = type === 'checkbox' || type === 'radio' ? String(node.checked) : node.value;
  }
  return out;
};

/** Selects offering a placeholder — an empty value — plus at least one real option. */
const READ_CANDIDATES = () => [...document.querySelectorAll('select[id]')]
  .filter((node) => !node.disabled && node.offsetParent !== null)
  .map((node) => ({
    id: node.id,
    options: [...node.options].map((option) => option.value),
  }))
  .filter(({ options }) => options.includes('') && options.some((value) => value !== ''));

/** The figure the tool leads with, if it has one. */
const READ_HERO = () => document.querySelector('.hero-number')?.textContent?.trim() ?? '';

/** Fields that differ between two readings, ignoring the picker itself. */
function changedFields(before, after, exceptId) {
  return Object.keys(before).filter((id) => id !== exceptId && before[id] !== after[id]);
}

/**
 * Drive one picker on one tool.
 *
 * The takeoff typed in step 3 matters: without it the form still holds the
 * preset's own figures, re-applying them changes nothing, and the check passes
 * on a page that would have destroyed a real contractor's work. So the numbers
 * are moved off the preset first, and the assertion is that *nothing* moves
 * when the placeholder is chosen.
 */
async function checkPicker(page, picker) {
  const real = picker.options.find((value) => value !== '');
  await page.selectOption(cssId(picker.id), real, { timeout: 2000 });

  // Move the form off the preset, so re-applying it would be visible.
  const numbers = await page.evaluate(() => [...document.querySelectorAll('input[type="number"][id]')]
    .filter((node) => !node.disabled && !node.readOnly && node.offsetParent !== null)
    .slice(0, 4)
    .map((node) => ({ id: node.id, value: node.value, min: node.min, step: node.step })));
  let typed = 0;
  for (const field of numbers) {
    const size = Number(field.step) || 1;
    const base = Number.isFinite(Number(field.min)) ? Number(field.min) : 0;
    const start = Number.isFinite(Number(field.value)) ? Number(field.value) : base;
    const next = Number((base + Math.round((start + size * 9 - base) / size) * size).toFixed(10));
    try {
      await page.fill(cssId(field.id), String(next), { timeout: 2000 });
      typed += 1;
    } catch { /* a field the layout hides at this width */ }
  }
  if (typed === 0) return { status: 'skip', detail: `${picker.id}: nothing to type a takeoff into` };

  const beforePlaceholder = await page.evaluate(READ_FIELDS);
  const heroBefore = await page.evaluate(READ_HERO);
  await page.selectOption(cssId(picker.id), '', { timeout: 2000 });
  const afterPlaceholder = await page.evaluate(READ_FIELDS);
  const heroAfter = await page.evaluate(READ_HERO);

  const lost = changedFields(beforePlaceholder, afterPlaceholder, picker.id);
  if (lost.length === 0) return { status: 'ok', detail: `${picker.id}: the takeoff survives` };
  return {
    status: 'fail',
    detail: `${picker.id}: choosing the placeholder rewrote ${lost.length} field(s)`
      + ` — ${lost.slice(0, 4).map((id) => `${id} ${beforePlaceholder[id]}→${afterPlaceholder[id]}`).join(', ')}`
      + `${lost.length > 4 ? ', …' : ''}`
      + `${heroBefore === heroAfter ? '' : `; headline ${heroBefore} → ${heroAfter}`}`,
  };
}

async function checkTool(browser, slug) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));
  try {
    await page.goto(`${BASE}/${slug}/`, { waitUntil: 'networkidle' });
    const pickers = await page.evaluate(READ_CANDIDATES);
    if (pickers.length === 0) return [{ slug, status: 'skip', detail: 'no picker with a placeholder' }];

    const results = [];
    for (const picker of pickers) {
      // A fresh load per picker: the previous one left the form somewhere.
      await page.goto(`${BASE}/${slug}/`, { waitUntil: 'networkidle' });
      let result;
      try {
        result = await checkPicker(page, picker);
      } catch (error) {
        result = { status: 'skip', detail: `${picker.id}: ${error.message.split('\n')[0]}` };
      }
      results.push({ slug, ...result });
    }
    if (errors.length) results.push({ slug, status: 'fail', detail: errors.slice(0, 2).join(' | ') });
    return results;
  } catch (error) {
    return [{ slug, status: 'fail', detail: `probe error: ${error.message.split('\n')[0]}` }];
  } finally {
    await context.close();
  }
}

let slugs;
try {
  slugs = (await toolSlugs()).filter((s) => keepSlug(s, only));
  if (only) console.log(describeFilter(only));
} catch (error) {
  console.error(`Could not read the built artifact at ${DIST}: ${error.message}`);
  console.error('Build it first: node platform/pages/build.mjs --out=platform/pages/dist');
  process.exit(2);
}
// Outside the try on purpose: an over-narrow filter is not a build problem,
// and reporting it as one sends the reader to rebuild a site that is fine.
requireNonEmpty(slugs, only, 'tool directories');

const browser = await chromium.launch(LAUNCH);
const results = [];
for (const slug of slugs) {
  for (const result of await checkTool(browser, slug)) {
    results.push(result);
    const mark = result.status === 'ok' ? 'ok  ' : result.status === 'skip' ? 'skip' : 'FAIL';
    console.log(`${mark} ${slug}: ${result.detail}`);
  }
}
await browser.close();

const failed = results.filter((r) => r.status === 'fail');
const checked = results.filter((r) => r.status !== 'skip');
console.log(`\n${checked.length - failed.length}/${checked.length} pickers keep the takeoff`
  + ` when the placeholder is chosen back (${results.length - checked.length} skipped).`);
if (failed.length) {
  console.log('\nChoosing "no preset" must never rewrite the form. `Number(\'\')` is 0, so a'
    + '\n`JOB_PRESETS[Number(select.value)]` lookup reads it as the first preset:');
  for (const result of failed) console.log(`  ${result.slug}: ${result.detail}`);
}
process.exit(failed.length ? 1 : 0);
