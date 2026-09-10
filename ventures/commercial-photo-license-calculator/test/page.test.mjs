import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const markup = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// A one-off event booking is the adjacent pricing decision for the same
// reader: a licensing scope vs. a single booking. Without this link a
// crawler entering on this page never reaches the photo booth calculator.
test('index links one hop to the photo-booth-event-quote sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/photo-booth-event-quote\/"/,
    'index must link ../photo-booth-event-quote/ so crawlers reach the photo booth event quote calculator in one hop',
  );
});
