import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.mjs', import.meta.url), 'utf8');

test('landing page carries the disclaimer, privacy line, schema and app', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, or accounting advice/);
  assert.match(html, /never uploaded/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /src="app\.mjs"/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('every element app.mjs reaches for by id exists on the page', () => {
  const ids = [...new Set([...app.matchAll(/\$\('([A-Za-z]+)'\)/g)].map((m) => m[1]))];
  const dynamic = ['invoicesName', 'receiptsName'];
  for (const id of [...ids, ...dynamic]) assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
});

test('the visible FAQ and the FAQPage schema ask the same questions', () => {
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"FAQPage".*?)<\/script>/)[1]);
  for (const q of schema.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test('footer links its sibling, the payment reconciliation workbench', () => {
  assert.match(html, /href="\.\.\/payment-reconciliation-workbench\/"/);
});
