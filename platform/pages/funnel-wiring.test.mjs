// Funnel events (platform/counter/FUNNEL.md): the shared chrome script turns
// `data-funnel` markup into beacons on the site's own counter. These run the
// real chrome module against a stub page, the way counter-wiring.test.mjs does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderChromeModule } from './build.mjs';
import { classify, parseFunnelKey } from '../counter/core.mjs';

/** A minimal element: attributes, a parent, and `closest` over `[attr]` / `[attr="v"]`. */
function el(attrs = {}, parent = null) {
  return {
    attrs, parent,
    getAttribute(a) { return Object.hasOwn(this.attrs, a) ? this.attrs[a] : null; },
    closest(sel) {
      const alts = sel.split(',').map((one) => /^\[([a-z-]+)(?:="([^"]*)")?\]$/.exec(one));
      for (let n = this; n; n = n.parent) {
        if (alts.some((m) => Object.hasOwn(n.attrs, m[1]) && (m[2] === undefined || n.attrs[m[1]] === m[2]))) return n;
      }
      return null;
    },
  };
}

/** Runs the chrome module on a page whose `[data-funnel]` elements are `els`. */
function page(els, { io = false, optout = false, dnt = false, counterUrl = 'https://count.example' } = {}) {
  const sent = [];
  const listeners = {};
  const observed = [];
  const store = new Map(optout ? [['portfolio-hub-optout', '1']] : []);
  const navigator = { sendBeacon: (url, blob) => { sent.push({ url, body: JSON.parse(blob.text) }); return true; }, doNotTrack: dnt ? '1' : undefined };
  const document = {
    readyState: 'complete',
    referrer: '',
    querySelector: () => ({ getAttribute: () => 'tool-a' }),
    querySelectorAll: (sel) => (sel === '[data-funnel],[data-pf-offer]' ? els : []),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    getElementsByTagName: () => [],
    body: { getElementsByTagName: () => [] },
  };
  class FakeBlob { constructor(parts) { this.text = parts.join(''); } }
  let observer;
  class FakeIO {
    constructor(cb) { this.cb = cb; observer = this; }
    observe(t) { observed.push(t); }
    unobserve(t) { observed.splice(observed.indexOf(t), 1); }
  }
  new Function('navigator', 'localStorage', 'document', 'addEventListener', 'getComputedStyle', 'location', 'history', 'Blob', 'URLSearchParams', 'URL', 'IntersectionObserver',
    renderChromeModule({ counterUrl }))(
    navigator, { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, document, () => {}, () => ({ overflowX: 'visible' }),
    { pathname: '/tool-a/', search: '', hash: '', hostname: 'marisstella.app' }, { state: null, replaceState() {} }, FakeBlob, URLSearchParams, URL,
    io ? FakeIO : undefined,
  );
  const click = (target) => (listeners.click || []).forEach((fn) => fn({ target }));
  const show = (target, ratio = 1) => observer.cb([{ target, isIntersecting: ratio > 0, intersectionRatio: ratio, rootBounds: { height: 800 }, intersectionRect: { height: 10 } }]);
  return { events: () => sent.map((s) => s.body).filter((b) => b.e), hits: () => sent.map((s) => s.body), click, show, observed };
}

test('page-level markers count once per load, with industry from the nearest ancestor', () => {
  const body = el({ 'data-funnel-industry': 'restaurants' });
  const main = el({ 'data-funnel': 'industry-page' }, body);
  const dup = el({ 'data-funnel': 'industry-page' }, body);
  const p = page([main, dup, el({ 'data-funnel': 'products-page' })]);
  assert.deepEqual(p.events(), [
    { p: 'tool-a', e: 'industry_view', i: 'restaurants' },
    { p: 'tool-a', e: 'products_view' },
  ]);
  assert.deepEqual(p.hits()[0], { p: 'tool-a' }, 'the page-view beacon still goes first and unchanged');
});

test('a CTA without IntersectionObserver counts its impression at load; clicks count every time', () => {
  const cta = el({ 'data-funnel': 'cta', 'data-funnel-industry': 'salons', 'data-funnel-product': 'salon-suite' });
  const link = el({ href: '#' }, cta);
  const p = page([cta]);
  p.click(link);
  p.click(link);
  assert.deepEqual(p.events(), [
    { p: 'tool-a', e: 'cta_view', i: 'salons', t: 'salon-suite' },
    { p: 'tool-a', e: 'cta_click', i: 'salons', t: 'salon-suite' },
    { p: 'tool-a', e: 'cta_click', i: 'salons', t: 'salon-suite' },
  ]);
});

test('with IntersectionObserver the impression waits until half the CTA is on screen, once', () => {
  const cta = el({ 'data-funnel': 'cta', 'data-funnel-product': 'salon-suite' });
  const p = page([cta], { io: true });
  assert.deepEqual(p.events(), []);
  assert.deepEqual(p.observed, [cta]);
  p.show(cta, 0.2);
  assert.deepEqual(p.events(), [], 'a sliver is not an impression');
  p.show(cta, 0.6);
  assert.deepEqual(p.events(), [{ p: 'tool-a', e: 'cta_view', t: 'salon-suite' }]);
  assert.deepEqual(p.observed, [], 'stops watching after the first impression');
});

test('an outbound link inside a CTA counts both the CTA click and the outbound click', () => {
  const cta = el({ 'data-funnel': 'cta', 'data-funnel-industry': 'salons', 'data-funnel-product': 'salon-suite' });
  const out = el({ 'data-funnel': 'outbound', href: 'https://example.com/early-access' }, cta);
  const p = page([cta, out]);
  p.click(out);
  assert.deepEqual(p.events().map((e) => e.e), ['cta_view', 'cta_click', 'outbound_click']);
  assert.deepEqual(p.events()[2], { p: 'tool-a', e: 'outbound_click', i: 'salons', t: 'salon-suite' });
});

test('malformed tokens and unknown markers are dropped, not sent', () => {
  const p = page([
    el({ 'data-funnel': 'industry-page', 'data-funnel-industry': 'Someone@Example.com' }),
    el({ 'data-funnel': 'newsletter' }),
  ]);
  assert.deepEqual(p.events(), [{ p: 'tool-a', e: 'industry_view' }]);
});

test('the site opt-out stops funnel events; DNT/GPC do not (same rule as the page-view beacon)', () => {
  assert.deepEqual(page([el({ 'data-funnel': 'products-page' })], { optout: true }).hits(), []);
  assert.deepEqual(page([el({ 'data-funnel': 'products-page' })], { dnt: true }).events(), [{ p: 'tool-a', e: 'products_view' }]);
});

test('no counter URL means no funnel code at all', () => {
  assert.ok(!renderChromeModule({ counterUrl: '' }).includes('data-funnel'));
});

test('every event the script can send is one the counter accepts, and lands on a parseable key', () => {
  const cta = el({ 'data-funnel': 'cta', 'data-funnel-industry': 'salons', 'data-funnel-product': 'salon-suite' });
  const out = el({ 'data-funnel': 'outbound' }, cta);
  const p = page([el({ 'data-funnel': 'industry-page' }), el({ 'data-funnel': 'products-page' }), cta, out]);
  p.click(out);
  const seen = new Set();
  for (const ev of p.events()) {
    const v = classify({ method: 'POST', url: '/hit', headers: {}, body: JSON.stringify(ev) });
    assert.equal(v.count, true, JSON.stringify(ev));
    seen.add(parseFunnelKey(v.funnel).event);
  }
  assert.deepEqual([...seen].sort(), ['cta_click', 'cta_view', 'industry_view', 'outbound_click', 'products_view']);
});

test('a product-offer line (data-pf-offer, platform/pages/product-offer.mjs) counts as a CTA for its product', () => {
  const offer = el({ href: '../menu-suite/', 'data-pf-offer': 'menu-suite' });
  const p = page([offer]);
  p.click(offer);
  assert.deepEqual(p.events(), [
    { p: 'tool-a', e: 'cta_view', t: 'menu-suite' },
    { p: 'tool-a', e: 'cta_click', t: 'menu-suite' },
  ]);
});
