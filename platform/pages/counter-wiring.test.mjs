// The first-party counter (platform/counter/) is off unless the build is given
// its URL. Off must mean no beacon at all; on must mean the beacon and the
// privacy copy change together, so the site never says "never sent anywhere"
// while sending something.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderChromeModule, normaliseCounterUrl } from './build.mjs';

test('default build ships no beacon', () => {
  assert.ok(!renderChromeModule().includes('sendBeacon'));
});

test('a counter URL adds one beacon (slug, plus a known channel tag), after every opt-out', () => {
  const js = renderChromeModule({ counterUrl: 'https://count.example' });
  assert.equal(js.split('sendBeacon').length - 1, 1);
  assert.match(js, /var hit=\{p:slug\};/);
  assert.match(js, /sendBeacon\("https:\/\/count\.example\/hit",new Blob\(\[JSON\.stringify\(hit\)\]/);
  const beacon = js.indexOf('sendBeacon');
  for (const guard of ['doNotTrack', 'globalPrivacyControl', 'portfolio-hub-optout', 'if(!slug)return']) {
    assert.ok(js.indexOf(guard) < beacon, `${guard} must run before the beacon`);
  }
});

test('counter URL is reduced to an https origin', () => {
  assert.equal(normaliseCounterUrl(''), '');
  assert.equal(normaliseCounterUrl('https://count.example/some/path?q=1'), 'https://count.example');
  assert.throws(() => normaliseCounterUrl('http://count.example'));
});

/** Runs the real chrome module with a counter URL against a stub page at `search`; returns what was sent and the address bar after. */
function load(search) {
  const sent = [];
  let address = `/monorepo-projects/a/${search}#calc`;
  const [pathname] = address.split(/[?#]/);
  const navigator = { sendBeacon: (url, blob) => { sent.push({ url, blob }); return true; } };
  const location = { pathname, search, hash: '#calc' };
  const history = { state: null, replaceState: (_s, _t, url) => { address = url; } };
  const store = new Map();
  const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const document = {
    readyState: 'complete',
    querySelector: () => ({ getAttribute: () => 'a' }),
    addEventListener: () => {},
    getElementsByTagName: () => [],
    body: { getElementsByTagName: () => [] },
  };
  class FakeBlob { constructor(parts) { this.text = parts.join(''); } }
  new Function('navigator', 'localStorage', 'document', 'addEventListener', 'getComputedStyle', 'location', 'history', 'Blob', 'URLSearchParams',
    renderChromeModule({ counterUrl: 'https://count.example' }))(
    navigator, localStorage, document, () => {}, () => ({ overflowX: 'visible' }), location, history, FakeBlob, URLSearchParams,
  );
  return { hits: sent.map((s) => JSON.parse(s.blob.text)), address };
}

test('a known channel tag rides on the ping and leaves the address bar', () => {
  const r = load('?x=1&ref=npm');
  assert.deepEqual(r.hits, [{ p: 'a', r: 'npm' }]);
  assert.equal(r.address, '/monorepo-projects/a/?x=1#calc', 'other query parameters and the hash survive');
});

test('an unknown or absent tag sends the slug alone and leaves the URL untouched', () => {
  assert.deepEqual(load('?ref=someone@example.com').hits, [{ p: 'a' }]);
  assert.equal(load('?ref=someone@example.com').address, '/monorepo-projects/a/?ref=someone@example.com#calc');
  assert.deepEqual(load('').hits, [{ p: 'a' }]);
});
