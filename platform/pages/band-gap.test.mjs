// The space under the site band on tool pages
// (docs/reports/polish-2026-11-13-band-gap.md).
//
// The chrome stylesheet zeroes the venture body's top padding so the band meets
// the top edge. On most tool pages that padding was the only space above the
// first line, so 123 pages drew their eyebrow or h1 0 to 2px under the band, or
// 3px into it. The build now marks those bands (`data-pfs-gap`) and gives them
// a 16px bottom margin that collapses with the first child's own margin.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bodyTopPadded, injectChrome, renderChromeStyle } from './build.mjs';

test('bodyTopPadded reads the venture body rule, shorthand or longhand, at any width', () => {
  const yes = [
    'body { max-width: 980px; margin: auto; padding: 28px; }',
    'body { padding: 1.5rem; line-height: 1.55; }',
    'body{padding:32px 18px}',
    'html, body { padding-top: .5rem }',
    '@media (max-width: 600px) { body { padding: 12px 8px } }',
    'main { color: red } body { margin: 0 auto; padding: 26px 16px 40px; }',
  ];
  for (const css of yes) assert.equal(bodyTopPadded(`<style>${css}</style>`), true, css);
  const no = [
    'body { margin: 0; padding: 0 16px }',
    'body { padding: 0.0px 3px }',
    'main { padding: 32px }',
    'body.print { padding: 9px }',
    '/* body { padding: 9px } */ body { padding: 0 }',
    'body { margin: 0 }',
  ];
  for (const css of no) assert.equal(bodyTopPadded(`<style>${css}</style>`), false, css);
  assert.equal(bodyTopPadded('<p>body { padding: 9px }</p>'), false, 'text outside <style> is not CSS');
});

const page = (css) => `<!doctype html><html><head><title>X</title><style>${css}</style></head><body><main><h1>X</h1></main></body></html>`;
const band = (html) => /<nav class="pf-chrome pf-chrome-top"[^>]*>/.exec(html)?.[0] ?? '';

test('a band over a padded venture body carries data-pfs-gap; any other does not', () => {
  const opts = { slug: 'x', toRoot: '../', total: 2, related: [] };
  assert.match(band(injectChrome(page('body { padding: 28px }'), opts)), /\sdata-pfs-head data-pfs-gap>$/);
  assert.doesNotMatch(band(injectChrome(page('main { padding: 32px }'), opts)), /data-pfs-gap/);
  // rates.mjs and jobs.mjs find the band by its exact opening; the attribute must not touch the class.
  assert.match(injectChrome(page('body { padding: 28px }'), opts), /<nav class="pf-chrome pf-chrome-top" aria-label="Site"/);
});

test('the gap rule outweighs the venture header reset and steps aside for a bar under the band', () => {
  const css = renderChromeStyle();
  assert.ok(css.includes('nav.pf-chrome.pf-chrome-top[data-pfs-head][data-pfs-gap]{margin-bottom:16px}'),
    'four classes/attributes plus nav beat VENTURE_CHROME_CSS (nav.pf-chrome.pf-chrome-top[data-pfs-head], margin:0)');
  assert.ok(css.includes('nav.pf-chrome.pf-chrome-top[data-pfs-head][data-pfs-gap]:has(+ .pf-rates, + .pf-jobs){margin-bottom:0}'));
  assert.ok(css.indexOf('{margin-bottom:16px}') < css.indexOf('{margin-bottom:0}'), 'the bar exception comes after the floor');
});
