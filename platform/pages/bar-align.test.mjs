// Tests for BAR_ALIGN_JS (bar-align.mjs): the shop-rates and saved-bids bars
// line up with the page's heading. Browser tests skip when Playwright cannot
// load (PLAYWRIGHT / CHROME_PATH, as in sticky-fit.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BAR_ALIGN_JS, BAR_ALIGN_MIN_WIDTH } from './bar-align.mjs';
import { renderSavedBidsModule } from './jobs.mjs';
import { renderShopRatesModule } from './rates.mjs';

let chromium = null;
try {
  const mod = await import(process.env.PLAYWRIGHT || 'playwright');
  chromium = mod.chromium ?? mod.default?.chromium;
} catch { /* skipped below */ }
const skip = !chromium && 'playwright not installed';

test('both bar scripts carry the aligner, call it on reveal, and parse', () => {
  for (const js of [renderSavedBidsModule(), renderShopRatesModule()]) {
    assert.ok(js.includes('var pfAlignBar = function(root)'));
    assert.ok(js.includes('pfAlignBar(root);'));
    assert.doesNotThrow(() => new Function(js));
  }
  assert.doesNotThrow(() => new Function(`${BAR_ALIGN_JS}; return pfAlignBar;`));
});

// The bar as the stylesheets draw it (1060 px, centred, 18 px padding) above a
// venture whose own column is `bodyCss`.
const page = (bodyCss, headingHtml = '<header><h1>Deck bid calculator</h1></header>') => `<!doctype html>
<html><head><style>
  html,body{margin:0}
  body{font:16px/1.4 sans-serif;${bodyCss}}
  .bar{max-width:1060px;margin:0 auto 12px;padding:8px 18px 0;box-sizing:border-box}
  header{max-width:740px}
  h1{margin:0}
</style></head><body>
<section class="bar"><p class="line" style="margin:0"><button>Saved bids</button></p></section>
${headingHtml}
<script>${BAR_ALIGN_JS}; pfAlignBar(document.querySelector('.bar'));</script>
</body></html>`;

async function measure(html, width) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const p = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
    await p.setContent(html, { waitUntil: 'load' });
    return await p.evaluate(() => {
      const bar = document.querySelector('.bar');
      const line = document.querySelector('.line').getBoundingClientRect();
      const h1 = document.querySelector('h1');
      return {
        line: Math.round(line.left),
        lineRight: Math.round(line.right),
        h1: h1 ? Math.round(h1.getBoundingClientRect().left) : null,
        style: bar.getAttribute('style'),
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
  } finally {
    await browser.close();
  }
}

test('a heading in a wider column than the bar: the bar moves out to it', { skip }, async () => {
  // wall-framing-takeoff's shape: a 1120 px column, so the h1 sat 30 px left of the bar's buttons.
  const m = await measure(page('max-width:1120px;margin:0 auto;padding:0 0'), 1280);
  assert.equal(m.h1, 80);
  assert.equal(m.line, 80);
  assert.equal(m.lineRight, 1200, 'the right edge mirrors the left, not the 740 px header');
  assert.equal(m.sideways, false);
});

test('a heading in a narrower column: the bar moves in to it', { skip }, async () => {
  const m = await measure(page('max-width:720px;margin:0 auto'), 1280);
  assert.equal(m.h1, 280);
  assert.equal(m.line, 280);
  assert.equal(m.lineRight, 1000);
});

test('a bar already lined up is left exactly as the stylesheet drew it', { skip }, async () => {
  const m = await measure(page('max-width:1060px;margin:0 auto', '<header style="padding:0 18px"><h1>Aligned</h1></header>'), 1280);
  assert.equal(m.h1, m.line);
  assert.ok(!m.style, `no inline style, got ${m.style}`);
});

test('no heading: left alone', { skip }, async () => {
  const none = await measure(page('max-width:1120px;margin:0 auto', ''), 1280);
  assert.ok(!none.style);
});

test('a heading above the bar (where the build now puts it) is lined up with too', { skip }, async () => {
  const html = page('max-width:1120px;margin:0 auto;padding:0 0', '')
    .replace('<section class="bar"', '<header><h1>Deck bid calculator</h1></header>\n<section class="bar"');
  const m = await measure(html, 1280);
  assert.equal(m.h1, 80);
  assert.equal(m.line, 80);
  assert.equal(m.sideways, false);
});

test(`a column under ${BAR_ALIGN_MIN_WIDTH} px is no column to align to`, { skip }, async () => {
  const m = await measure(page('margin:0', '<h1 style="margin-left:1100px">Squeezed</h1>'), 1280);
  assert.ok(!m.style, `left alone, got ${m.style}`);
});

test('on a phone the bar lines up with the heading and nothing scrolls sideways', { skip }, async () => {
  const m = await measure(page('padding:0 20px'), 390);
  assert.equal(m.line, 20);
  assert.equal(m.sideways, false);
});
