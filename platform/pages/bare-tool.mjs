// Tool pages that ship with no stylesheet of their own.
//
//   node platform/pages/bare-tool.mjs           # list bare pages under ventures/, exit 1 if any
//   node platform/pages/bare-tool.mjs --fix     # give each one the base block below
//
// Why: on 2026-11-11 a polish run screenshotted the 401(k) loan vs withdrawal
// calculator and found it in browser defaults: Times body text, labels run
// into their inputs, grey system buttons, no cards. The site build adds only
// its header, footer and reflow rules (pf-chrome.css), which are palette-free
// on purpose, so a venture page that brings no CSS of its own is published
// bare. A browser sweep of all 1,344 tool index pages in the build found 91
// like that (plus one guide page), every one from the same generator: the
// same `card`, `grid`, `note`, `finding`, `pill`, `scroll`, `n` and
// `secondary` classes the other 1,200 tools style inline, but with no
// `<style>` block, or with only a few page-specific rules. The pages were
// built that way from their first commit (e.g. #6593, 2026-10-08), so no
// later run ever saw them styled.
//
// The fix goes into each page, not into the build: a venture page is also
// served on its own ("Deploy your own", the offline bundle, a self-hosted
// copy), so it has to carry its own look. Every rule is wrapped in :where(),
// which has no specificity, so any rule the page already has wins, wherever
// it sits. The accent is the page's own favicon colour, darkened until white
// button text and the link colour reach 4.5:1, so the tools keep the
// per-product colour their icons already have.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARK = 'data-base-style';

/**
 * True when the page links no stylesheet and no valid rule on :root, html or
 * body sets a font: the browser-default look. A font on a textarea alone does
 * not count (six pages had only that and still rendered in Times), and a
 * selector with a `<` in it is one the CSS parser drops (a stray second
 * `<style>` tag inside the block swallowed medical-bill-error-checker's :root
 * rule).
 */
export function isBare(html) {
  const s = String(html);
  if (/<link\b[^>]*rel=["']?stylesheet/i.test(s)) return false;
  for (const block of s.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].replace(/^\s*@media[^{]*$/i, '');
      if (selector.includes('<')) continue;
      if (/(^|[\s,(])(:root|html|body)(?![\w-])/.test(selector) && /(^|[;\s])font(-family)?\s*:/i.test(rule[2])) return false;
    }
  }
  return true;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
const rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a, b) {
  const [x, y] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** Darken `hex` in small steps until it reaches `ratio` against every colour in `against`. */
export function darkenTo(hex, ratio, against) {
  let rgb = hexToRgb(hex);
  for (let i = 0; i < 60 && against.some((bg) => contrast(rgbToHex(rgb), bg) < ratio); i++) rgb = rgb.map((v) => v * 0.94);
  return rgbToHex(rgb);
}

const DEFAULT_ACCENT = '#2a6b8e';
const PAGE_BG = '#f4f5f7';

/** The page's own colour: the first fill in its inline SVG favicon, else a neutral blue. */
export function accentOf(html) {
  const icon = String(html).match(/<link\b[^>]*rel=["']?icon[^>]*>/i)?.[0] ?? '';
  const m = icon.match(/fill=['"]?(?:%23|#)([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
  return m ? '#' + m[1].toLowerCase() : DEFAULT_ACCENT;
}

/** The base block for one page. */
export function baseStyle(html) {
  const accent = darkenTo(accentOf(html), 4.5, ['#ffffff', PAGE_BG]);
  const ink = darkenTo(accentOf(html), 8, ['#ffffff', PAGE_BG]);
  return `<style ${MARK}>
    /* Base look shared by the generated tools (platform/pages/bare-tool.mjs). :where() keeps every rule below any rule of the page's own. */
    :where(:root) { font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1b1f2a; background: ${PAGE_BG}; }
    :where(body) { max-width: 1000px; margin: auto; padding: 28px; }
    @media (max-width: 600px) { :where(body) { padding: 16px; } }
    :where(a) { color: ${accent}; }
    :where(h1) { font-size: clamp(1.75rem, 4.6vw, 2.6rem); line-height: 1.1; margin: 0 0 14px; color: ${ink}; text-wrap: balance; }
    :where(h2) { font-size: 1.15rem; line-height: 1.3; margin: 0 0 10px; color: ${ink}; }
    :where(h3) { font-size: 1rem; margin: 18px 0 4px; }
    :where(p, li) { line-height: 1.55; }
    :where(.note, footer) { font-size: .86rem; color: #4a5664; }
    :where(header > .note:first-child) { letter-spacing: .04em; }
    :where(code) { font: .9em ui-monospace, SFMono-Regular, Menlo, monospace; }
    :where(.card) { background: #fff; border: 1px solid #d9dfe6; border-radius: 14px; padding: 22px; box-shadow: 0 8px 24px rgba(27, 31, 42, .06); margin: 18px 0; }
    @media (max-width: 600px) { :where(.card) { padding: 16px; } }
    :where(.grid) { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 4px 14px; align-items: end; }
    :where(label) { display: block; font-weight: 600; margin: 12px 0 4px; }
    :where(input, select, textarea) { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid #a9b4c0; border-radius: 7px; font: 15px system-ui, sans-serif; background: #fff; color: inherit; }
    :where(input[type=checkbox], input[type=radio]) { width: auto; }
    :where(textarea) { min-height: 120px; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
    :where(input, select, textarea, button):focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }
    :where(button) { border: 0; border-radius: 8px; padding: 11px 15px; background: ${accent}; color: #fff; font: 700 15px system-ui, sans-serif; cursor: pointer; margin: 14px 8px 0 0; }
    :where(button.secondary) { background: #e6ebf0; color: ${ink}; }
    :where(button):hover { filter: brightness(1.08); }
    :where(table) { width: 100%; border-collapse: collapse; margin-top: 8px; }
    :where(th, td) { text-align: left; padding: 8px; border-bottom: 1px solid #e6e9ee; vertical-align: top; }
    :where(th) { font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; color: #4a5664; }
    :where(td.n, th.n) { text-align: right; font-variant-numeric: tabular-nums; }
    :where(.scroll) { overflow-x: auto; }
    :where(.finding) { border-bottom: 1px solid #e6e9ee; padding: 12px 0; }
    :where(.finding:last-child) { border-bottom: 0; }
    :where(.finding h3, .finding h4) { margin: 0 0 4px; font-size: 1rem; }
    :where(.pill) { display: inline-block; font-size: .68rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; margin-right: 8px; background: #e3e9ef; color: #1f3a4d; }
    :where(.pill.high, .pill.error) { background: #fde8e8; color: #9a3412; }
    :where(.pill.medium, .pill.warn) { background: #fdf0d5; color: #6b500c; }
    :where(.stats) { font-size: .95rem; color: #333c46; margin: 4px 0 10px; }
    :where(footer) { margin-top: 28px; border-top: 1px solid #d9dfe6; padding-top: 16px; }
  </style>`;
}

/** The page with the base block added before its first <style> (or before </head>), or unchanged if it is not bare. */
export function addBaseStyle(html) {
  const s = String(html);
  if (!isBare(s) || s.includes(MARK)) return s;
  const block = baseStyle(s);
  const at = s.search(/\n?\s*<style\b/i);
  if (at >= 0 && at < s.search(/<\/head>/i)) return s.slice(0, at) + '\n  ' + block + s.slice(at);
  return s.replace(/\n?<\/head>/i, (m) => '\n  ' + block + m);
}

export function barePages(root) {
  const out = [];
  for (const slug of fs.readdirSync(root).sort()) {
    const dir = path.join(root, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.html')) continue;
      const file = path.join(dir, name);
      if (isBare(fs.readFileSync(file, 'utf8'))) out.push(file);
    }
  }
  return out;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const root = fileURLToPath(new URL('../../ventures/', import.meta.url));
  const bare = barePages(root);
  if (process.argv.includes('--fix')) {
    for (const f of bare) fs.writeFileSync(f, addBaseStyle(fs.readFileSync(f, 'utf8')));
    console.log(`gave ${bare.length} bare page(s) the base style`);
  } else {
    for (const f of bare) console.log(path.relative(root, f));
    console.log(`${bare.length} venture page(s) with no stylesheet and no font rule`);
    process.exit(bare.length ? 1 : 0);
  }
}
