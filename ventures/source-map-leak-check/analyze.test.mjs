import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from './analyze.mjs';

function result(overrides) {
  return {
    scriptUrl: 'https://x.example/app.js', hasReference: false, mapUrl: null,
    mapFetchable: false, sourcesCount: 0, hasSourcesContent: false, sampleSources: [],
    status: null, error: null, ...overrides,
  };
}

test('a fetchable map with sourcesContent is a danger finding', () => {
  const report = buildReport('https://x.example/', [
    result({
      hasReference: true, mapUrl: 'https://x.example/app.js.map', mapFetchable: true,
      sourcesCount: 2, hasSourcesContent: true, sampleSources: ['a.js', 'b.js'], status: 200,
    }),
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.noticeCount, 0);
  assert.equal(report.findings[0].severity, 'danger');
  assert.match(report.findings[0].title, /full original source text/);
});

test('a fetchable map with no sourcesContent is a notice finding', () => {
  const report = buildReport('https://x.example/', [
    result({
      hasReference: true, mapUrl: 'https://x.example/app.js.map', mapFetchable: true,
      sourcesCount: 3, hasSourcesContent: false, sampleSources: ['a.js', 'b.js', 'c.js'], status: 200,
    }),
  ]);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.noticeCount, 1);
  assert.equal(report.findings[0].severity, 'notice');
  assert.match(report.findings[0].detail, /a\.js, b\.js, c\.js/);
});

test('a reference that 404s is blocked, not a finding', () => {
  const report = buildReport('https://x.example/', [
    result({ hasReference: true, mapUrl: 'https://x.example/app.js.map', mapFetchable: false, status: 404 }),
  ]);
  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
  assert.equal(report.blocked.length, 1);
});

test('401 and 403 on the map are also blocked', () => {
  for (const status of [401, 403]) {
    const report = buildReport('https://x.example/', [
      result({ hasReference: true, mapUrl: 'm', mapFetchable: false, status }),
    ]);
    assert.equal(report.blocked.length, 1);
  }
});

test('no sourceMappingURL comment at all is clean', () => {
  const report = buildReport('https://x.example/', [result({ hasReference: false, error: null })]);
  assert.equal(report.ok, true);
  assert.equal(report.clean.length, 1);
  assert.equal(report.findings.length, 0);
});

test('a script that fails to fetch is an error, never clean or blocked', () => {
  const report = buildReport('https://x.example/', [
    result({ hasReference: false, error: 'HTTP 500' }),
  ]);
  assert.equal(report.errors.length, 1);
  assert.equal(report.clean.length, 0);
  assert.equal(report.incomplete, true);
  assert.equal(report.dangerCount, 0);
});

test('a map fetch that fails without a clean 401/403/404 status is an error', () => {
  const report = buildReport('https://x.example/', [
    result({ hasReference: true, mapUrl: 'm', mapFetchable: false, status: 503, error: null }),
  ]);
  assert.equal(report.errors.length, 1);
  assert.equal(report.blocked.length, 0);
});

test('a map fetch blocked by CORS (no status at all) is an error', () => {
  const report = buildReport('https://x.example/', [
    result({ hasReference: true, mapUrl: 'm', mapFetchable: false, status: null, error: 'Failed to fetch' }),
  ]);
  assert.equal(report.errors.length, 1);
  assert.equal(report.dangerCount, 0);
});

test('a pageError makes the whole report incomplete and not ok', () => {
  const report = buildReport('https://x.example/', [], { pageError: 'HTTP 404' });
  assert.equal(report.ok, false);
  assert.equal(report.incomplete, true);
  assert.equal(report.scriptsChecked, 0);
});

test('a clean site with every script clean or blocked is ok with no findings', () => {
  const report = buildReport('https://x.example/', [
    result({ hasReference: false }),
    result({ hasReference: true, mapUrl: 'm', mapFetchable: false, status: 404 }),
  ]);
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.noticeCount, 0);
  assert.equal(report.scriptsChecked, 2);
});

test('truncated flag is carried through from meta', () => {
  const report = buildReport('https://x.example/', [result({})], { truncated: true });
  assert.equal(report.truncated, true);
});

test('multiple exposed scripts all appear as separate findings, mixed severity', () => {
  const report = buildReport('https://x.example/', [
    result({ scriptUrl: 'https://x.example/a.js', hasReference: true, mapUrl: 'a.map', mapFetchable: true, hasSourcesContent: true, sourcesCount: 1, status: 200 }),
    result({ scriptUrl: 'https://x.example/b.js', hasReference: true, mapUrl: 'b.map', mapFetchable: true, hasSourcesContent: false, sourcesCount: 1, status: 200 }),
    result({ scriptUrl: 'https://x.example/c.js', hasReference: false }),
  ]);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.noticeCount, 1);
  assert.deepEqual(report.findings.map((f) => f.scriptUrl).sort(), [
    'https://x.example/a.js', 'https://x.example/b.js',
  ]);
});

test('an inline data: URI finding reports "inline data: URI" as its evidence', () => {
  const report = buildReport('https://x.example/', [
    result({
      hasReference: true, mapUrl: '(inline data: URI in the script itself)', mapFetchable: true,
      hasSourcesContent: true, sourcesCount: 1, status: null,
    }),
  ]);
  assert.equal(report.findings[0].evidenceStatus, 'inline data: URI');
});
