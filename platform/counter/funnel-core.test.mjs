// The funnel-event rules in core.mjs (platform/counter/FUNNEL.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, funnelKey, parseFunnelKey, isPageKey, FUNNEL_EVENTS, FUNNEL_ATTRS, MAX_BODY } from './core.mjs';
import { createCounterServer, Tally } from './counter.mjs';

const hit = (body, headers = {}) => classify({ method: 'POST', url: '/hit', headers: { 'user-agent': 'Mozilla/5.0', ...headers }, body: JSON.stringify(body) });

test('a funnel event is counted under its own key, never as a page load', () => {
  const v = hit({ p: 'c/salons', e: 'cta_view', i: 'salons', t: 'salon-suite' });
  assert.deepEqual(v, { count: true, slug: 'c/salons', funnel: 'fn:cta_view:salons:salon-suite:c/salons' });
  assert.equal(isPageKey(v.funnel), false);
});

test('unknown events, bad slugs and crawlers are refused; bad tokens are dropped', () => {
  assert.equal(hit({ p: 'a', e: 'purchase' }).reason, 'event');
  assert.equal(hit({ p: '../x', e: 'cta_view' }).reason, 'slug');
  assert.deepEqual(hit({ p: 'a', e: 'cta_view' }, { 'user-agent': 'Googlebot' }), { count: false, reason: 'bot' }, 'no bot field: not a crawler page load either');
  assert.equal(hit({ p: 'a', e: 'cta_view', i: 'Me@x.com', t: 'x'.repeat(61) }).funnel, 'fn:cta_view:_:_:a');
});

test('the longest legal beacon fits under MAX_BODY', () => {
  const body = JSON.stringify({ p: `a${'b'.repeat(119)}`, e: 'outbound_click', i: 'c'.repeat(60), t: 'd'.repeat(60) });
  assert.ok(body.length <= MAX_BODY, `${body.length} > ${MAX_BODY}`);
});

test('keys round-trip; other keys do not parse', () => {
  for (const event of FUNNEL_EVENTS) {
    const k = funnelKey({ event, industry: 'salons', slug: 'x/y' });
    assert.deepEqual(parseFunnelKey(k), { event, industry: 'salons', product: '', page: 'x/y' });
  }
  for (const k of ['salons', 'src:google', 'fn:nope:_:_:a', 'fn:cta_view:_:_']) assert.equal(parseFunnelKey(k), null);
});

test('every data-funnel value maps to a known event', () => {
  for (const ev of Object.values(FUNNEL_ATTRS)) assert.ok(FUNNEL_EVENTS.includes(ev));
});

test('the Node counter stores a funnel event under its key and not the page', async () => {
  const tally = new Tally();
  const server = createCounterServer({ tally, allowOrigin: 'https://x.example', now: () => new Date('2026-11-24T12:00:00Z') });
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  await fetch(`http://127.0.0.1:${port}/hit`, { method: 'POST', body: JSON.stringify({ p: 'products', e: 'products_view' }), headers: { 'user-agent': 'Mozilla/5.0' } });
  server.close();
  assert.deepEqual(tally.days, { '2026-11-24': { 'fn:products_view:_:_:products': 1 } });
});
