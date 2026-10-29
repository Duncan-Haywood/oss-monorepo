import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign } from './model.mjs';
import { estimate } from './estimate.mjs';
import { quoteRequest, mailtoLink } from './quote.mjs';

test('the quote request lists every shopping line, the total, and asks for bulk pricing and delivery', () => {
  const s = buildShed(defaultDesign());
  const est = estimate(s);
  for (const store of ['homedepot', 'lowes', 'yard']) {
    const q = quoteRequest(s, est, store, { zip: '12345' });
    for (const r of est.shopping) assert.ok(q.body.includes(r.name), r.name);
    assert.ok(q.body.includes(`$${est.total.toFixed(2)}`));
    assert.match(q.body, /bulk, volume, Pro or contractor pricing/);
    assert.match(q.body, /ZIP 12345/);
    assert.match(q.subject, /12' 0" x 8' 0" shed/);
  }
  assert.match(quoteRequest(s, est, 'lowes').body, /^Hello Lowe's Pro Desk,/);
});

test('a mailto link carries the draft when it is short enough', () => {
  const s = buildShed(defaultDesign());
  const q = quoteRequest(s, estimate(s));
  const href = mailtoLink(q);
  assert.ok(href === null || href.startsWith('mailto:?subject='));
  assert.equal(mailtoLink({ subject: 'x', body: 'y'.repeat(9000) }), null);
});
