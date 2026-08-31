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

test('the quoting fields and the figures they drive are on the page', () => {
  for (const id of ['deadheadMiles', 'deadheadMinutes', 'targetMarginRate']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input: ${id}`);
  }
  for (const id of ['deadhead', 'bestop', 'targetstop', 'becpm']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing readout: ${id}`);
  }
  // The three new inputs must be wired into the id list the render loop reads,
  // or they sit on the page changing nothing.
  assert.match(html, /'deadheadMiles','deadheadMinutes'/);
  assert.match(html, /'targetMarginRate'/);
});

test('an unreachable break-even is said, not printed as $0.00', () => {
  // calculateRoute returns null when overhead plus target margin claim the
  // whole price. "$0.00" there reads as a route that pays for itself for free,
  // which is the opposite of what it means.
  assert.match(html, /value===null\?'not reachable'/);
});

test('every visible FAQ question also appears in the FAQPage block', () => {
  // This page hand-authors its own FAQPage, so build.mjs does not derive one
  // (it only injects where a venture wrote none) and nothing else keeps the
  // two in step -- the drift class fixed in #2497.
  const visible = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1].replace(/&mdash;/g, '—').replace(/&amp;/g, '&'));
  assert.ok(visible.length >= 7, `expected the FAQ to have grown, saw ${visible.length}`);
  const schema = html.slice(html.indexOf('"@type":"FAQPage"'));
  for (const question of visible) {
    assert.ok(
      schema.includes(JSON.stringify(question).slice(1, -1)),
      `visible question is missing from the FAQPage block: ${question}`,
    );
  }
});
