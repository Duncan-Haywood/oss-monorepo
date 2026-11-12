// The hub's hero lede has a word budget, so the search box stays above the fold on a phone.
//
// Polish 2026-11-12 (docs/reports/polish-2026-11-12-hub-lede.md): the lede had
// grown to five sentences (76 words), 13 lines at 320 px, and on a 360 x 660
// Android viewport the search input's bottom edge sat at 782 px, below the
// fold. Cut to two sentences (37 words), it sits at 629 px. The sentences cut
// repeat steps 2 and 3 of the how-it-works band further down the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderHub } from './build.mjs';

const BASE = 'https://example.test/';
const LEDE_WORD_BUDGET = 45;

const words = (html) =>
  html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);

test('the hub lede stays within its word budget and sits before the search', () => {
  const surfaces = [{ slug: 'roofing-bid-calculator', title: 'Roofing bid', description: 'Price a roof.', pageCount: 1 }];
  const html = renderHub(surfaces, BASE);
  const hero = html.slice(html.indexOf('<header class="hero">'));
  const m = hero.match(/<p class="lede">([\s\S]*?)<\/p>/);
  assert.ok(m, 'the hub hero has a lede');
  const n = words(m[1]).length;
  assert.ok(n <= LEDE_WORD_BUDGET,
    `hub lede is ${n} words (budget ${LEDE_WORD_BUDGET}); a longer lede pushes the search below the fold on a phone`);
  assert.ok(hero.indexOf('class="lede"') < hero.indexOf('role="search"'), 'the lede comes before the search');
});
