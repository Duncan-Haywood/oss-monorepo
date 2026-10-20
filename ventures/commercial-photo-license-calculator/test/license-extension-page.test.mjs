import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { priceExtension } from '../extension.mjs';

const read = (n) => fs.readFileSync(new URL(`../${n}`, import.meta.url), 'utf8');
const html = read('license-extension-fee.html');

test('index and sitemap reach the extension page', () => {
  assert.match(read('index.html'), /href="license-extension-fee\.html"/);
  assert.match(read('sitemap.xml'), /license-extension-fee\.html/);
});

test('the page carries title, description, FAQ data, disclaimer and no network calls', () => {
  assert.match(html, /<title>License Extension Fee Calculator/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type": "FAQPage"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test('every worked figure in the FAQ matches the calculation', () => {
  const a = priceExtension({ creative: 1200, images: 5, current: { channels: ['web'], term: 6, territory: 'national', exclusivity: 'none' }, extended: { channels: ['web'], term: 12, territory: 'national', exclusivity: 'none' } });
  assert.equal(a.paidRights.toFixed(2), '525.00');
  assert.equal(a.newScopeRights.toFixed(2), '742.46');
  assert.equal(a.extensionFee.toFixed(2), '217.46');
  assert.match(html, /\$525\.00/); assert.match(html, /\$742\.46/); assert.match(html, /\$217\.46/);
  const b = priceExtension({ creative: 1200, images: 5, current: { channels: ['web'], term: 6, territory: 'national', exclusivity: 'none' }, extended: { channels: ['web', 'paid'], term: 6, territory: 'worldwide', exclusivity: 'none' } });
  assert.equal(b.newScopeRights.toFixed(2), '1041.60');
  assert.equal(b.extensionFee.toFixed(2), '516.60');
  assert.match(html, /\$1,041\.60/); assert.match(html, /\$516\.60/);
});
