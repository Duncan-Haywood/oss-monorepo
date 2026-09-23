import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeCheckPageFn(scripts, pageError = null) {
  return async () => ({ scripts, pageError, truncated: false });
}

test('runCheck reports ok=true when every script is clean', async () => {
  const report = await runCheck('https://x.example/', {
    checkPageFn: fakeCheckPageFn([
      { scriptUrl: 'https://x.example/a.js', hasReference: false, mapUrl: null, mapFetchable: false, sourcesCount: 0, hasSourcesContent: false, sampleSources: [], status: null, error: null },
    ]),
  });
  assert.equal(report.ok, true);
});

test('runCheck reports ok=false and a danger finding for a fully exposed map', async () => {
  const report = await runCheck('https://x.example/', {
    checkPageFn: fakeCheckPageFn([
      {
        scriptUrl: 'https://x.example/a.js', hasReference: true, mapUrl: 'https://x.example/a.js.map',
        mapFetchable: true, sourcesCount: 1, hasSourcesContent: true, sampleSources: ['a.js'], status: 200, error: null,
      },
    ]),
  });
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
});

test('runCheck surfaces a pageError as an incomplete, not-ok report', async () => {
  const report = await runCheck('https://x.example/', {
    checkPageFn: fakeCheckPageFn([], 'HTTP 404'),
  });
  assert.equal(report.ok, false);
  assert.equal(report.incomplete, true);
});

test('runCheck passes scriptUrls and the timeout through to checkPageFn', async () => {
  let seenUrl;
  let seenOpts;
  const report = await runCheck(null, {
    scriptUrls: ['https://x.example/a.js'],
    checkPageFn: async (url, opts) => {
      seenUrl = url;
      seenOpts = opts;
      return { scripts: [], pageError: null, truncated: false };
    },
    timeoutMs: 1234,
  });
  assert.equal(seenUrl, null);
  assert.deepEqual(seenOpts.scriptUrls, ['https://x.example/a.js']);
  assert.equal(seenOpts.timeoutMs, 1234);
  assert.equal(report.scriptsChecked, 0);
});
