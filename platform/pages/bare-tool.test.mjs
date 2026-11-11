import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { accentOf, addBaseStyle, barePages, baseStyle, contrast, darkenTo, isBare } from './bare-tool.mjs';

const ICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Crect fill='%231d4ed8'/%3E%3C/svg%3E">`;
const page = (head) => `<!doctype html>\n<html>\n<head>\n  ${ICON}\n${head}\n</head>\n<body><h1>T</h1></body>\n</html>\n`;

test('isBare: no stylesheet and no font on :root, html or body', () => {
  assert.equal(isBare(page('')), true);
  assert.equal(isBare(page('  <style>:root { font: 16px system-ui; }</style>')), false);
  assert.equal(isBare(page('  <style>html,body{font-family:Georgia}</style>')), false);
  assert.equal(isBare(page('  <style>@media screen { body { font: 15px sans-serif } }</style>')), false);
  assert.equal(isBare(page('  <link rel="stylesheet" href="site.css">')), false);
  // A font on a textarea alone leaves the page in Times (demand-charge-interval-analyzer).
  assert.equal(isBare(page('  <style>textarea { font-family: ui-monospace, monospace; }</style>')), true);
  // A stray second <style> tag makes the :root rule's selector invalid, so the browser drops it (medical-bill-error-checker).
  assert.equal(isBare(page('  <style>\n  <style>\n    :root { font: 16px system-ui; }\n  </style>')), true);
  // .body-text is not body.
  assert.equal(isBare(page('  <style>.body-text { font: 16px serif }</style>')), true);
});

test('addBaseStyle goes before the page own <style>, once, and fixes the page', () => {
  const html = page('  <style>\n    .label h4 { margin: 0; }\n  </style>');
  const out = addBaseStyle(html);
  assert.equal(isBare(out), false);
  assert.ok(out.indexOf('data-base-style') < out.indexOf('.label h4'));
  assert.equal(addBaseStyle(out), out, 'idempotent');
  assert.equal(addBaseStyle(page('<style>:root{font:16px serif}</style>')), page('<style>:root{font:16px serif}</style>'), 'styled pages untouched');
  assert.match(addBaseStyle(page('')), /<\/style>\n<\/head>/);
});

test('every base rule has zero specificity, so a page rule always wins', () => {
  const css = baseStyle(page('')).replace(/<\/?style[^>]*>/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const sel = m[1].trim();
    assert.match(sel, /^:where\(/, `unwrapped selector: ${sel}`);
  }
});

test('the accent is the favicon colour, darkened to AA for white button text and links', () => {
  assert.equal(accentOf(page('')), '#1d4ed8');
  assert.equal(accentOf('<html></html>'), '#2a6b8e');
  const pale = darkenTo('#f4c542', 4.5, ['#ffffff', '#f4f5f7']);
  assert.ok(contrast(pale, '#ffffff') >= 4.5 && contrast(pale, '#f4f5f7') >= 4.5, pale);
  assert.equal(darkenTo('#1d4ed8', 4.5, ['#ffffff']), '#1d4ed8', 'already dark enough');
  const css = baseStyle(page(''));
  const button = css.match(/:where\(button\) \{[^}]*background: (#[0-9a-f]{6})/)[1];
  assert.ok(contrast(button, '#ffffff') >= 4.5);
});

test('no venture page ships in browser defaults (run bare-tool.mjs --fix)', () => {
  const root = fileURLToPath(new URL('../../ventures/', import.meta.url));
  assert.deepEqual(barePages(root), []);
});
