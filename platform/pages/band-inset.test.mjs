// The side gutter of the site band on tool pages
// (docs/reports/polish-2026-11-15-band-inset.md).
//
// The band is the venture body's first child, and its rows have no side
// padding of their own, so a venture that pads `main` instead of `body` put
// the brand, Search and the breadcrumb flush against the screen edges on a
// phone (61 tool pages at 390px on 2026-11-15). The build marks those bands
// `data-pfs-inset`, and the chrome stylesheet gives their rows a 16px gutter.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bodySidePadded, injectChrome, renderChromeStyle } from './build.mjs';

test('bodySidePadded reads the left side of a body padding, shorthand or longhand, at any width', () => {
  const yes = [
    'body { max-width: 980px; margin: auto; padding: 28px; }',
    'body{padding:32px 18px}',
    'body { padding: 0 16px }',
    'body { padding: 0 0 0 12px }',
    'html body { padding-left: 1rem }',
    'body { padding-inline: 14px }',
    '@media (max-width: 600px) { body { padding: 12px 8px } }',
    // the bare-tool base style (platform/pages/bare-tool.mjs)
    ':where(body) { max-width: 1000px; margin: auto; padding: 28px; }',
  ];
  for (const css of yes) assert.equal(bodySidePadded(`<style>${css}</style>`), true, css);
  const no = [
    'body { margin: 0 }',
    'body { padding: 24px 0 }',
    'body { padding: 0 }',
    'body { padding-top: 32px; padding-bottom: 8px }',
    'body { padding: 10px 0 10px 0 }',
    'main { max-width: 1100px; margin: auto; padding: 36px 20px 60px }',
    'body.print { padding: 9px }',
    '/* body { padding: 9px } */ body { padding: 0 }',
  ];
  for (const css of no) assert.equal(bodySidePadded(`<style>${css}</style>`), false, css);
  assert.equal(bodySidePadded('<p>body { padding: 9px }</p>'), false, 'text outside <style> is not CSS');
  assert.equal(bodySidePadded('<style>main{padding:20px}</style>', 'body{padding:0 18px}'), true, 'a linked stylesheet counts');
});

const page = (css) => `<!doctype html><html><head><title>X</title><style>${css}</style></head><body><main><h1>X</h1></main></body></html>`;
const band = (html) => /<nav class="pf-chrome pf-chrome-top"[^>]*>/.exec(html)?.[0] ?? '';
const opts = { slug: 'x', toRoot: '../', total: 2, related: [] };

test('a band over an unpadded venture body carries data-pfs-inset; a padded one does not', () => {
  assert.match(band(injectChrome(page('body { margin: 0 } main { padding: 32px 20px }'), opts)), /\sdata-pfs-inset>$/);
  assert.doesNotMatch(band(injectChrome(page('body { padding: 28px }'), opts)), /data-pfs-inset/);
  assert.doesNotMatch(band(injectChrome(page('main { padding: 0 }'), { ...opts, linkedCss: 'body { padding: 0 18px }' })), /data-pfs-inset/);
  // A body padded on top only gets both marks.
  assert.match(band(injectChrome(page('body { padding: 24px 0 }'), opts)), /\sdata-pfs-gap data-pfs-inset>$/);
  // rates.mjs and jobs.mjs find the band by its exact opening; the attribute must not touch the class.
  assert.match(injectChrome(page('main { padding: 32px }'), opts), /<nav class="pf-chrome pf-chrome-top" aria-label="Site"/);
});

test('the inset rule outweighs the band row reset and tapers to nothing at desktop width', () => {
  const css = renderChromeStyle();
  const rule = '.pf-chrome-top[data-pfs-inset] :is(.pfs-bar,.pfs-crumbs){padding-left:clamp(0px,calc(576px - 50%),16px);padding-right:clamp(0px,calc(576px - 50%),16px)}';
  assert.ok(css.includes(rule));
  assert.ok(css.indexOf('.pf-chrome-top .pfs-bar{padding:12px 0}') < css.indexOf(rule), 'comes after the reset it overrides');
  assert.ok(css.indexOf('.pf-chrome-top .pfs-crumbs{padding:0 0 10px}') < css.indexOf(rule));
});

test('on a phone the band rows use the site header rhythm, not the desktop padding', () => {
  const css = renderChromeStyle();
  const phone = '@media (max-width:720px){.pf-chrome-top .pfs-bar{padding:9px 0}.pf-chrome-top .pfs-crumbs{padding:0 0 9px}}';
  assert.ok(css.includes(phone));
  assert.ok(css.indexOf('.pf-chrome-top .pfs-bar{padding:12px 0}') < css.indexOf(phone), 'comes after the desktop rule it overrides');
  // The inset rule sets the side padding with a more specific selector, so the
  // phone rule's shorthand cannot zero it.
  assert.ok(css.indexOf('.pf-chrome-top[data-pfs-inset] :is(.pfs-bar,.pfs-crumbs)') > 0);
});
