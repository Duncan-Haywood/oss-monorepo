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
