// Can a printed venture page be read? Text that vanishes on paper.
//
// Why this exists
// ---------------
// 293 venture pages carry a `window.print()` button ("Print this estimate",
// "Save as PDF") and 334 ship an `@media print` block, because the people they
// are for hand the result to someone: a bid to a homeowner, a worksheet to a
// bookkeeper. Nothing in this repository looked at the paper. `contrast.mjs`
// renders the screen in light and dark, `reflow.mjs` the phone, `ink.mjs` the
// stylesheet. None of them prints.
//
// Printing changes the colours. Unless an element opts in with
// `print-color-adjust: exact`, Chromium drops every background colour and
// image (the "Background graphics" box is off by default), so a result panel
// designed as white text on a dark fill prints as that text on white paper.
// Blink then tries to rescue light text, but only partly: measured 2026-11-19
// by printing `#fff` on `#123` to PDF in this repo's Chromium and rasterising
// it with pdftoppm, the text came out `#ababab`, 2.3:1 on white. That fits
// Blink's rule (`TextColorForWhiteBackground` and `Color::Dark()` in
// Chromium's Blink renderer): a colour whose squared RGB distance from white
// is at most 255^2 is darkened by scaling each channel by `(v - 0.33) / v`,
// where `v` is the largest channel over 255; ten colours printed the same way
// match it to within one 8-bit step. So white becomes #ababab, a pale yellow a pale
// olive, and nothing lands darker than about 4.5:1 unless it started dark.
//
// What this checks
// ----------------
// Each page is loaded with print media emulated (so its own `@media print`
// rules apply), light colour scheme. For every visible element that holds
// text, `printedInk()` below works out the colour on paper: the background is
// the nearest ancestor whose fill will actually print (one with
// `print-color-adjust: exact`), else white paper; the text keeps its colour
// under `exact` and goes through Blink's darkening otherwise; alpha and
// `opacity` blend onto that background. A run of text under WCAG 1.4.3's
// threshold (4.5:1, or 3:1 for large text) is a finding.
//
// The model is the measurement reduced to arithmetic, so it is checked against
// the measurement: `paper.test.mjs` pins the rule, and `--pdf` prints the
// flagged pages to PDF so a person can look at the paper itself.
//
//   python3 -m http.server 8794 -d ventures &   # or any static server
//   node platform/pages/paper.mjs                       # every ventures/<slug>/index.html
//   node platform/pages/paper.mjs --print-buttons-only  # only pages with a print button
//   ONLY_SLUGS=a,b node platform/pages/paper.mjs --pdf out/
//   node platform/pages/paper.mjs --with-fix            # as published: PAPER_INK_JS applied
//   node platform/pages/paper.mjs --strict              # exit 1 on a finding
//
// Out of scope, counted as such rather than reported clean: text drawn on a
// background image that is kept (`exact` plus an image fill: no single colour
// to compare against), SVG text, and the dark scheme (printing from a dark-mode
// browser is rare and Chromium's print preview renders light by default).

import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const VENTURES = resolve(HERE, '..', '..', 'ventures');

// ---------------------------------------------------------------- the model

/**
 * Blink's `Color::Dark()`: scale every channel toward black by (v-0.33)/v,
 * where v is the largest channel over 255. Fitted to Chromium's own PDF
 * output for ten colours (paper.test.mjs, MEASURED): rounding to nearest
 * reproduces every channel to within one 8-bit step.
 */
export function blinkDark([r, g, b]) {
  const v = Math.max(r, g, b) / 255;
  const m = v === 0 ? 0 : Math.max(0, (v - 0.33) / v);
  return [Math.round(m * r), Math.round(m * g), Math.round(m * b)];
}

/** Blink's `TextColorForWhiteBackground`: darken only colours near white. */
export function blinkPrintText(rgb) {
  const d = (255 - rgb[0]) ** 2 + (255 - rgb[1]) ** 2 + (255 - rgb[2]) ** 2;
  return d > 65025 ? rgb : blinkDark(rgb);
}

export function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function blend(fg, alpha, bg) {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
}

/**
 * The colour a run of text lands on paper, and what it sits on.
 * `text`: {rgb, alpha, exact, opacity}; `fills`: the element and its
 * ancestors' backgrounds, innermost first, each {rgb, alpha, exact, image}.
 */
export function printedInk(text, fills) {
  let bg = [255, 255, 255];
  let unknown = false;
  // Paint from the outside in, keeping only fills that actually print.
  for (const f of [...fills].reverse()) {
    if (!f.exact) continue;
    if (f.image) unknown = true;
    if (f.alpha > 0) bg = blend(f.rgb, f.alpha, bg);
  }
  let fg = text.exact ? text.rgb : blinkPrintText(text.rgb);
  fg = blend(fg, (text.alpha ?? 1) * (text.opacity ?? 1), bg);
  return { fg, bg, ratio: contrast(fg, bg), unknown };
}

export function isLarge(px, weight) {
  return px >= 24 || (px >= 18.66 && weight >= 700);
}

// ------------------------------------------------------------- the fix

/**
 * Shipped in every published page (`pf-site.js`, via build.mjs's
 * renderChromeModule). On `beforeprint` it runs the model above with the
 * screen's colours and, for each run of text that would fade on paper, keeps
 * the fill it sits on: `print-color-adjust: exact` on the nearest box that
 * paints one. That box's subtree then prints as it looks on screen, which
 * `contrast.mjs` already holds to WCAG; every other fill is still dropped, so
 * a page spends ink only where its text needs it. A fill that would not help
 * (the text is no more legible on it than on paper) is left alone.
 *
 * Why not one stylesheet rule: `:where(html){print-color-adjust:exact}` prints
 * every cream page tint and every dark hero solid; forcing a white page under
 * it erases the light text of a dark-themed page. Only the colours decide,
 * and CSS cannot read them.
 */
export const PAPER_INK_JS = `
(function () {
  if (typeof window === 'undefined' || !window.addEventListener) return;
  function parse(s) {
    var m = /rgba?\\(([^)]+)\\)/.exec(s || '');
    if (!m) return null;
    var p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
    return { c: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  }
  function lum(c) {
    var t = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function onPaper(c) {
    var d = (255 - c[0]) * (255 - c[0]) + (255 - c[1]) * (255 - c[1]) + (255 - c[2]) * (255 - c[2]);
    if (d > 65025) return c;
    var v = Math.max(c[0], c[1], c[2]) / 255, m = v ? Math.max(0, (v - 0.33) / v) : 0;
    return c.map(function (x) { return Math.round(x * m); });
  }
  function keep(el) {
    el.style.setProperty('print-color-adjust', 'exact');
    el.style.setProperty('-webkit-print-color-adjust', 'exact');
    el.setAttribute('data-pf-ink', '');
  }
  // Selectors the page's own @media print rules give a fill or ink colour
  // to. Such a box has a print design already (often a white panel with dark
  // text), and these screen colours are not what will print; keeping its fill
  // could only undo that design, so it is left alone.
  function printStyled() {
    var out = [];
    function walk(rules, inPrint) {
      for (var i = 0; rules && i < rules.length; i++) {
        var r = rules[i];
        if (r.media && r.cssRules) walk(r.cssRules, inPrint || /\\bprint\\b/.test(r.media.mediaText));
        else if (inPrint && r.selectorText && r.style &&
          (r.style.background || r.style.backgroundColor || r.style.color)) out.push(r.selectorText);
      }
    }
    for (var i = 0; i < document.styleSheets.length; i++) {
      try { walk(document.styleSheets[i].cssRules, false); } catch (e) { /* cross-origin */ }
    }
    return out;
  }
  function matchesAny(el, sels) {
    for (var i = 0; i < sels.length; i++) { try { if (el.matches(sels[i])) return true; } catch (e) {} }
    return false;
  }
  var done = false;
  function run() {
    if (done || !document.body) return;
    done = true;
    var own = printStyled();
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var seen = new Set(), n, budget = 6000;
    while ((n = walker.nextNode()) && budget-- > 0) {
      var el = n.parentElement;
      if (!el || seen.has(el) || !/\\S/.test(n.data)) continue;
      seen.add(el);
      // WCAG exempts inactive controls, and so does this.
      if (el.closest(':disabled')) continue;
      var cs = getComputedStyle(el);
      if ((cs.printColorAdjust || cs.webkitPrintColorAdjust) === 'exact') continue;
      var t = parse(cs.color);
      if (!t || !el.getClientRects().length) continue;
      var px = parseFloat(cs.fontSize), w = Number(cs.fontWeight) || 400;
      var need = px >= 24 || (px >= 18.66 && w >= 700) ? 3 : 4.5;
      if (ratio(onPaper(t.c), [255, 255, 255]) >= need) continue;
      // Up to the first opaque fill, keeping each translucent one on the way:
      // a 60% tint prints as itself over white unless what it tints prints too.
      var chain = [], decided = false;
      for (var a = el; a; a = a.parentElement) {
        if (matchesAny(a, own)) { decided = true; chain = []; break; }
        var bs = getComputedStyle(a), b = parse(bs.backgroundColor);
        var img = bs.backgroundImage !== 'none';
        if ((b && b.a > 0) || img) chain.push(a);
        if ((b && b.a >= 0.99) || img) {
          decided = true;
          if (!img && ratio(t.c, b.c) <= ratio(onPaper(t.c), [255, 255, 255])) chain = [];
          break;
        }
      }
      if (!decided) continue;
      for (var k = 0; k < chain.length; k++) {
        keep(chain[k]);
        if (chain[k] === document.body) keep(document.documentElement);
      }
    }
  }
  window.addEventListener('beforeprint', run);
  window.addEventListener('afterprint', function () { done = false; });
  // Safari before 13 fires no beforeprint; it does flip the print query.
  if (window.matchMedia) {
    var q = window.matchMedia('print');
    if (q && q.addListener) q.addListener(function (e) { if (e.matches) run(); });
  }
})();
`;

// ------------------------------------------------------------------ in page

// Runs inside the page (print media already emulated). Returns one row per
// visible element that owns a non-blank text node.
function collect() {
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return { rgb: [0, 0, 0], alpha: 0 };
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { rgb: p.slice(0, 3).map(Math.round), alpha: p.length > 3 ? p[3] : 1 };
  };
  const exactOf = (cs) => (cs.printColorAdjust || cs.webkitPrintColorAdjust) === 'exact';
  const rows = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.data.trim()) continue;
    seen.add(el);
    if (el.closest('script,style,noscript,template,svg')) continue;
    // WCAG 1.4.3 exempts inactive controls.
    if (el.closest(':disabled')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // Clipped to nothing (a visually-hidden label) prints nothing.
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || /inset\(50%\)/.test(cs.clipPath)) continue;
    let opacity = 1;
    const fills = [];
    for (let a = el; a; a = a.parentElement) {
      const acs = getComputedStyle(a);
      opacity *= Number(acs.opacity);
      const c = parse(acs.backgroundColor);
      fills.push({ ...c, exact: exactOf(acs), image: acs.backgroundImage !== 'none' });
    }
    if (opacity < 0.05) continue;
    const t = parse(cs.color);
    let path = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '');
    rows.push({
      text: { ...t, exact: exactOf(cs), opacity },
      fills,
      px: parseFloat(cs.fontSize),
      weight: Number(cs.fontWeight) || 400,
      sample: n.data.trim().replace(/\s+/g, ' ').slice(0, 50),
      path,
      screenColor: cs.color,
    });
  }
  return rows;
}

export function judge(rows) {
  const findings = [];
  let unknown = 0;
  for (const row of rows) {
    const ink = printedInk(row.text, row.fills);
    if (ink.unknown) { unknown++; continue; }
    const need = isLarge(row.px, row.weight) ? 3 : 4.5;
    if (ink.ratio + 1e-9 < need) {
      findings.push({ ...row, ...ink, need });
    }
  }
  return { findings, unknown };
}

// ------------------------------------------------------------------ runner

function pagesToCheck({ printButtonsOnly, only }) {
  const out = [];
  for (const slug of readdirSync(VENTURES).sort()) {
    if (only && !only.has(slug)) continue;
    const file = join(VENTURES, slug, 'index.html');
    if (!existsSync(file)) continue;
    if (printButtonsOnly && !/\bprint\s*\(\s*\)/.test(readFileSync(file, 'utf8'))) continue;
    out.push(slug);
  }
  return out;
}

async function main(argv) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require(process.env.PLAYWRIGHT || 'playwright'); } catch {
    console.error('Could not load Playwright (set PLAYWRIGHT to its entry point).');
    return 2;
  }
  const base = (process.env.BASE_URL || 'http://localhost:8794').replace(/\/$/, '');
  const only = process.env.ONLY_SLUGS ? new Set(process.env.ONLY_SLUGS.split(',').map((s) => s.trim())) : null;
  const pdfAt = argv.indexOf('--pdf');
  const pdfDir = pdfAt >= 0 ? argv[pdfAt + 1] : null;
  const strict = argv.includes('--strict');
  // Measure the page as the published site prints it: run the fix that
  // pf-site.js carries, then fire beforeprint as the browser would.
  const withFix = argv.includes('--with-fix');
  const asJson = argv.includes('--json');
  const slugs = pagesToCheck({ printButtonsOnly: argv.includes('--print-buttons-only'), only });
  if (!slugs.length) { console.error('No pages matched.'); return 2; }
  if (pdfDir) mkdirSync(pdfDir, { recursive: true });

  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, colorScheme: 'light', reducedMotion: 'reduce' });
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  const report = [];
  let errors = 0, unknown = 0;
  for (const slug of slugs) {
    try {
      await page.goto(`${base}/${slug}/`, { waitUntil: 'load', timeout: 20000 });
      // Let pages that compute on load fill their result panel first.
      await page.waitForTimeout(150);
      if (withFix) {
        await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
        await page.addScriptTag({ content: PAPER_INK_JS });
        await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
        await page.emulateMedia({ media: 'print', colorScheme: 'light' });
      }
      const rows = await page.evaluate(collect);
      const j = judge(rows);
      unknown += j.unknown;
      if (j.findings.length) {
        report.push({ slug, findings: j.findings });
        if (pdfDir) await page.pdf({ path: join(pdfDir, `${slug}.pdf`), format: 'Letter' });
      }
    } catch (e) {
      errors++;
      console.error(`${slug}: ${String(e.message || e).split('\n')[0]}`);
    }
  }
  await browser.close();

  const total = report.reduce((n, p) => n + p.findings.length, 0);
  if (asJson) {
    console.log(JSON.stringify({ checked: slugs.length, errors, unknown, pages: report }, null, 1));
  } else {
    for (const p of report) {
      console.log(`\n${p.slug}: ${p.findings.length} text run(s) under the threshold on paper`);
      for (const f of p.findings.slice(0, 6)) {
        console.log(`  ${f.ratio.toFixed(2)}:1 (needs ${f.need}) ${f.path} "${f.sample}" screen ${f.screenColor} -> paper rgb(${f.fg.join(',')}) on rgb(${f.bg.join(',')})`);
      }
      if (p.findings.length > 6) console.log(`  ... and ${p.findings.length - 6} more`);
    }
    console.log(`\n${slugs.length} pages printed (emulated), ${report.length} with text that fails on paper, ` +
      `${total} text runs; ${unknown} runs on a kept background image not judged; ${errors} pages failed to load.`);
  }
  return strict && total ? 1 : errors ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
