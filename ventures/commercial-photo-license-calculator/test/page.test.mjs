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

// The other half of the same reader's job. This page prices the *licence* on
// imagery; the drone mapping calculator prices the *flight* that captures it,
// and a pilot delivering aerial stills or an orthomosaic needs both numbers on
// the same quote. It is also the only inbound link that venture has, so this
// assertion is what keeps it off the crawlable-orphan list in
// platform/pages/siblings-budget.json.
test('index links one hop to the drone-mapping-job-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/drone-mapping-job-calculator\/"/,
    'index must link ../drone-mapping-job-calculator/ so crawlers reach the drone mapping job calculator in one hop',
  );
});
