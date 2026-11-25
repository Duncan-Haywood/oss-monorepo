// Tests for BAR_TONE_JS (bar-tone.mjs): the shop-rates and saved-bids bars take
// the venture's own primary button colour, or keep the neutral grey. Browser
// tests skip when Playwright cannot load (PLAYWRIGHT / CHROME_PATH, as in
// bar-align.test.mjs).
import { loadPlaywright } from './load-playwright.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BAR_TONE_JS, barToneCss } from './bar-tone.mjs';
import { renderSavedBidsModule, renderSavedBidsStyle } from './jobs.mjs';
import { renderShopRatesModule, renderShopRatesStyle } from './rates.mjs';

const chromium = (await loadPlaywright())?.chromium ?? null;
const skip = !chromium && 'playwright not installed';

test('both bar scripts carry the toner, call it on reveal, and parse', () => {
  for (const js of [renderSavedBidsModule(), renderShopRatesModule()]) {
    assert.ok(js.includes('var pfToneBar = function(root)'));
    assert.ok(js.includes('pfToneBar(root);'));
    assert.doesNotThrow(() => new Function(js));
  }
  assert.doesNotThrow(() => new Function(`${BAR_TONE_JS}; return pfToneBar;`));
});

test('both bar stylesheets draw a toned button only under data-pf-tone', () => {
  assert.ok(renderSavedBidsStyle().includes('.pf-jobs[data-pf-tone] button{'));
  assert.ok(renderShopRatesStyle().includes('.pf-rates[data-pf-tone] button{'));
  // The neutral rule is still there for every page the toner leaves alone.
  assert.ok(renderSavedBidsStyle().includes('.pf-jobs button{font:inherit'));
  assert.match(barToneCss('x'), /rgb\(var\(--pf-tone\)\)/);
});

const page = (bodyCss, venture) => `<!doctype html>
<html><head><style>
  body{margin:0;font:16px/1.4 sans-serif;${bodyCss}}
  ${barToneCss('bar')}
  .bar button{background:#8080801f;border:1px solid #80808059;border-radius:7px}
</style></head><body>
<nav class="pf-site"><button style="background:#0b4f9c;color:#fff">Search</button></nav>
<section class="bar"><button>Saved bids</button></section>
${venture}
<script>${BAR_TONE_JS}; pfToneBar(document.querySelector('.bar'));</script>
</body></html>`;

async function read(html, colorScheme = 'light') {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const p = await (await browser.newContext({ colorScheme })).newPage();
    await p.setContent(html, { waitUntil: 'load' });
    return await p.evaluate(() => {
      const bar = document.querySelector('.bar');
      const s = getComputedStyle(bar.querySelector('button'));
      return { toned: bar.hasAttribute('data-pf-tone'), tone: bar.style.getPropertyValue('--pf-tone'), color: s.color, radius: s.borderTopLeftRadius };
    });
  } finally {
    await browser.close();
  }
}

const teal = '<main><a href="#f" style="background:#1d5c7a;color:#fff;border-radius:10px;padding:8px">Start a takeoff</a></main>';

test("a dark, saturated venture button: the bar takes its colour and radius", { skip }, async () => {
  const r = await read(page('background:#f2f0ea', teal));
  assert.equal(r.toned, true);
  assert.equal(r.tone, '29 92 122');
  assert.equal(r.color, 'rgb(29, 92, 122)');
  assert.equal(r.radius, '10px');
});

test('grey or light venture buttons only: the neutral grey stays', { skip }, async () => {
  const r = await read(page('background:#fff',
    '<main><button style="background:#eef5ec;color:#1c2420">Copy bid link</button><button style="background:#b9efbd;color:#17312b">Copy summary</button></main>'));
  assert.equal(r.toned, false);
  assert.equal(r.radius, '7px');
});

test('the site chrome\'s own blue button is not the venture\'s', { skip }, async () => {
  const r = await read(page('background:#fff', '<main><p>No buttons here.</p></main>'));
  assert.equal(r.toned, false);
});

test('a colour that would read under 4.5:1 as a label: the neutral grey stays', { skip }, async () => {
  // White on this orange passes, but the orange as text on its own tint does not.
  const orange = '<main><button style="background:#c05430;color:#fff">Normalize this quote</button></main>';
  assert.equal((await read(page('background:#fff', orange))).toned, false);
  // And the teal on a dark page is far under it.
  assert.equal((await read(page('background:#111;color:#eee', teal))).toned, false);
});

test('a venture dark mode re-runs the test on a scheme change', { skip }, async () => {
  const css = 'background:#fff} @media (prefers-color-scheme:dark){body{background:#111;color:#eee}';
  assert.equal((await read(page(css, teal), 'light')).toned, true);
  assert.equal((await read(page(css, teal), 'dark')).toned, false);
});
