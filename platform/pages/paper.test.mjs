import test from 'node:test';
import assert from 'node:assert/strict';
import { blinkPrintText, printedInk, contrast, isLarge, judge } from './paper.mjs';

// Printed 2026-11-19 with this repo's Chromium: each colour as text on a #123
// fill, page.pdf(), rasterised with `pdftoppm -r 96`, most common pixel per
// row. Background graphics off, as in the browser's default print dialog.
const MEASURED = [
  ['#ffffff', '#ababab'],
  ['#a9e8b5', '#6c9473'],
  ['#ffff00', '#abab00'],
  ['#88ccff', '#5b89ab'],
  ['#cccccc', '#787878'],
  ['#646464', '#646464'], // far enough from white: left alone
  ['#e0e0e0', '#8c8c8c'],
  ['#8899aa', '#444d56'],
  ['#ff8800', '#ff8800'], // far enough from white: left alone
  ['#c0c0c0', '#6c6c6c'],
];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

test('the model reproduces Chromium\'s printed text colour to one 8-bit step', () => {
  for (const [screen, paper] of MEASURED) {
    const got = blinkPrintText(rgb(screen));
    const want = rgb(paper);
    got.forEach((c, i) => assert.ok(Math.abs(c - want[i]) <= 1, `${screen}: got ${got} want ${want}`));
  }
});

test('white text on a dropped dark fill lands about 2.3:1 on white paper', () => {
  const ink = printedInk(
    { rgb: [255, 255, 255], alpha: 1, exact: false, opacity: 1 },
    [{ rgb: [17, 34, 51], alpha: 1, exact: false, image: false }],
  );
  assert.deepEqual(ink.bg, [255, 255, 255]);
  assert.ok(ink.ratio > 2.2 && ink.ratio < 2.4, String(ink.ratio));
});

test('print-color-adjust: exact keeps both the fill and the text colour', () => {
  const ink = printedInk(
    { rgb: [255, 255, 255], alpha: 1, exact: true, opacity: 1 },
    [{ rgb: [17, 34, 51], alpha: 1, exact: true, image: false }],
  );
  assert.deepEqual(ink.bg, [17, 34, 51]);
  assert.ok(ink.ratio > 15);
});

test('opacity fades the ink toward the paper', () => {
  const full = printedInk({ rgb: [80, 80, 80], alpha: 1, exact: false, opacity: 1 }, []);
  const faded = printedInk({ rgb: [80, 80, 80], alpha: 1, exact: false, opacity: 0.5 }, []);
  assert.ok(faded.ratio < full.ratio);
});

test('a kept background image is counted as unjudged, not passed', () => {
  const rows = [{
    text: { rgb: [255, 255, 255], alpha: 1, exact: true, opacity: 1 },
    fills: [{ rgb: [0, 0, 0], alpha: 0, exact: true, image: true }],
    px: 16, weight: 400,
  }];
  const j = judge(rows);
  assert.equal(j.unknown, 1);
  assert.equal(j.findings.length, 0);
});

test('large text needs 3:1, normal text 4.5:1', () => {
  assert.ok(isLarge(24, 400));
  assert.ok(isLarge(19, 700));
  assert.ok(!isLarge(19, 400));
  // Pure red is far from white, so Blink leaves it alone: 4.0:1 on paper,
  // which fails as body text and passes as a heading.
  const red = { rgb: [255, 0, 0], alpha: 1, exact: false, opacity: 1 };
  assert.deepEqual(blinkPrintText(red.rgb), [255, 0, 0]);
  assert.equal(judge([{ text: red, fills: [], px: 16, weight: 400 }]).findings.length, 1);
  assert.equal(judge([{ text: red, fills: [], px: 28, weight: 400 }]).findings.length, 0);
  assert.ok(Math.abs(contrast([255, 0, 0], [255, 255, 255]) - 4.0) < 0.01);
});

test('every published page carries the print fix, as valid script', async () => {
  const { PAPER_INK_JS } = await import('./paper.mjs');
  const { renderChromeModule } = await import('./build.mjs');
  const { stripForInjection } = await import('./jobs.mjs');
  const shipped = renderChromeModule();
  assert.ok(shipped.includes(stripForInjection(PAPER_INK_JS)), 'pf-site.js lacks PAPER_INK_JS');
  assert.ok(shipped.includes("addEventListener('beforeprint'"));
  // Escapes survive the template literal: a lost backslash turns \S into S.
  assert.ok(PAPER_INK_JS.includes('/\\S/.test(n.data)'));
  assert.ok(PAPER_INK_JS.includes('/\\bprint\\b/'));
  new Function(stripForInjection(PAPER_INK_JS)); // throws on a syntax error
});
