import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
const mkt = fs.readFileSync(new URL('./for-auditors.html', import.meta.url), 'utf8');

test('landing page carries the disclaimer, privacy line, sponsor link and app', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, accounting or audit advice/);
  assert.match(html, /Files are never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /src="app\.mjs"/);
  assert.match(html, /application\/ld\+json/);
});

test('every element app.mjs writes into exists', () => {
  const ids = [...app.matchAll(/\$\('([A-Za-z]+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 20);
  for (const id of new Set(ids)) assert.match(html, new RegExp(`id="${id}"`), `index.html is missing #${id}`);
});

test('pages link each other and the duplicate-payment-audit sibling', () => {
  assert.match(html, /href="for-auditors\.html"/);
  assert.match(html, /href="\.\.\/duplicate-payment-audit\/"/);
  assert.match(mkt, /href="\.\/"/);
  assert.match(mkt, /No warranty/);
});

test('usage counting names events only and can be switched off', () => {
  const usage = fs.readFileSync(new URL('./usage.mjs', import.meta.url), 'utf8');
  assert.match(usage, /globalPrivacyControl/);
  assert.match(usage, /doNotTrack/);
  for (const m of app.matchAll(/count\('([a-z_]+)'\)/g)) assert.match(m[1], /^[a-z_]+$/);
  assert.match(html, /id="usage"/);
});
