import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from './analyze.mjs';

function goodProbe(overrides = {}) {
  return {
    page: { ok: true, status: 200, error: null },
    secure: true,
    manifestHref: '/manifest.json',
    manifestUrl: 'https://example.com/manifest.json',
    manifest: { ok: true, status: 200, error: null },
    manifestJson: {
      name: 'Example App',
      display: 'standalone',
      start_url: '/',
      theme_color: '#112233',
      background_color: '#ffffff',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    parseError: null,
    icons: [
      {
        src: '/icon-192.png', resolvedUrl: 'https://example.com/icon-192.png', sizes: '192x192', type: 'image/png', purpose: null,
        fetch: { ok: true, status: 200, contentType: 'image/png', error: null },
      },
      {
        src: '/icon-512.png', resolvedUrl: 'https://example.com/icon-512.png', sizes: '512x512', type: 'image/png', purpose: null,
        fetch: { ok: true, status: 200, contentType: 'image/png', error: null },
      },
    ],
    ...overrides,
  };
}

test('a fully compliant manifest produces no findings and ok=true', () => {
  const report = buildReport('https://example.com/', goodProbe());
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.noticeCount, 0);
  assert.deepEqual(report.findings, []);
});

test('an unreachable page is incomplete and reports page-unreachable', () => {
  const report = buildReport('https://example.com/', { page: { ok: false, error: 'timed out' } });
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].id, 'page-unreachable');
});

test('a plain-http, non-loopback page reports insecure-origin', () => {
  const report = buildReport('http://example.com/', goodProbe({ secure: false }));
  assert.ok(report.findings.some((f) => f.id === 'insecure-origin' && f.severity === 'danger'));
});

test('no manifest link at all reports no-manifest-link and stops', () => {
  const report = buildReport('https://example.com/', goodProbe({ manifestHref: null, manifestUrl: null }));
  assert.equal(report.ok, false);
  assert.equal(report.findings.some((f) => f.id === 'no-manifest-link'), true);
  // Nothing downstream of the missing link should be evaluated.
  assert.equal(report.findings.length, 1);
});

test('a manifest link that 404s reports manifest-unreachable and is incomplete', () => {
  const report = buildReport('https://example.com/', goodProbe({
    manifest: { ok: true, status: 404, error: null },
    manifestJson: null,
  }));
  assert.equal(report.incomplete, true);
  assert.equal(report.findings.some((f) => f.id === 'manifest-unreachable'), true);
});

test('a manifest that is not valid JSON reports manifest-not-json', () => {
  const report = buildReport('https://example.com/', goodProbe({ manifestJson: null, parseError: 'Unexpected token' }));
  assert.equal(report.findings.some((f) => f.id === 'manifest-not-json'), true);
});

test('missing name and short_name reports missing-name', () => {
  const report = buildReport('https://example.com/', goodProbe({
    manifestJson: { display: 'standalone', icons: [{ src: '/i.png', sizes: '192x192' }] },
  }));
  assert.equal(report.findings.some((f) => f.id === 'missing-name'), true);
});

test('short_name alone is sufficient -- no missing-name finding', () => {
  const report = buildReport('https://example.com/', goodProbe({
    manifestJson: { short_name: 'App', display: 'standalone', icons: goodProbe().manifestJson.icons },
  }));
  assert.equal(report.findings.some((f) => f.id === 'missing-name'), false);
});

test('an absent display field is a danger, not a notice (defaults to "browser")', () => {
  const probe = goodProbe();
  delete probe.manifestJson.display;
  const report = buildReport('https://example.com/', probe);
  const finding = report.findings.find((f) => f.id === 'missing-display');
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
  assert.match(finding.detail, /browser/);
});

test('display: "browser" explicitly is a danger', () => {
  const report = buildReport('https://example.com/', goodProbe({
    manifestJson: { ...goodProbe().manifestJson, display: 'browser' },
  }));
  assert.ok(report.findings.some((f) => f.id === 'missing-display'));
});

for (const mode of ['standalone', 'fullscreen', 'minimal-ui']) {
  test(`display: "${mode}" is accepted`, () => {
    const report = buildReport('https://example.com/', goodProbe({
      manifestJson: { ...goodProbe().manifestJson, display: mode },
    }));
    assert.equal(report.findings.some((f) => f.id === 'missing-display'), false);
  });
}

test('no icons at all reports missing-192-icon as a danger', () => {
  const report = buildReport('https://example.com/', goodProbe({ manifestJson: { name: 'A', display: 'standalone' }, icons: [] }));
  const finding = report.findings.find((f) => f.id === 'missing-192-icon');
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
});

test('only a 96x96 icon reports missing-192-icon', () => {
  const report = buildReport('https://example.com/', goodProbe({
    manifestJson: { name: 'A', display: 'standalone', icons: [{ src: '/i96.png', sizes: '96x96' }] },
    icons: [{ src: '/i96.png', resolvedUrl: 'https://example.com/i96.png', sizes: '96x96', type: 'image/png', purpose: null, fetch: { ok: true, status: 200, contentType: 'image/png', error: null } }],
  }));
  assert.ok(report.findings.some((f) => f.id === 'missing-192-icon' && f.severity === 'danger'));
});

test('a 192 icon that 404s does not count toward clearing missing-192-icon', () => {
  const report = buildReport('https://example.com/', goodProbe({
    manifestJson: { name: 'A', display: 'standalone', icons: [{ src: '/i192.png', sizes: '192x192' }] },
    icons: [{ src: '/i192.png', resolvedUrl: 'https://example.com/i192.png', sizes: '192x192', type: 'image/png', purpose: null, fetch: { ok: true, status: 404, contentType: null, error: null } }],
  }));
  assert.ok(report.findings.some((f) => f.id === 'missing-192-icon'));
  assert.ok(report.findings.some((f) => f.id === 'icon-unreachable'));
});

test('sizes: "any" satisfies the 192px requirement', () => {
  const report = buildReport('https://example.com/', goodProbe({
    manifestJson: { name: 'A', display: 'standalone', icons: [{ src: '/i.svg', sizes: 'any' }] },
    icons: [{ src: '/i.svg', resolvedUrl: 'https://example.com/i.svg', sizes: 'any', type: 'image/svg+xml', purpose: null, fetch: { ok: true, status: 200, contentType: 'image/svg+xml', error: null } }],
  }));
  assert.equal(report.findings.some((f) => f.id === 'missing-192-icon'), false);
});

test('a 192 icon with no 512 icon reports missing-512-icon as a notice, not a danger', () => {
  const report = buildReport('https://example.com/', goodProbe({
    manifestJson: { name: 'A', display: 'standalone', icons: [{ src: '/i192.png', sizes: '192x192' }] },
    icons: [{ src: '/i192.png', resolvedUrl: 'https://example.com/i192.png', sizes: '192x192', type: 'image/png', purpose: null, fetch: { ok: true, status: 200, contentType: 'image/png', error: null } }],
  }));
  const finding = report.findings.find((f) => f.id === 'missing-512-icon');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
  assert.equal(report.ok, true, 'a notice alone must not fail the overall report');
});

test('an icon URL that returns a non-image content-type is flagged unreachable', () => {
  const report = buildReport('https://example.com/', goodProbe({
    icons: [
      { src: '/icon-192.png', resolvedUrl: 'https://example.com/icon-192.png', sizes: '192x192', type: 'image/png', purpose: null, fetch: { ok: true, status: 200, contentType: 'text/html', error: null } },
      goodProbe().icons[1],
    ],
  }));
  assert.ok(report.findings.some((f) => f.id === 'icon-unreachable'));
});

test('missing start_url is a notice', () => {
  const probe = goodProbe();
  delete probe.manifestJson.start_url;
  const report = buildReport('https://example.com/', probe);
  const finding = report.findings.find((f) => f.id === 'missing-start-url');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
});

test('missing theme_color and background_color together is a notice', () => {
  const probe = goodProbe();
  delete probe.manifestJson.theme_color;
  delete probe.manifestJson.background_color;
  const report = buildReport('https://example.com/', probe);
  const finding = report.findings.find((f) => f.id === 'missing-theme-colors');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
});

test('either theme_color or background_color alone is sufficient', () => {
  const probe = goodProbe();
  delete probe.manifestJson.background_color;
  const report = buildReport('https://example.com/', probe);
  assert.equal(report.findings.some((f) => f.id === 'missing-theme-colors'), false);
});

test('notices alone (no danger findings) still leave ok=true', () => {
  const probe = goodProbe();
  delete probe.manifestJson.start_url;
  delete probe.manifestJson.theme_color;
  delete probe.manifestJson.background_color;
  const report = buildReport('https://example.com/', probe);
  assert.equal(report.dangerCount, 0);
  assert.ok(report.noticeCount >= 2);
  assert.equal(report.ok, true);
});

test('report carries the manifest URL and icon count through', () => {
  const report = buildReport('https://example.com/', goodProbe());
  assert.equal(report.manifestUrl, 'https://example.com/manifest.json');
  assert.equal(report.iconCount, 2);
});

test('an empty/garbage probe object does not throw', () => {
  assert.doesNotThrow(() => buildReport('https://example.com/', {}));
  assert.doesNotThrow(() => buildReport('https://example.com/', null));
});
