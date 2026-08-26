import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page exposes searchable product, full disclaimer, and local app', () => {
  assert.match(html, /Medical Courier Route/);
  assert.match(html, /No warranty/);
  assert.match(html, /not financial or medical advice/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /calculateRoute/);
  assert.match(html, /Do not enter patient/);
  assert.doesNotMatch(html, /renegotiate or decline/);
});
