import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('other spaces have an editable name and the split escapes it before rendering', () => {
  assert.match(page, /class="custom-name"/);
  assert.match(page, /maxlength="80"/);
  assert.match(page, /name: preset \? preset\.label : row\.querySelector\('\.custom-name'\)\.value/);
  assert.match(page, /escapeHtml\(area\.name\)/);
});

test('custom name is only shown for an Other space row', () => {
  assert.match(page, /nameField\.classList\.toggle\('visible', typeField\.value === 'other'\)/);
  assert.match(page, /\.custom-name\.visible \{ display: block; \}/);
});
