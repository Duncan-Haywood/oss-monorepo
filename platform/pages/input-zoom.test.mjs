// Tests for input-zoom.mjs: the shared chrome's 16px phone floor on form fields
// (iOS zooms into a field under 16px on focus) and the scanner that counts the
// pages it covers. Browser tests skip when Playwright cannot load
// (PLAYWRIGHT / CHROME_PATH, as in sticky-fit.test.mjs).
import { loadPlaywright } from './load-playwright.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_ZOOM_CSS, cssFindings, pageFindings, targetsField, declaredSize, frontDoorDirs } from './input-zoom.mjs';
import { renderChromeStyle } from './build.mjs';

const chromium = (await loadPlaywright())?.chromium ?? null;
const skip = !chromium && 'playwright not installed';

test('the floor is in pf-chrome.css, last, so it follows every rule it overrides', () => {
  const css = renderChromeStyle();
  assert.ok(css.includes(INPUT_ZOOM_CSS), 'renderChromeStyle carries INPUT_ZOOM_CSS');
  assert.ok(css.trimEnd().endsWith(INPUT_ZOOM_CSS.trim()), 'INPUT_ZOOM_CSS closes the stylesheet');
});

test('the scanner reads sizes, selectors and media the way the browser would', () => {
  assert.equal(declaredSize('font-size', '15px'), 15);
  assert.equal(declaredSize('font-size', '.8rem !important'), 12.8);
  assert.equal(declaredSize('font', '600 13px/1.3 ui-monospace,monospace'), 13);
  assert.equal(declaredSize('font', 'inherit'), null);
  assert.equal(declaredSize('font-size', 'var(--s)'), null);
  assert.ok(targetsField('label input'));
  assert.ok(targetsField('.row > select'));
  assert.ok(targetsField('h1, textarea.paste'));
  assert.ok(!targetsField('input[type=checkbox]'));
  assert.ok(!targetsField('input::placeholder'));
  assert.ok(!targetsField('input + label'));
  assert.ok(!targetsField('.inputs'));
  const css = `
    input{font-size:15px}
    textarea{font:13px/1.4 monospace}
    input[type=radio]{font-size:10px}
    @media (min-width:900px){select{font-size:14px}}
    @media print{input{font-size:9pt}}
    @media (max-width:600px){textarea{font-size:12px}}
    select{font-size:16px}`;
  assert.deepEqual(cssFindings(css).map((f) => `${f.selector} ${f.size}`), ['input 15', 'textarea 13', 'textarea 12']);
  assert.deepEqual(pageFindings('<input name=a style="font-size:13px"><input type=checkbox style="font-size:9px">').map((f) => f.size), [13]);
});

test('every front door listed in front-doors.json has a folder the scanner reads', () => {
  assert.ok(frontDoorDirs().length > 150, 'front-door folders found');
});

// A venture page whose own CSS sets small fields at every specificity, with the
// chrome linked after it the way build.mjs links pf-chrome.css.
const page = `<!doctype html><html><head><style>
  body{font:15px/1.4 sans-serif}
  input,select{font-size:15px}
  #feeders input{font-size:14px}
  textarea{font:13px/1.4 monospace}
  .hero{font-size:20px}
  .hero input{font-size:inherit}
</style><style>${INPUT_ZOOM_CSS}</style></head><body>
<form id="feeders"><input id="num" type="number"><select id="sel"><option>a</option></select>
<textarea id="ta"></textarea><input id="inl" style="font-size:12px"><input id="cb" type="checkbox" style="font-size:9px"></form>
<p class="hero"><input id="big"></p>
</body></html>`;

async function sizes(viewport, touch) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage();
    await p.setContent(page, { waitUntil: 'load' });
    return await p.evaluate(() => Object.fromEntries(['num', 'sel', 'ta', 'inl', 'cb', 'big'].map((id) =>
      [id, parseFloat(getComputedStyle(document.getElementById(id)).fontSize)])));
  } finally {
    await browser.close();
  }
}

test('on a phone every field a visitor types into is at least 16px, and a larger one keeps its size', { skip }, async () => {
  const s = await sizes({ width: 390, height: 844 }, true);
  assert.deepEqual(s, { num: 16, sel: 16, ta: 16, inl: 16, cb: 9, big: 20 });
});

test('a touch screen in landscape, wider than 700px, gets the floor too', { skip }, async () => {
  const s = await sizes({ width: 932, height: 430 }, true);
  assert.equal(s.num, 16);
  assert.equal(s.ta, 16);
});

test('a desktop window keeps the venture\'s own sizes', { skip }, async () => {
  const s = await sizes({ width: 1280, height: 900 }, false);
  assert.deepEqual(s, { num: 14, sel: 15, ta: 13, inl: 12, cb: 9, big: 20 });
});
