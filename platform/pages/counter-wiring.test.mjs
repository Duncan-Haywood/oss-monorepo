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

test('a counter URL adds one beacon that carries only the slug, after every opt-out', () => {
  const js = renderChromeModule({ counterUrl: 'https://count.example' });
  assert.equal(js.split('sendBeacon').length - 1, 1);
  assert.match(js, /sendBeacon\("https:\/\/count\.example\/hit",new Blob\(\[JSON\.stringify\(\{p:slug\}\)\]/);
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
