// Marks the static tables that need a sideways swipe on a phone as
// `class="stack"`, in the venture's own source.
//
// Why this exists (polish, 2026-11-26)
// ------------------------------------
// The phone probe (`phone-probe-check.mjs`) found 128 blocks on the
// construction front doors that needed a sideways swipe at 390 px. 54 of them
// were read-only tables on guide pages ("vs a flat rate", "how much does ...
// cost"), each fixed by the same edit: add `class="stack"`, after which
// `stack-labels.mjs` labels the cells at build time and the chrome's card CSS
// (`STACK_TABLE_CHROME_CSS`) turns each row into a card. Doing that by hand
// 42 times is the chore this script does.
//
// It is deliberately conservative. A table is changed only when:
//   - it sits in a box that scrolls sideways by 8 px or more at the width given
//     (the probe's own threshold), measured on the built page;
//   - its source copy has a `<thead>`, and exactly one source table has that
//     header text (that is how a rendered table is matched to its source);
//   - its source has body cells and no `id` on the table or its `<tbody>`:
//     a table a script fills gets no build-time labels, and a stacked table
//     without labels is worse than a scrolling one;
//   - it has no table inside it, and is not already `stack`.
// Everything else is reported, not touched. Run the probe again afterwards.
//
// `--scripted` (polish, 2026-11-27) lifts the script-filled refusal for a
// table with a `<thead>`: since the chrome's runtime labeller
// (`STACK_LABELS_JS` in stack-labels.mjs, run by build.mjs's width check)
// labels rows a calculator writes after load, such a table gets labelled
// cards too. With it the script also loads the page's example and submits it
// (the probe's `EXAMPLE_RE` and `SUBMIT_RE`) before measuring again, since a
// results table is empty until then. Measured that day on the online-sellers
// front doors: 62 of 195 swipes were `#report` tables written that way.
// A table that is its own scroll box (no wrapper) counts as well as one
// inside a scroller.
//
//   node platform/pages/phone-probe-check.mjs --list   # slugs, then build them
//   DIST=/tmp/pp node platform/pages/phone-probe-check.mjs > probe.txt
//   grep 'at load: div.pf-table-scroll' probe.txt | cut -d' ' -f1 | sort -u > pages.txt
//   DIST=/tmp/pp node platform/pages/stack-overflowing.mjs pages.txt [--dry] [--width 390] [--scripted]
//
// pages.txt holds `slug/page.html` or `slug/` lines; the source is
// `ventures/<line>` (index.html for `slug/`). Not in CI (Playwright).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_RE, SUBMIT_RE } from './phone-probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

/** Header text reduced to letters and digits, so source and DOM compare equal. */
export const headKey = (html) => String(html)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&[a-z#0-9]+;/gi, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

/** Every `<table>` open tag outside comments, scripts, styles and textareas, with what the rules above need. */
export function sourceTables(html) {
  const out = [];
  // End tags as browsers parse them: `</script >`, `</script foo>` and a
  // comment closed by `--!>` all end the block (code-scanning #1432).
  const re = /<!--[\s\S]*?--!?>|<script\b[\s\S]*?<\/script\b[^>]*>|<style\b[\s\S]*?<\/style\b[^>]*>|<textarea\b[\s\S]*?<\/textarea\b[^>]*>|<table\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!/^<table/i.test(m[0])) continue;
    const rest = html.slice(m.index + m[0].length);
    const end = rest.search(/<\/table>/i);
    const body = end < 0 ? rest : rest.slice(0, end);
    const head = body.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
    out.push({
      index: m.index,
      tag: m[0],
      head: head ? headKey(head[1]) : null,
      nested: /<table\b/i.test(body),
      scripted: /\sid\s*=/i.test(m[0]) || /<tbody\b[^>]*\sid\s*=/i.test(body) || !/<td\b/i.test(body),
      stacked: /\sclass\s*=\s*["'][^"']*\bstack\b/i.test(m[0]),
    });
  }
  return out;
}

/** The open tag with `stack` added to its class list. */
export function withStack(tag) {
  if (/\sclass\s*=\s*"/i.test(tag)) return tag.replace(/(\sclass\s*=\s*")/i, '$1stack ');
  if (/\sclass\s*=\s*'/i.test(tag)) return tag.replace(/(\sclass\s*=\s*')/i, '$1stack ');
  return tag.replace(/^<table/i, '<table class="stack"');
}

/**
 * Stack the source tables whose rendered header text is in `heads`.
 * Returns the new html and one note per head.
 */
export function stackTables(html, heads, { scripted = false } = {}) {
  const tables = sourceTables(html);
  const chosen = new Map();
  const notes = [];
  const want = new Map();
  for (const h of heads) {
    if (!h) { notes.push('overflowing table has no thead: skipped'); continue; }
    const key = headKey(h);
    want.set(key, (want.get(key) || 0) + 1);
  }
  for (const [key, n] of want) {
    const hits = tables.filter((t) => t.head === key);
    // Several tables may share a header (one results table per grouping);
    // stack them only when every one of them overflowed on the page.
    if (!hits.length || hits.length !== n) { notes.push(`${hits.length} source tables with header "${key.slice(0, 50)}" for ${n} overflowing: skipped`); continue; }
    for (const t of hits) {
      if (t.stacked) { notes.push('already stack: skipped'); continue; }
      if (t.scripted && !scripted) { notes.push('a script fills it (no body cells or an id): skipped'); continue; }
      if (t.nested) { notes.push('has a table inside: skipped'); continue; }
      chosen.set(t.index, t);
      notes.push('stacked');
    }
  }
  let out = html;
  for (const t of [...chosen.values()].sort((a, b) => b.index - a.index)) {
    out = out.slice(0, t.index) + withStack(t.tag) + out.slice(t.index + t.tag.length);
  }
  return { html: out, changed: chosen.size, notes };
}

/** Header html of every table in (or that is) a box scrolling sideways by 8 px or more; null for a headless one. */
function overflowingHeads(page) {
  return page.evaluate(() => {
    const res = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('nav,[role=tablist],[data-phone-scroll-ok]')) continue;
      const ox = getComputedStyle(el).overflowX;
      if ((ox !== 'auto' && ox !== 'scroll') || el.clientWidth < 1) continue;
      if (el.scrollWidth - el.clientWidth < 8) continue;
      const tables = el.tagName === 'TABLE' ? [el] : el.querySelectorAll(':scope > table, :scope > * > table');
      for (const t of tables) { if (seen.has(t)) continue; seen.add(t); res.push(t.tHead ? t.tHead.innerHTML : null); }
    }
    return res;
  });
}

/** Clicks the first visible button in main whose text matches `re` (as phone-probe-check does); its text or null. */
async function clickButton(page, re) {
  const found = await page.evaluate((src) => {
    const rx = new RegExp(src.source, src.flags);
    const el = [...document.querySelectorAll('main button, main input[type=submit], main input[type=button], main a[role=button]')].find((b) => {
      const r = b.getBoundingClientRect();
      return rx.test((b.textContent || b.value || '').trim()) && r.width > 0 && r.height > 0 && !b.disabled;
    });
    if (!el) return null;
    el.setAttribute('data-stack-click', '1');
    return (el.textContent || el.value || '').trim().slice(0, 40);
  }, { source: re.source, flags: re.flags });
  if (!found) return null;
  try { await page.click('[data-stack-click]', { timeout: 3000 }); } catch { return null; }
  await page.evaluate(() => document.querySelector('[data-stack-click]')?.removeAttribute('data-stack-click')).catch(() => {});
  await page.waitForTimeout(400);
  return found;
}

async function main(argv) {
  const list = argv.find((a) => !a.startsWith('--'));
  if (!list || !process.env.DIST) {
    console.error('usage: DIST=<built site> node platform/pages/stack-overflowing.mjs pages.txt [--dry] [--width 390]');
    return 2;
  }
  const dry = argv.includes('--dry');
  const wi = argv.indexOf('--width');
  const width = wi >= 0 ? Number(argv[wi + 1]) : 390;
  const scripted = argv.includes('--scripted');
  const pages = fs.readFileSync(list, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const { default: pw } = await import('/opt/node-tools/node_modules/playwright/index.js');
  const { serveDir } = await import('./serve-dir.mjs');
  const { srv, base } = await serveDir(process.env.DIST);
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  let total = 0;
  try {
    for (const p of pages) {
      const src = path.join(REPO, 'ventures', p.endsWith('/') ? `${p}index.html` : p);
      if (!fs.existsSync(src)) { console.log(`${p}: no source at ${path.relative(REPO, src)}`); continue; }
      await page.goto(`${base}/${p}`, { waitUntil: 'load' });
      const heads = await overflowingHeads(page);
      if (scripted) {
        const ex = await clickButton(page, EXAMPLE_RE);
        const sub = await clickButton(page, SUBMIT_RE);
        // The worked page is a superset of the loaded one: take its list when it is longer.
        if (ex || sub) { const after = await overflowingHeads(page); if (after.length > heads.length) heads.splice(0, heads.length, ...after); }
      }
      const before = fs.readFileSync(src, 'utf8');
      const { html, changed, notes } = stackTables(before, heads, { scripted });
      if (changed && !dry) fs.writeFileSync(src, html);
      total += changed;
      console.log(`${p}: ${notes.join('; ') || 'no overflowing table'}`);
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`${total} table(s) ${dry ? 'would be ' : ''}stacked`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
