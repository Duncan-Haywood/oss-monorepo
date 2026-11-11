// A small CSS lint for the one mistake browsers hide best: a length with no unit.
//
// `margin:1 auto` or `padding:4` is not a length, so the browser drops the whole declaration
// without a word, and the element quietly loses its centering or spacing. Only `0` may go
// without a unit. Found by the red team on 2026-11-11: seeding `margin:0 auto` -> `margin:1 auto`
// and `margin:0` -> `margin:1` in the shared site chrome (platform/pages/site-nav.mjs) passed
// every test. Plain string work, no CSS parser: comments are stripped, then each `prop:value`
// declaration whose property takes only lengths is checked token by token, skipping anything
// inside parentheses (calc(100% / 3) and var(--x, 4) take bare numbers legitimately).

// Properties whose values are lengths or percentages (or keywords), never bare numbers.
const LENGTH_PROPS = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-block', 'margin-inline', 'margin-block-start', 'margin-block-end', 'margin-inline-start', 'margin-inline-end',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-block', 'padding-inline', 'padding-block-start', 'padding-block-end', 'padding-inline-start', 'padding-inline-end',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'inline-size', 'block-size', 'min-inline-size', 'max-inline-size',
  'top', 'right', 'bottom', 'left', 'inset',
  'gap', 'row-gap', 'column-gap', 'grid-gap',
  'border-radius', 'border-width', 'outline-offset', 'outline-width',
  'font-size', 'letter-spacing', 'word-spacing', 'text-indent',
  'text-underline-offset', 'scroll-margin-top', 'scroll-padding-top',
]);

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

// Top-level whitespace-separated tokens of a value, with parenthesised groups dropped.
function topLevelTokens(value) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of value) {
    if (ch === '(') { depth++; cur += ch; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); cur += ch; continue; }
    if (depth === 0 && /[\s,/]/.test(ch)) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out.filter((t) => !t.includes('('));
}

/**
 * Declarations in `css` that give a length property a bare non-zero number.
 * Returns [{ prop, value, token }] in source order; an empty list means clean.
 */
export function unitlessLengths(css) {
  const found = [];
  const text = stripComments(String(css || ''));
  // A declaration sits after `{` or `;` and runs to the next `;` or `}`.
  for (const m of text.matchAll(/[{;]\s*([a-zA-Z-]+)\s*:\s*([^;{}]*)/g)) {
    const prop = m[1].toLowerCase();
    if (!LENGTH_PROPS.has(prop)) continue;
    const value = m[2].replace(/!important\s*$/i, '').trim();
    for (const token of topLevelTokens(value)) {
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token) && Number(token) !== 0) found.push({ prop, value, token });
    }
  }
  return found;
}

/** The <style> blocks of an HTML page, joined. */
export function styleBlocks(html) {
  return [...String(html || '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
}
