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

test('copy button never reports success when the clipboard write did not happen', () => {
  // `navigator.clipboard?.writeText(...)` awaited bare resolves to undefined
  // (no throw) when the Clipboard API is absent, so a status update placed
  // right after it — with no try/catch — used to read "Copied" even though
  // nothing was copied, and gave no feedback at all when a present API
  // rejected (permission denied, insecure context). Both cases must instead
  // fall back to a visible prompt and an honest status message.
  assert.doesNotMatch(html, /navigator\.clipboard\?\.writeText/);
  assert.match(html, /if\(!navigator\.clipboard\)throw new Error/);
  assert.match(html, /catch\{window\.prompt\('Copy this route summary:',text\)/);
  assert.match(html, /Clipboard unavailable; the summary is in the prompt\./);
});
