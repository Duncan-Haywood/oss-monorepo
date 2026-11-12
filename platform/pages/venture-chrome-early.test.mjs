// Browser tests for VENTURE_CHROME_EARLY_JS (site-nav.mjs): the venture
// header is full width, in the right palette, before anything below it is
// parsed. Skip when Playwright cannot load (PLAYWRIGHT / CHROME_PATH, as in
// bar-align.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { VENTURE_CHROME_CSS, VENTURE_CHROME_EARLY_JS, VENTURE_CHROME_JS } from './site-nav.mjs';

let chromium = null;
try {
  const mod = await import(process.env.PLAYWRIGHT || 'playwright');
  chromium = mod.chromium ?? mod.default?.chromium;
} catch { /* skipped below */ }
const skip = !chromium && 'playwright not installed';

// A venture with a centred 780 px body. The script after the venture's first
// line records the header's box at that moment, which is what the first paint
// can show; the end-of-body script is pf-site.js's half.
const page = (bodyCss, { early = true } = {}) => `<!doctype html>
<html><head><style>${VENTURE_CHROME_CSS}
  html{margin:0}
  body{margin:0 auto;max-width:780px;padding:0 16px;font:16px/1.4 sans-serif;${bodyCss}}
</style></head><body>
<nav class="pf-chrome pf-chrome-top" aria-label="Site" data-pfs-head><span class="pfs-bar"><a class="pfs-brand" href="/">Site</a></span></nav>${early ? `<script>${VENTURE_CHROME_EARLY_JS}</script>` : ''}
<h1>Tool</h1>
<script>
  var n=document.querySelector('nav'),r=n.getBoundingClientRect();
  window.firstBox={left:Math.round(r.left),width:Math.round(r.width),theme:n.getAttribute('data-pfs-theme'),
    pad:Math.round(parseFloat(getComputedStyle(n).paddingLeft))};
</script>
<p style="height:3000px">Body</p>
<script>${VENTURE_CHROME_JS}</script>
</body></html>`;

async function run(html, width = 1280) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const p = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
    await p.setContent(html, { waitUntil: 'load' });
    return await p.evaluate(() => {
      const n = document.querySelector('nav'), r = n.getBoundingClientRect();
      return {
        first: window.firstBox,
        last: { left: Math.round(r.left), width: Math.round(r.width) },
        vw: document.documentElement.clientWidth,
        bodyLeft: Math.round(document.querySelector('h1').getBoundingClientRect().left),
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
  } finally {
    await browser.close();
  }
}

test('without the inline fit, the header starts in the venture box (the shift it removes)', { skip }, async () => {
  const m = await run(page('', { early: false }));
  assert.equal(m.first.width, 780, 'the venture column before pf-site.js runs');
  assert.equal(m.last.width, m.vw, 'and full width after');
});

test('with it, the header is full width before the venture markup, and its text lines up with the body', { skip }, async () => {
  const m = await run(page(''));
  assert.equal(m.first.left, 0);
  assert.equal(m.first.width, m.vw);
  assert.equal(m.first.pad, m.bodyLeft, 'the offset became padding, so the bar text stays over the venture column');
  assert.deepEqual(m.last, { left: 0, width: m.vw }, 'and the end-of-body re-run leaves it there');
  assert.equal(m.sideways, false);
});

test('a dark venture gets the dark header before first paint, not after', { skip }, async () => {
  const m = await run(page('background:#10151c;color:#eee'));
  assert.equal(m.first.theme, 'dark');
});

test('on a phone-width body that already fills the window it changes nothing', { skip }, async () => {
  const m = await run(page('max-width:none;padding:0'), 390);
  assert.equal(m.first.left, 0);
  assert.equal(m.first.width, 390);
  assert.equal(m.first.pad, 0);
  assert.equal(m.sideways, false);
});
