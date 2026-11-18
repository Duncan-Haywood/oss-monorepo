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
