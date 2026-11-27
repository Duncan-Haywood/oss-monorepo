// A page whose hero has a call-to-action pair (`<p class="cta-row">` with
// `a.cta` links) must let those buttons fill their line on a phone.
//
// WHY: the pair ("Start a takeoff" / "Try the example house") was copied from
// page to page as `display:flex; flex-wrap:wrap` with buttons at their own
// width, and no phone rule. When the pair no longer fits on one line, the
// second button drops under the first at a different width and the stack looks
// ragged. On 2026-11-19 that happened on 5 of the 10 pages with a cta-row at
// 390 px (the first screen of wall-framing-takeoff, einvoice-preflight,
// changepoint-detector, ids-model-check and xer-schedule-check), 9 at 360 px
// and all 10 at 320 px. The fix lets each button grow (`flex: 1 1 auto`) under
// a phone @media rule: a pair that fits shares the line, and a pair that wraps
// becomes two full-width buttons. Desktop is unchanged.
// Report: docs/reports/polish-2026-11-19-cta-row-phone.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The bodies of `@media (max-width: …)` blocks in a page's <style> elements. */
function phoneMediaBodies(html) {
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /@media[^{]*max-width[^{]*\{/gi;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1;
    let j = re.lastIndex;
    while (j < css.length && depth) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    out.push(css.slice(re.lastIndex, j - 1));
  }
  return out;
}

/**
 * True when the page has no cta-row, or when a phone @media rule lets the
 * row's buttons grow (a `.cta-row … .cta` selector with `flex: 1…` or
 * `flex-grow: 1`).
 */
export function ctaRowFillsOnPhone(html) {
  if (!/class="[^"]*\bcta-row\b[^"]*"/.test(html)) return true;
  return phoneMediaBodies(html).some((body) =>
    [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(
      ([, sel, decl]) =>
        /\.cta-row\b[^,{]*\.(cta|btn)\b/.test(sel) && /(^|;)\s*(flex\s*:\s*1\b|flex-grow\s*:\s*1\b)/.test(decl),
    ),
  );
}

/**
 * The page with its linked same-directory stylesheets inlined as <style>, so a
 * page whose CSP forbids inline styles (ventures/payapps/site, built by
 * payapps-site) is judged by the CSS it actually loads.
 */
export function withLinkedStyles(file, html) {
  const extra = [];
  for (const m of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^":?#]+\.css)"/gi)) {
    if (m[1].startsWith('/')) continue;
    try { extra.push(`<style>${readFileSync(join(dirname(file), m[1]), 'utf8')}</style>`); } catch { /* missing file: judged without it */ }
  }
  return html + extra.join('');
}

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

test('ctaRowFillsOnPhone: the defect, the fix, and pages with no cta-row', () => {
  const row = '<p class="cta-row"><a class="cta" href="#a">Start</a> <a class="cta alt" href="#a">Try</a></p>';
  const base = '.cta-row{display:flex;flex-wrap:wrap;gap:10px} a.cta{display:inline-block}';
  assert.equal(ctaRowFillsOnPhone(`<style>${base}</style>${row}`), false);
  assert.equal(
    ctaRowFillsOnPhone(`<style>${base}@media (max-width: 560px){.cta-row > a.cta{flex:1 1 auto;text-align:center}}</style>${row}`),
    true,
  );
  assert.equal(ctaRowFillsOnPhone(`<style>${base}</style><style>@media (max-width:600px){.cta-row .cta{flex-grow:1}}</style>${row}`), true);
  // an unconditional grow would stretch the pair across a desktop page: not the fix
  assert.equal(ctaRowFillsOnPhone(`<style>${base}.cta-row > a.cta{flex:1 1 auto}</style>${row}`), false);
  // commented out does not count
  assert.equal(ctaRowFillsOnPhone(`<style>${base}/* @media (max-width:560px){.cta-row > a.cta{flex:1}} */</style>${row}`), false);
  assert.equal(ctaRowFillsOnPhone('<style>a.cta{display:inline-block}</style><a class="cta">Go</a>'), true);
});

test('every venture or research page with a cta-row lets its buttons fill the line on a phone', () => {
  const bad = [];
  for (const dir of ['ventures', 'research']) {
    for (const f of htmlFiles(join(ROOT, dir))) {
      if (!ctaRowFillsOnPhone(withLinkedStyles(f, readFileSync(f, 'utf8')))) {
        bad.push(`${relative(ROOT, f)}: class="cta-row" with no phone rule; add the /* cta-row-phone */ <style> block (see ventures/wall-framing-takeoff/index.html)`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
