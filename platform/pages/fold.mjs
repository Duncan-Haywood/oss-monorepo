// The rule behind fold-check.mjs, kept free of Playwright so it can be tested
// without a browser (fold.test.mjs).
//
// An audience page ("free tools for retirees", c/for-*/) exists to put a tool
// in front of someone who searched for themselves. On 2026-11-18 three polish
// runs in a row (PRs #17145, #17147 and this one) measured, by hand, where the
// first tool card starts on a 390x844 phone, and two of them capped word
// counts as a stand-in. Word caps are a proxy: roofers' 85 words of intro and
// note start at 820 px, retirees' 92 started at 872. The heading is not the
// tool either: #17145 measured the "Start here" section top, ~75 px above the
// first card, and called retirees fixed while its first card sat at 846 px.
// This measures the card.

/** The first thing on an audience page a visitor can open. */
export const FIRST_TOOL_SELECTOR = '.start-grid li, main .card';

/** A phone screen, CSS px (iPhone 12-15 class). */
export const FOLD = { width: 390, height: 844 };

/**
 * How much of the card must show for it to count as on screen: the coloured
 * top border and the top of its number badge. Less is a sliver nobody reads
 * as a card.
 */
export const PEEK_PX = 16;

/**
 * Failures for a list of measured pages.
 * Each row is `{ page, top }`, `top` the first tool card's page y in CSS px,
 * or null when the page has no card at all.
 */
export function foldFailures(rows, { height = FOLD.height, peek = PEEK_PX } = {}) {
  const out = [];
  for (const { page, top } of rows) {
    if (top == null || !Number.isFinite(top)) {
      out.push(`${page}: no tool card (${FIRST_TOOL_SELECTOR}) on the page`);
    } else if (top + peek > height) {
      out.push(`${page}: first tool card starts at ${Math.ceil(top)}px; it needs to start by ${height - peek}px to show on a ${height}px screen`);
    }
  }
  return out;
}

/**
 * Screen widths for one fold-check run, from `--widths 320,360,375,390` or
 * WIDTHS (a comma list) or WIDTH (one). A polish run comparing four phone
 * widths used to need four runs (friction 2026-11-18); one browser can do all.
 * Throws on anything that is not a positive whole number of CSS px.
 */
export function parseWidths(text, fallback = FOLD.width) {
  const raw = String(text ?? '').trim();
  if (!raw) return [Number(fallback)];
  const out = [];
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const n = Number(part);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`not a screen width in CSS px: ${JSON.stringify(part)}`);
    if (!out.includes(n)) out.push(n);
  }
  if (!out.length) throw new Error(`no screen widths in ${JSON.stringify(raw)}`);
  return out;
}

/**
 * Every page's first-card top at every width, as text table lines, deepest
 * first (by the worst width), with how many px each has to spare (negative:
 * how far it misses). `byWidth` maps width -> rows `{ page, top }`.
 * Before/after numbers for a polish change used to need a separate per-page
 * probe, because the check printed only failures and the deepest page
 * (friction 2026-11-18).
 */
export function foldTable(byWidth, { height = FOLD.height, peek = PEEK_PX } = {}) {
  const widths = [...byWidth.keys()];
  const pages = new Map();
  for (const w of widths) {
    for (const { page, top } of byWidth.get(w)) {
      if (!pages.has(page)) pages.set(page, new Map());
      pages.get(page).set(w, top);
    }
  }
  const spare = (top) => (top == null || !Number.isFinite(top) ? -Infinity : height - peek - Math.ceil(top));
  const worst = (m) => Math.min(...widths.map((w) => spare(m.get(w))));
  const cell = (top) => {
    if (top === undefined) return 'not loaded';
    if (top == null || !Number.isFinite(top)) return 'no card';
    const s = spare(top);
    return `${Math.ceil(top)} (${s >= 0 ? '+' : ''}${s})`;
  };
  const rows = [...pages.entries()].sort((a, b) => worst(a[1]) - worst(b[1]) || a[0].localeCompare(b[0]));
  const head = ['page', ...widths.map((w) => `${w}px`)];
  const body = rows.map(([page, m]) => [page, ...widths.map((w) => cell(m.get(w)))]);
  const width = head.map((_, i) => Math.max(...[head, ...body].map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => c.padEnd(width[i])).join('  ').trimEnd();
  return [`first tool card top, px (spare to the ${height - peek}px line), height ${height}:`, line(head), ...body.map(line)];
}
