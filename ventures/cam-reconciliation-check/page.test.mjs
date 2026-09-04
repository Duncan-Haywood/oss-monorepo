import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page exposes searchable product, full disclaimer, and local app', () => {
  assert.match(html, /CAM Reconciliation/);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, or real-estate advice/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /reconcile/);
  assert.match(html, /This is arithmetic, not a conclusion about what the lease allows/);
});

test('landing page exposes the optional occupancy gross-up fields, wires them to reconcile, and documents the clause', () => {
  assert.match(html, /id="variablePercent"/);
  assert.match(html, /id="actualOccupancyPercent"/);
  assert.match(html, /id="targetOccupancyPercent"/);
  assert.match(html, /variablePercent.*actualOccupancyPercent.*targetOccupancyPercent/s);
  assert.match(html, /What is a CAM gross-up/);
  assert.match(html, /"@type":"Question","name":"What is a CAM gross-up/);
});

test('the transparent-result panel is an aria-live region so screen readers hear it appear', () => {
  // #output starts hidden and is revealed by script on submit, with no page
  // reload -- without aria-live a screen-reader user gets no announcement
  // that a reconciliation result now exists.
  assert.match(html, /<section id="output" class="hidden" aria-live="polite">/);
});
