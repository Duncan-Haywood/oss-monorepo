// The hub hero's rotating "Built for ___" line must not change height as its
// words turn (2026-11-11, docs/reports/polish-2026-11-11-wft-perf-hypotheses.md):
// on a phone the long audience names wrap to a second line, and the hero grew
// and shrank by a line every few seconds, moving the search box, the stats and
// the hero's backdrop (CLS 0.087 on a throttled load of the hub).
// Browser tests skip when Playwright cannot load (PLAYWRIGHT, as in sticky-fit.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_MOTION_CSS, HOME_MOTION_SCRIPT, longestWord } from './showcase.mjs';

let chromium = null;
try {
  const mod = await import(process.env.PLAYWRIGHT || 'playwright');
  chromium = mod.chromium ?? mod.default?.chromium;
} catch { /* skipped below */ }
const skip = !chromium && 'playwright not installed';

const WORDS = ['Roofers', 'HVAC contractors', 'Plumbers', 'Pool & hot tub pros', 'Amazon sellers & KDP authors', 'Resellers'];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function page({ script = true } = {}) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
  body { margin: 0; font: 16px/1.55 system-ui, sans-serif; } .hero-inner { padding: 0 16px; }
  ${HOME_MOTION_CSS}</style></head><body>
  <header class="hero"><div class="hero-inner">
    <p class="ticker" data-longest="${esc(longestWord(WORDS))}"><span>Built for <b data-words="${esc(JSON.stringify(WORDS))}">${esc(WORDS[0])}</b> and anyone with numbers to run.</span></p>
    <p id="below">The search box sits here.</p>
  </div></header>
  ${script ? `<script>${HOME_MOTION_SCRIPT}</script>` : ''}</body></html>`;
}

test('longestWord picks the audience name with the most characters', () => {
  assert.equal(longestWord(WORDS), 'Amazon sellers & KDP authors');
  assert.equal(longestWord([]), '');
});

for (const width of [320, 412, 1280]) {
  test(`at ${width} px the line is as tall as its tallest word before any script, and stays so as the words turn`, { skip }, async () => {
    const browser = await chromium.launch();
    try {
      const pg = await browser.newPage({ viewport: { width, height: 800 } });
      // Each word's own height, with nothing reserved: the bar to meet.
      await pg.setContent(page({ script: false }).replace(' data-longest=', ' data-x='));
      const natural = await pg.evaluate((words) => {
        const b = document.querySelector('.ticker b'), p = b.closest('.ticker');
        return words.map((w) => { b.textContent = w; return p.offsetHeight; });
      }, WORDS);
      const tallest = Math.max(...natural);
      // Before any script runs (first paint): the CSS reservation alone.
      await pg.setContent(page({ script: false }));
      const reserved = await pg.evaluate(() => document.querySelector('.ticker').offsetHeight);
      assert.ok(reserved >= tallest, `first paint reserves ${reserved}px, the tallest word needs ${tallest}px (each: ${natural})`);
      assert.ok(reserved <= tallest + 24, `first paint reserves ${reserved}px, more than a line above the tallest word (${tallest}px)`);
      // With the script: the "below" paragraph never moves as every word is shown.
      await pg.setContent(page());
      const tops = await pg.evaluate((words) => {
        const b = document.querySelector('.ticker b'), below = document.getElementById('below');
        return words.map((w) => { b.textContent = w; return below.getBoundingClientRect().top; });
      }, WORDS);
      assert.equal(new Set(tops).size, 1, `the content below the line moved: ${tops}`);
    } finally { await browser.close(); }
  });
}

test('under reduced motion the words never turn, so nothing is reserved', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 800 }, reducedMotion: 'reduce' });
    const pg = await ctx.newPage();
    await pg.setContent(page());
    const r = await pg.evaluate(() => { const p = document.querySelector('.ticker'); return { min: p.style.minHeight, after: getComputedStyle(p, '::after').content }; });
    assert.equal(r.min, '');
    assert.equal(r.after, 'none');
  } finally { await browser.close(); }
});
