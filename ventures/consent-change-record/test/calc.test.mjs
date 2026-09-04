import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTraces, reportAsText } from '../calc.mjs';

const before = {site:'https://example.test', requests:[{url:'https://cdn.test/a.js'}], storage:[{key:'consent'}]};
const after = {site:'https://example.test', requests:[{url:'https://cdn.test/a.js'},{url:'https://analytics.test/collect',method:'post'}], storage:[{key:'consent'},{key:'analytics_id'}]};

test('reports request and storage additions without retaining content', () => {
  const result = compareTraces(before, after);
  assert.equal(result.requests.added[0].url, 'https://analytics.test/collect');
  assert.equal(result.storage.added[0].key, 'analytics_id');
  assert.match(reportAsText(result), /does not determine compliance/);
});

test('rejects traces from different sites', () => assert.throws(() => compareTraces(before, {...after, site:'https://other.test'}), /same site/));
test('rejects malformed request URLs', () => assert.throws(() => compareTraces({...before, requests:[{url:'not a url'}]}, after), /valid URL/));

test('a tracker firing fewer times after consent is reported as removed, not unchanged', () => {
  // Before: three identical GETs to a pixel (fires once per page section).
  // After: the same pixel, but only one firing. Presence-only matching used
  // to see the key on both sides and call all three occurrences unchanged,
  // silently hiding that two firings actually stopped.
  const pixel = { url: 'https://ads.example.test/pixel', method: 'GET' };
  const before = { site: 'https://example.test', requests: [pixel, pixel, pixel] };
  const after = { site: 'https://example.test', requests: [pixel] };
  const result = compareTraces(before, after);
  assert.equal(result.requests.removed.length, 2);
  assert.equal(result.requests.unchanged.length, 1);
  assert.equal(result.requests.added.length, 0);
});

test('a tracker firing more times after consent is reported as added, not unchanged', () => {
  const pixel = { url: 'https://ads.example.test/pixel', method: 'GET' };
  const before = { site: 'https://example.test', requests: [pixel] };
  const after = { site: 'https://example.test', requests: [pixel, pixel, pixel] };
  const result = compareTraces(before, after);
  assert.equal(result.requests.added.length, 2);
  assert.equal(result.requests.unchanged.length, 1);
  assert.equal(result.requests.removed.length, 0);
});

test('report groups repeated removed entries with a count instead of repeating the line', () => {
  const pixel = { url: 'https://ads.example.test/pixel', method: 'GET' };
  const before = { site: 'https://example.test', requests: [pixel, pixel, pixel] };
  const after = { site: 'https://example.test', requests: [] };
  const text = reportAsText(compareTraces(before, after));
  assert.match(text, /GET https:\/\/ads\.example\.test\/pixel \(×3\)/);
});

test('default sample traces add one request and one storage key', () => {
  const sampleBefore = {
    site: 'https://example.test',
    requests: [{ url: 'https://cdn.example.test/script.js', method: 'GET' }],
    storage: [{ key: 'consent_state' }],
  };
  const sampleAfter = {
    site: 'https://example.test',
    requests: [
      { url: 'https://cdn.example.test/script.js', method: 'GET' },
      { url: 'https://analytics.example.test/collect', method: 'POST' },
    ],
    storage: [{ key: 'consent_state' }, { key: 'analytics_id' }],
  };
  const result = compareTraces(sampleBefore, sampleAfter);
  assert.equal(result.requests.added.length, 1);
  assert.equal(result.storage.added.length, 1);
  assert.equal(result.requests.removed.length, 0);
});
