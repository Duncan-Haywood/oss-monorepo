import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('the planning-estimate panel is announced to screen readers on every update', () => {
  // #freightClass, #band and the two lever lines all rewrite on every
  // keystroke without a page reload; without aria-live="polite" on their
  // shared container a screen-reader user hears nothing when the estimate
  // changes.
  const html = page('index.html');
  assert.match(html, /<section class="result" aria-live="polite"><h2>Planning estimate<\/h2>/);
});

test('the page carries the standard disclaimer and sponsor link', () => {
  const html = page('index.html');
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

// Closest sibling: same logistics catalogue, but accessorial invoice review
// after the quote rather than density-to-class before it. Without a crawlable
// link here, a crawler entering on the class estimator never reaches the
// accessorial auditor in one hop.
test('index links one hop to the freight-accessorial-auditor sibling', () => {
  const html = page('index.html');
  assert.match(
    html,
    /href="\.\.\/freight-accessorial-auditor\/"/,
    'index must link ../freight-accessorial-auditor/ so crawlers reach the accessorial auditor in one hop',
  );
});

// The same shipper one tier down: a parcel prices on a DIM divisor rather than
// a density band, and someone arriving here with a carton rather than a pallet
// is on the wrong page. The link is reciprocal -- the parcel calculator links
// back -- which is what keeps the newer venture off the crawlable-orphan list.
test('index links one hop to the parcel-dim-weight-calculator sibling', () => {
  const html = page('index.html');
  assert.match(
    html,
    /href="\.\.\/parcel-dim-weight-calculator\/"/,
    'index must link ../parcel-dim-weight-calculator/ so crawlers reach the parcel calculator in one hop',
  );
});
