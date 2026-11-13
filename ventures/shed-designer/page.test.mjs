import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');

test('every element the app looks up by id is on the page', () => {
  const ids = new Set([...app.matchAll(/\$\('#([\w-]+)/g)].map((m) => m[1]));
  for (const f of [...app.matchAll(/'(\w+)'/g)].map((m) => m[1])) void f;
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), id);
});

test('form fields the app reads exist with labels', () => {
  const fields = app.match(/const FIELDS = \[([^\]]+)\]/)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));
  for (const f of fields) assert.match(html, new RegExp(`<label[^>]*>[^<]*<input id="${f}"|<label[^>]*>[^<]*(<span class="swatchrow">)?<select id="${f}"|<label class="check"><input id="${f}"`), f);
});

test('the page carries the disclaimer, privacy line, opt-out and sponsor link', () => {
  assert.match(html, /No warranty\./);
  assert.match(html, /not engineering, construction/);
  assert.match(html, /Privacy\./);
  assert.match(html, /id="optout"/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="module" src="\.\/app\.mjs"><\/script>/);
});

test('the ready-design strip holds its height until app.mjs fills it', () => {
  // CLS 0.194 at 1,280 px before (docs/reports/polish-2026-11-13-late-reveal.md).
  const block = html.match(/<!-- late-reveal:start -->([\s\S]*?)<!-- late-reveal:end -->/);
  assert.ok(block && html.indexOf(block[0]) < html.indexOf('</head>'), 'late-reveal block is in <head>');
  const h = Number(block[1].match(/html:not\(\.pf-rows-ready\) #starts \.pick-list:empty\{min-height:(\d+)px\}/)?.[1]);
  assert.ok(h >= 400 && h <= 641, `reserve ${h}px: no more than the 641 px measured, so the strip never arrives shorter`);
  assert.match(block[1], /DOMContentLoaded[^<]*classList\.add\('pf-rows-ready'\)/);
  assert.match(html, /<section id="starts"[^>]*>[\s\S]*?<ul class="pick-list"[^>]*><\/ul>/, 'the strip still ships empty inside #starts');
  assert.match(app, /picker = mountPicker\(/, 'app.mjs still fills the strip at module top level, before DOMContentLoaded');
});
