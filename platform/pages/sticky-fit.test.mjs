// Behavioural tests for STICKY_FIT_JS (sticky-fit.mjs) in a real browser.
// Playwright is not a dependency: the browser tests skip when it cannot load
// (PLAYWRIGHT / CHROME_PATH, as in lab.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { STICKY_FIT_CSS, STICKY_FIT_JS } from './sticky-fit.mjs';
import { renderChromeModule, renderChromeStyle } from './build.mjs';
import { stripForInjection } from './jobs.mjs';

let chromium = null;
try {
  const mod = await import(process.env.PLAYWRIGHT || 'playwright');
  chromium = mod.chromium ?? mod.default?.chromium;
} catch { /* skipped below */ }
const skip = !chromium && 'playwright not installed';

test('pf-site.js carries the sticky fit, and it parses', () => {
  const js = renderChromeModule();
  assert.ok(js.includes(stripForInjection(STICKY_FIT_JS)));
  assert.doesNotThrow(() => new Function(stripForInjection(STICKY_FIT_JS)));
  // It never asks every element for its computed style (the cost the
  // scroll-box sweep learned): candidates come from rules and style attributes.
  assert.ok(!/getElementsByTagName\('\*'\)|querySelectorAll\('\*'\)/.test(STICKY_FIT_JS));
});

// A form column longer than the card, so the card has room to travel, the
// shape of the bid calculators' layout.
const page = (cardRows, formHeight = 3000, extra = '') => `<!doctype html><html><head><style>
  body{margin:0;font:16px/1.4 sans-serif}
  .layout{display:grid;grid-template-columns:1fr 360px;gap:16px;align-items:start;padding:0 16px}
  .form{height:${formHeight}px;background:#eee}
  .result{position:sticky;top:15px;background:#222;color:#eee;padding:16px}
  .result p{margin:0;height:40px}
  ${extra}
</style></head><body><div class="layout"><div class="form"></div>
<section class="result"><h2>Your bid</h2>${'<p>row</p>'.repeat(cardRows)}<button>Copy</button></section></div>
<script>${stripForInjection(STICKY_FIT_JS)}</script></body></html>`;

async function withPage(html, height, fn) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const p = await (await browser.newContext({ viewport: { width: 1280, height } })).newPage();
    await p.setContent(html, { waitUntil: 'load' });
    await p.waitForTimeout(100);
    await fn(p);
  } finally {
    await browser.close();
  }
}

const state = (p) => p.evaluate(() => {
  const el = document.querySelector('.result');
  scrollTo(0, 1200);
  const r = el.getBoundingClientRect();
  return {
    fit: el.hasAttribute('data-pf-sticky-fit'),
    maxHeight: el.style.maxHeight,
    overflowY: getComputedStyle(el).overflowY,
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    scrolls: el.scrollHeight > el.clientHeight,
    tabindex: el.getAttribute('tabindex'),
  };
});

test('a card taller than the window scrolls inside, and its bottom is in view while stuck', { skip }, async () => {
  await withPage(page(30), 700, async (p) => {
    const s = await state(p);
    assert.equal(s.fit, true);
    assert.equal(s.maxHeight, '638px', 'the window less the card top above and below, less its 16 px padding');
    assert.equal(s.bottom, 685, 'the same 15 px gap below as above');
    assert.equal(s.overflowY, 'auto');
    assert.equal(s.top, 15, 'still stuck at its own top: the headline stays in view');
    assert.ok(s.bottom <= 700, `card bottom at ${s.bottom}, below a 700 px window`);
    assert.ok(s.scrolls);
    assert.equal(s.tabindex, null, 'a card with a button in it needs no extra tab stop');
  });
});

test('a card that fits is left exactly as it was', { skip }, async () => {
  await withPage(page(5), 700, async (p) => {
    const s = await state(p);
    assert.equal(s.fit, false);
    assert.equal(s.maxHeight, '');
    assert.equal(s.overflowY, 'visible');
  });
});

test('a card with no room to travel is left alone (capping it would only move the page)', { skip }, async () => {
  await withPage(page(30, 300), 700, async (p) => {
    const s = await p.evaluate(() => document.querySelector('.result').hasAttribute('data-pf-sticky-fit'));
    assert.equal(s, false);
  });
});

test('a card that sets its own row height, with rows after it, is left alone (no layout shift)', { skip }, async () => {
  // The card is longer than the form beside it, and the grid has a second row
  // below: there is travel, but capping would pull that row up the page.
  const html = page(30, 500).replace('</section></div>', '</section><div style="grid-column:1/-1;height:2000px" id="after"></div></div>');
  await withPage(html, 700, async (p) => {
    const s = await p.evaluate(() => ({
      fit: document.querySelector('.result').hasAttribute('data-pf-sticky-fit'),
      after: Math.round(document.getElementById('after').getBoundingClientRect().top + scrollY),
      card: Math.round(document.querySelector('.result').getBoundingClientRect().height),
    }));
    assert.equal(s.fit, false);
    assert.ok(s.after >= s.card, `the row below moved up to ${s.after}px, above the card's ${s.card}px foot`);
  });
});

test('the cap follows the window and the card: a taller window or a shorter card releases it', { skip }, async () => {
  await withPage(page(30), 700, async (p) => {
    assert.equal((await state(p)).fit, true);
    await p.setViewportSize({ width: 1280, height: 2000 });
    await p.waitForTimeout(150);
    assert.equal((await state(p)).fit, false, 'a 2000 px window holds the whole card');
    await p.setViewportSize({ width: 1280, height: 700 });
    await p.waitForTimeout(150);
    assert.equal((await state(p)).fit, true);
    // A recalculation that shortens the card, announced by an input event.
    await p.evaluate(() => {
      document.querySelectorAll('.result p').forEach((n, i) => { if (i > 3) n.remove(); });
      dispatchEvent(new Event('input'));
    });
    await p.waitForTimeout(150);
    const s = await state(p);
    assert.equal(s.fit, false);
    assert.equal(s.maxHeight, '');
  });
});

test('a card where the media query turns sticky off is not touched', { skip }, async () => {
  await withPage(page(30, 3000, '@media (max-height:900px){.result{position:static}}'), 700, async (p) => {
    assert.equal((await state(p)).fit, false);
  });
});

test('printing releases the cap so the card is not cut off on paper', { skip }, async () => {
  await withPage(page(30), 700, async (p) => {
    assert.equal((await state(p)).fit, true);
    const during = await p.evaluate(() => {
      dispatchEvent(new Event('beforeprint'));
      const el = document.querySelector('.result');
      return { fit: el.hasAttribute('data-pf-sticky-fit'), maxHeight: el.style.maxHeight };
    });
    assert.deepEqual(during, { fit: false, maxHeight: '' });
    await p.evaluate(() => dispatchEvent(new Event('afterprint')));
    await p.waitForTimeout(150);
    assert.equal((await state(p)).fit, true);
  });
});

test('a card with nothing focusable in it gets a tab stop while it scrolls, and loses it after', { skip }, async () => {
  const html = page(30).replace('<button>Copy</button>', '');
  await withPage(html, 700, async (p) => {
    assert.equal((await state(p)).tabindex, '0');
    await p.setViewportSize({ width: 1280, height: 2000 });
    await p.waitForTimeout(150);
    assert.equal((await state(p)).tabindex, null);
  });
});

test('pf-chrome.css carries the scroll hint, only for capped cards and only with scroll timelines', () => {
  assert.ok(renderChromeStyle().includes(STICKY_FIT_CSS));
  // Every mask rule sits behind @supports or turns the mask off: without a
  // scroll timeline the fade could not lift at the end and would dim the
  // card's last line for good.
  const gated = STICKY_FIT_CSS.slice(STICKY_FIT_CSS.indexOf('@supports (animation-timeline:scroll())'));
  const before = STICKY_FIT_CSS.slice(0, STICKY_FIT_CSS.indexOf('@supports'));
  assert.ok(!/mask-image/.test(before));
  assert.ok(/\[data-pf-sticky-fit\]\{[^}]*mask-image:linear-gradient/.test(gated));
  assert.ok(/forced-colors:active\)\{\[data-pf-sticky-fit\]\{[^}]*mask-image:none/.test(STICKY_FIT_CSS));
});

test('a capped card fades at its foot while more is below, and the fade lifts at the end', { skip }, async () => {
  await withPage(page(30, 3000, STICKY_FIT_CSS), 700, async (p) => {
    const read = () => p.evaluate(() => {
      const el = document.querySelector('.result');
      const cs = getComputedStyle(el);
      return {
        top: cs.getPropertyValue('--pf-fit-top').trim(),
        end: cs.getPropertyValue('--pf-fit-end').trim(),
        mask: cs.maskImage || cs.webkitMaskImage,
      };
    });
    assert.equal((await state(p)).fit, true);
    const start = await read();
    assert.match(start.mask, /linear-gradient/);
    assert.deepEqual([start.top, start.end], ['0px', '40px']);
    await p.evaluate(() => { const el = document.querySelector('.result'); el.scrollTop = el.scrollHeight; });
    await p.waitForTimeout(150);
    const end = await read();
    assert.deepEqual([end.top, end.end], ['24px', '0px']);
  });
});

test('a card that fits gets no fade', { skip }, async () => {
  await withPage(page(5, 3000, STICKY_FIT_CSS), 700, async (p) => {
    const mask = await p.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.result'));
      return cs.maskImage || cs.webkitMaskImage;
    });
    assert.equal(mask, 'none');
  });
});
