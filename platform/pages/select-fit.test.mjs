// A select in a table cell keeps a readable floor (select-fit.mjs), and the
// browser check that found the problem (select-clip.mjs) keeps its arithmetic.
// docs/reports/polish-2026-11-14-select-clip.md has the measurements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECT_FIT_CSS } from './select-fit.mjs';
import { REFLOW_CSS } from './reflow.mjs';
import { renderChromeStyle } from './build.mjs';
import { clipped, summarise } from './select-clip.mjs';

test('the rule rides in the chrome stylesheet, after the reflow rules it overrides', () => {
  const css = renderChromeStyle();
  const fit = css.indexOf(SELECT_FIT_CSS);
  const reflow = css.indexOf(REFLOW_CSS);
  assert.ok(fit >= 0, 'SELECT_FIT_CSS is in pf-chrome.css');
  assert.ok(reflow >= 0 && fit > reflow, 'it must come after REFLOW_CSS (same zero specificity, later wins)');
});

test('zero specificity, screen only, and only ever a minimum', () => {
  const rule = SELECT_FIT_CSS.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  assert.match(rule, /^@media screen\{:where\(td>select,th>select\)\{[^}]*\}\}$/);
  // A floor, never a width: a select that already fits must lay out as before.
  assert.doesNotMatch(rule, /(^|[{;])\s*width\s*:/);
  assert.match(rule, /min-width:calc-size\(max-content,min\(size,\d+em\)\)/);
});

test('the floor is capped, so one long option cannot widen a table that fitted', () => {
  // A bare max-content floor pushed service-load-check's table past its card
  // at 1,280px (a ~580px Kind column). The cap is what prevents that.
  const cap = Number(SELECT_FIT_CSS.match(/min\(size,(\d+)em\)/)[1]);
  assert.ok(cap >= 10 && cap <= 18, `cap ${cap}em`);
  assert.doesNotMatch(SELECT_FIT_CSS, /min-width:max-content/);
});

test('clipped(): text wider than the box less padding and arrow', () => {
  const base = { clientWidth: 200, paddingLeft: 8, paddingRight: 8, appearance: 'auto' };
  // 200 - 16 - 20 = 164 available.
  assert.equal(clipped({ ...base, textWidth: 164 }), false);
  assert.equal(clipped({ ...base, textWidth: 165 }), false, 'one pixel of rounding is allowed');
  assert.equal(clipped({ ...base, textWidth: 166 }), true);
  // With appearance:none the page draws (or omits) its own arrow inside the padding.
  assert.equal(clipped({ ...base, appearance: 'none', textWidth: 180 }), false);
  assert.equal(clipped({ ...base, appearance: 'none', textWidth: 190 }), true);
});

test('summarise(): pages, selects and crushed selects per width', () => {
  const rows = [
    { page: '/a/', width: 390, clip: [{ w: 31 }, { w: 200 }] },
    { page: '/b/', width: 390, clip: [{ w: 150 }] },
    { page: '/a/', width: 1280, clip: [{ w: 89 }] },
  ];
  assert.deepEqual(summarise(rows), {
    390: { pages: 2, selects: 3, crushed: 1 },
    1280: { pages: 1, selects: 1, crushed: 1 },
  });
});
