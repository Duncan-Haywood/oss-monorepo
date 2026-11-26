// Stops iOS zooming the page when a visitor taps a form field.
//
// Safari on an iPhone zooms in on any text field, select or textarea whose
// computed font size is under 16 px when it takes focus, and does not zoom back
// out: the visitor is left mid-form on a page wider than the screen, panning to
// read the result. The polish run of 2026-11-26
// (docs/reports/polish-2026-11-26-construction-front-doors-phone.md) found 18 of
// 18 fields at 13 to 15 px on two construction front doors to the paid pay-app
// product and fixed them by hand. The scan below found the same thing in the
// source of 1,209 venture pages: tool CSS sets 15 px inputs and 12 to 14 px
// paste boxes as a matter of style, page after page. Measured in Chromium at
// 390 x 844 on the 202 front-door tool pages, 6,016 of 6,145 visible fields
// were under 16 px with the chrome as it was, and 0 with the floor
// (docs/reports/polish-2026-11-26-input-zoom-floor.md).
//
// So the floor lives in the shared chrome (`pf-chrome.css`, which every venture
// page links after its own styles), not in 1,138 pages: INPUT_ZOOM_CSS below.
// It applies only where the zoom happens (a touch screen, or any window 700 px
// wide or less), only to fields a visitor types into, and only raises a size:
// `max(16px, 1em)` keeps a field that inherits a larger size from its parent.
// `!important` because the ventures' own rules come with every specificity
// (`#feeders input`, inline `style=`), and the point is that no page can opt
// out of being usable on a phone by accident. Desktop is untouched.
//
// The scanner reports the pages whose own CSS sets a field under 16 px: those
// are the pages the floor is doing work on. It counts a `font-size` or `font`
// declaration under 16 px (px; rem and em under 1) in a rule whose selector
// ends on an `input`, `select` or `textarea` type selector (non-text inputs
// excluded), in the page's <style> blocks, a sibling .css file it links, or a
// field's inline style, skipping `@media print` and blocks that apply only
// from a min-width of 700 px up. Plain string work, no CSS parser.
// `input-zoom.test.mjs` checks the floor is in the chrome and that it wins.
//
//   node platform/pages/input-zoom.mjs            # count, front doors listed
//   node platform/pages/input-zoom.mjs --all      # every venture page

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..', '..');
export const MIN_PX = 16;
// A min-width at or above this is a desktop-only block (phones are under it).
const DESKTOP_MIN_WIDTH = 700;

/** Input types a visitor does not type into: iOS does not zoom on them. */
export const NON_TEXT_TYPES = ['checkbox', 'radio', 'range', 'color', 'file', 'submit', 'button', 'reset', 'image', 'hidden'];

/**
 * The floor, appended to `pf-chrome.css` by build.mjs (renderChromeStyle).
 * `(hover:none) and (pointer:coarse)` is a phone or tablet at any width,
 * landscape included; `max-width:700px` is a narrow window on anything.
 */
export const INPUT_ZOOM_CSS = `
/* No zoom on focus: iOS zooms into a field under 16px. See platform/pages/input-zoom.mjs. */
@media (hover:none) and (pointer:coarse),(max-width:700px){
  input:not(${NON_TEXT_TYPES.map((t) => `[type=${t}]`).join(',')}),select,textarea{font-size:max(16px,1em)!important}
}
`;

const NON_TEXT = /\[\s*type\s*=\s*["']?(checkbox|radio|range|color|file|submit|button|reset|hidden|image)\b/i;

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Size in px of a CSS length, or null when it is not a fixed small-able length. */
export function lengthPx(token) {
  const m = String(token).trim().match(/^(\d*\.?\d+)(px|rem|em)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].toLowerCase() === 'px' ? n : n * 16;
}

/** Font size in px a declaration sets, or null (keyword, var(), calc(), inherit). */
export function declaredSize(prop, value) {
  const v = value.replace(/!important/i, '').trim();
  if (prop === 'font-size') return lengthPx(v);
  if (prop === 'font') {
    // font: [style] [weight] size[/line-height] family: the size is the first length token.
    for (const tok of v.split(/\s+/)) {
      const size = tok.split('/')[0];
      const px = lengthPx(size);
      if (px !== null) return px;
    }
  }
  return null;
}

/** True when a selector list has a member that ends on a text-entry field. */
export function targetsField(selectorList) {
  return selectorList.split(',').some((sel) => {
    const parts = sel.trim().split(/\s*[\s>+~]\s*/).filter(Boolean);
    const last = parts[parts.length - 1] || '';
    if (/::?(placeholder|-webkit-[\w-]+)/i.test(last)) return false;
    if (!/^(input|select|textarea)(?![\w-])/i.test(last)) return false;
    return !NON_TEXT.test(last);
  });
}

function desktopOnly(prelude) {
  const p = prelude.toLowerCase();
  if (!p.startsWith('@media')) return false;
  if (/\bprint\b/.test(p) && !/\bscreen\b|\ball\b/.test(p)) return true;
  if (/max-width/.test(p)) return false;
  const m = p.match(/min-width\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)/);
  if (!m) return false;
  const px = m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16;
  return px >= DESKTOP_MIN_WIDTH;
}

/** [{ selector, size }] for every rule in `css` that sets a field under MIN_PX. */
export function cssFindings(css) {
  const text = stripComments(css);
  const out = [];
  // Walk blocks: a stack of preludes; a rule's declarations are the text
  // between its `{` and the matching `}` when no nested block opens inside.
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      stack.push({ prelude: text.slice(start, i).trim(), bodyStart: i + 1, nested: false });
      if (stack.length > 1) stack[stack.length - 2].nested = true;
      start = i + 1;
    } else if (ch === '}') {
      const block = stack.pop();
      start = i + 1;
      if (!block || block.nested || block.prelude.startsWith('@')) continue;
      if (stack.some((b) => desktopOnly(b.prelude))) continue;
      if (!targetsField(block.prelude)) continue;
      for (const decl of text.slice(block.bodyStart, i).split(';')) {
        const c = decl.indexOf(':');
        if (c < 0) continue;
        const size = declaredSize(decl.slice(0, c).trim().toLowerCase(), decl.slice(c + 1));
        if (size !== null && size < MIN_PX) out.push({ selector: block.prelude.replace(/\s+/g, ' '), size });
      }
    } else if (ch === ';' && stack.length === 0) {
      start = i + 1; // top-level @import / @charset
    }
  }
  return out;
}

/** Findings for one HTML page: its <style> blocks, linked local CSS, inline field styles. */
export function pageFindings(html, readLocal = () => null) {
  const out = [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) out.push(...cssFindings(m[1]));
  for (const m of html.matchAll(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi)) {
    const href = m[0].match(/href=["']([^"']+)["']/i)?.[1];
    if (!href || /^(https?:)?\/\//i.test(href) || href.startsWith('/')) continue;
    const css = readLocal(href.split(/[?#]/)[0]);
    if (css) out.push(...cssFindings(css));
  }
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    if (m[1].toLowerCase() === 'input' && /type=["']?(checkbox|radio|range|color|file|submit|button|reset|hidden|image)\b/i.test(m[2])) continue;
    const style = m[2].match(/style=(["'])([\s\S]*?)\1/i)?.[2];
    if (!style) continue;
    for (const decl of style.split(';')) {
      const c = decl.indexOf(':');
      if (c < 0) continue;
      const size = declaredSize(decl.slice(0, c).trim().toLowerCase(), decl.slice(c + 1));
      if (size !== null && size < MIN_PX) out.push({ selector: `<${m[1].toLowerCase()} style>`, size });
    }
  }
  return out;
}

/** Folder of every front-door tool that exists under ventures/. */
export function frontDoorDirs(root = REPO) {
  const map = JSON.parse(readFileSync(join(HERE, 'front-doors.json'), 'utf8'));
  return Object.keys(map.tools).sort().map((slug) => join(root, 'ventures', slug)).filter((d) => existsSync(d));
}

/** { 'ventures/x/page.html': 'selector (13px); ...' } for every front-door page with a zooming field. */
export function scan(root = REPO, dirs = frontDoorDirs(root)) {
  const found = {};
  for (const dir of dirs) {
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.html')).sort()) {
      const html = readFileSync(join(dir, name), 'utf8');
      if (!/<(input|select|textarea)\b/i.test(html)) continue;
      const readLocal = (href) => {
        const p = join(dir, href);
        return p.startsWith(dir) && existsSync(p) ? readFileSync(p, 'utf8') : null;
      };
      const f = pageFindings(html, readLocal);
      if (f.length) found[relative(root, join(dir, name)).split('\\').join('/')] = f.map((x) => `${x.selector} (${+x.size.toFixed(2)}px)`).join('; ');
    }
  }
  return found;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const all = process.argv.includes('--all');
  const dirs = all
    ? readdirSync(join(REPO, 'ventures'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(REPO, 'ventures', e.name)).sort()
    : frontDoorDirs();
  const found = scan(REPO, dirs);
  console.log(`${Object.keys(found).length} ${all ? 'venture' : 'front-door'} pages set a form field under ${MIN_PX}px in their own CSS (the chrome's floor covers them on a phone)`);
  for (const [p, v] of Object.entries(found)) console.log(`  ${p}: ${v}`);
}
