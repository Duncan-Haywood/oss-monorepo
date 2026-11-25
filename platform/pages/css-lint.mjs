// A small CSS lint for the one mistake browsers hide best: a length with no unit.
//
// `margin:1 auto` or `padding:4` is not a length, so the browser drops the whole declaration
// without a word, and the element quietly loses its centering or spacing. Only `0` may go
// without a unit. Found by the red team on 2026-11-11: seeding `margin:0 auto` -> `margin:1 auto`
// and `margin:0` -> `margin:1` in the shared site chrome (platform/pages/site-nav.mjs) passed
// every test. Plain string work, no CSS parser: comments are stripped, then each `prop:value`
// declaration whose property takes only lengths is checked token by token, skipping anything
// inside parentheses (calc(100% / 3) takes bare numbers legitimately) except a var() fallback.
// `margin:var(--m, 8px 1 0)` falls back to `8px 1 0` when --m is unset, which is invalid at
// computed-value time, so the margin silently becomes 0: the fallback is a length like any
// other (red team 2026-11-16: `var(--jump-margin,8px 0 0)` -> `8px 1 0` in jump-row.mjs passed).

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
  // Shorthands that take a width among other parts: `border:1 solid` (or a seeded `border:0` ->
  // `border:1`) is as invalid as `margin:1`, and the element keeps whatever border it had
  // (red team 2026-11-17, stories.mjs: `.has-covers .jump a { border:0 }` -> `border:1` passed).
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-block', 'border-inline', 'border-block-start', 'border-block-end', 'border-inline-start', 'border-inline-end',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'outline', 'column-rule', 'column-rule-width',
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
  const flat = [];
  for (const t of out) {
    if (!t.includes('(')) flat.push(t);
    else { const fb = varFallback(t); if (fb !== null) flat.push(...topLevelTokens(fb)); }
  }
  return flat;
}

// The fallback of a token that is exactly `var(--name, fallback)`, or null (no fallback, or
// any other function: calc(), min(), color-mix() ...).
function varFallback(token) {
  const m = /^var\(\s*--[\w-]+\s*,([\s\S]*)\)$/i.exec(token);
  if (!m) return null;
  // The match must close the var( it opened: `var(--a,1) calc(2)` is not one var().
  let depth = 0;
  for (const ch of m[1]) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return null;
  }
  return depth === 0 ? m[1] : null;
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

/**
 * The <style> blocks of an HTML page, joined. Scripts are dropped first: a `"<style>"` string
 * inside one (csshound builds a page that way) is not a stylesheet.
 */
export function styleBlocks(html) {
  let text = String(html || '');
  let previous;
  do {
    previous = text;
    text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ');
  } while (text !== previous);
  return [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\b[^>]*>/gi)].map((m) => m[1]).join('\n');
}

// An invalid selector is the other silent drop: the browser throws away the whole rule, every
// declaration in it. Red team 2026-11-17, stories.mjs: `.shelf > p, .shelf-intro > p` ->
// `.shelf-intro >= p` passed every test, and the shelf text lost its 68ch measure. The faults
// a slip (or a seeded mutant) makes in a selector are a comparison (`>=`, `<`, `=` outside an
// attribute selector) or a lone `-` or `/` where a `+` or `*` combinator stood. Only style-rule
// selectors are read: an at-rule prelude (`@media (width >= 600px)`) may compare legitimately,
// and strings, [attribute] and (argument) contents (`:nth-child(2n - 1)`) are skipped.

/**
 * Style-rule selectors in `css` that no browser can parse, as [{ selector, why }] in source
 * order; an empty list means clean. Plain string work like unitlessLengths.
 */
export function badSelectors(css) {
  const found = [];
  const text = stripComments(String(css || ''))
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
  // A selector runs from the last `{`, `}` or `;` to the `{` that opens its block.
  for (const m of text.matchAll(/(?<=^|[{};])([^{};]*)\{/g)) {
    const selector = m[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    // Keyframe stops (from, to, 40%) are selectors only inside @keyframes, and never fail this.
    let bare = selector;
    for (let prev = ''; prev !== bare;) { prev = bare; bare = bare.replace(/\[[^[\]]*\]|\([^()]*\)/g, '_'); }
    let why = null;
    if (/>=|<|=/.test(bare)) why = 'a comparison is not a combinator';
    else if (/(^|\s)[-/](\s|$)/.test(bare)) why = 'a lone - or / is not a combinator';
    else if (/(^|,)\s*(,|$)/.test(bare)) why = 'an empty selector in the list';
    if (why) found.push({ selector, why });
  }
  return found;
}
