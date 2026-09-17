import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ALGORITHMS,
  toBase64,
  digestBase64,
  integrityValue,
  parseIntegrity,
  strongestAlgorithm,
  extractCrossOriginAssets,
  buildReport,
} from './sri.mjs';

function nodeDigest(algo, text) {
  const map = { sha256: 'sha256', sha384: 'sha384', sha512: 'sha512' };
  return createHash(map[algo]).update(text).digest('base64');
}

test('digestBase64 matches node:crypto for all three algorithms', async () => {
  const bytes = new TextEncoder().encode('hello subresource integrity');
  for (const algo of ALGORITHMS) {
    assert.equal(await digestBase64(algo, bytes), nodeDigest(algo, Buffer.from(bytes)));
  }
});

test('digestBase64 rejects an unknown algorithm', async () => {
  await assert.rejects(() => digestBase64('md5', new Uint8Array(0)), /Unsupported algorithm/);
});

test('toBase64 matches Buffer for arbitrary bytes, including a chunk-boundary size', () => {
  const bytes = new Uint8Array(70_000).map((_, i) => i % 256);
  assert.equal(toBase64(bytes), Buffer.from(bytes).toString('base64'));
});

test('integrityValue formats an algo/base64 pair', () => {
  assert.equal(integrityValue('sha384', 'AAAA'), 'sha384-AAAA');
});

test('parseIntegrity reads one or more space-separated hashes', () => {
  assert.deepEqual(parseIntegrity('sha384-AAAA sha256-BBBB'), [
    { algo: 'sha384', digest: 'AAAA', raw: 'sha384-AAAA' },
    { algo: 'sha256', digest: 'BBBB', raw: 'sha256-BBBB' },
  ]);
});

test('parseIntegrity drops an unrecognised algorithm rather than erroring', () => {
  assert.deepEqual(parseIntegrity('md5-AAAA sha384-BBBB'), [{ algo: 'sha384', digest: 'BBBB', raw: 'sha384-BBBB' }]);
});

test('parseIntegrity on empty/missing input returns no hashes', () => {
  assert.deepEqual(parseIntegrity(''), []);
  assert.deepEqual(parseIntegrity(null), []);
  assert.deepEqual(parseIntegrity(undefined), []);
});

test('strongestAlgorithm prefers sha512 over sha384 over sha256', () => {
  assert.equal(strongestAlgorithm(parseIntegrity('sha256-A sha384-B')), 'sha384');
  assert.equal(strongestAlgorithm(parseIntegrity('sha256-A sha384-B sha512-C')), 'sha512');
  assert.equal(strongestAlgorithm(parseIntegrity('sha256-A')), 'sha256');
  assert.equal(strongestAlgorithm([]), null);
});

test('extractCrossOriginAssets finds a cross-origin script and skips a same-origin one', () => {
  const html = `<html><head>
    <script src="https://cdn.example.com/lib.js" integrity="sha384-AAA" crossorigin="anonymous"></script>
    <script src="/local/app.js"></script>
  </head></html>`;
  const assets = extractCrossOriginAssets(html, 'https://mysite.example/page');
  assert.equal(assets.length, 1);
  assert.equal(assets[0].url, 'https://cdn.example.com/lib.js');
  assert.equal(assets[0].integrity, 'sha384-AAA');
  assert.equal(assets[0].crossoriginAttr, true);
});

test('extractCrossOriginAssets finds a cross-origin stylesheet link, not a non-stylesheet link', () => {
  const html = `
    <link rel="stylesheet" href="https://fonts.example.com/style.css">
    <link rel="icon" href="https://other.example.com/favicon.ico">
  `;
  const assets = extractCrossOriginAssets(html, 'https://mysite.example/');
  assert.equal(assets.length, 1);
  assert.equal(assets[0].kind, 'link');
  assert.equal(assets[0].url, 'https://fonts.example.com/style.css');
});

test('extractCrossOriginAssets reports a missing integrity/crossorigin as null/false', () => {
  const html = '<script src="https://cdn.example.com/lib.js"></script>';
  const [asset] = extractCrossOriginAssets(html, 'https://mysite.example/');
  assert.equal(asset.integrity, null);
  assert.equal(asset.crossoriginAttr, false);
});

test('extractCrossOriginAssets resolves a relative src against the page URL before comparing origins', () => {
  const html = '<script src="//cdn.example.com/lib.js"></script>';
  const [asset] = extractCrossOriginAssets(html, 'https://mysite.example/sub/page.html');
  assert.equal(asset.url, 'https://cdn.example.com/lib.js');
});

test('extractCrossOriginAssets skips an inline script (no src) and an unparseable src', () => {
  const html = '<script>doStuff()</script><script src="data:text/javascript,alert(1)"></script>';
  assert.deepEqual(extractCrossOriginAssets(html, 'https://mysite.example/'), []);
});

test('buildReport: no cross-origin assets is a clean, empty report', () => {
  const report = buildReport('https://mysite.example/', []);
  assert.equal(report.ok, true);
  assert.equal(report.thirdPartyCount, 0);
  assert.equal(report.findings.length, 0);
});

test('buildReport: missing integrity is a danger finding', () => {
  const report = buildReport('https://mysite.example/', [
    { kind: 'script', url: 'https://cdn.example.com/lib.js', integrity: null, crossoriginAttr: false },
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.findings[0].id, 'missing-integrity');
});

test('buildReport: integrity without crossorigin is a danger finding, even before any fetch', () => {
  const report = buildReport('https://mysite.example/', [
    {
      kind: 'script',
      url: 'https://cdn.example.com/lib.js',
      integrity: 'sha384-AAA',
      crossoriginAttr: false,
    },
  ]);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((f) => f.id === 'integrity-without-crossorigin'));
});

test('buildReport: malformed integrity attribute is its own danger finding', () => {
  const report = buildReport('https://mysite.example/', [
    { kind: 'script', url: 'https://cdn.example.com/lib.js', integrity: 'not-a-real-hash', crossoriginAttr: true },
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].id, 'malformed-integrity');
});

test('buildReport: a verified hash match produces no finding at all', async () => {
  const bytes = new TextEncoder().encode('the actual file contents');
  const hash = await digestBase64('sha384', bytes);
  const report = buildReport(
    'https://mysite.example/',
    [
      {
        kind: 'script',
        url: 'https://cdn.example.com/lib.js',
        integrity: integrityValue('sha384', hash),
        crossoriginAttr: true,
      },
    ],
    new Map([['https://cdn.example.com/lib.js', { ok: true, hashes: { sha384: hash }, error: null }]]),
  );
  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
  assert.equal(report.assets[0].status, 'verified');
});

test('buildReport: a stale hash (file changed since the tag was written) is a danger finding', () => {
  const report = buildReport(
    'https://mysite.example/',
    [
      {
        kind: 'script',
        url: 'https://cdn.example.com/lib.js',
        integrity: integrityValue('sha384', 'stale-hash-from-when-the-tag-was-written'),
        crossoriginAttr: true,
      },
    ],
    new Map([
      ['https://cdn.example.com/lib.js', { ok: true, hashes: { sha384: 'a-different-hash-served-today' }, error: null }],
    ]),
  );
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].id, 'integrity-hash-mismatch');
});

test('buildReport: an asset fetch failure is a notice, not silently dropped', () => {
  const report = buildReport(
    'https://mysite.example/',
    [
      {
        kind: 'script',
        url: 'https://cdn.example.com/lib.js',
        integrity: 'sha384-AAA',
        crossoriginAttr: true,
      },
    ],
    new Map([['https://cdn.example.com/lib.js', { ok: false, hashes: null, error: 'timed out' }]]),
  );
  assert.equal(report.dangerCount, 0);
  assert.equal(report.noticeCount, 1);
  assert.equal(report.findings[0].id, 'asset-fetch-failed');
});

test('buildReport: checks the strongest declared algorithm, not just the first token', async () => {
  const bytes = new TextEncoder().encode('file contents');
  const realSha512 = await digestBase64('sha512', bytes);
  // sha256 token is deliberately wrong; a browser would still only enforce sha512 (the stronger one).
  const integrity = `sha256-wrongwrongwrong ${integrityValue('sha512', realSha512)}`;
  const report = buildReport(
    'https://mysite.example/',
    [{ kind: 'script', url: 'https://cdn.example.com/lib.js', integrity, crossoriginAttr: true }],
    new Map([
      ['https://cdn.example.com/lib.js', { ok: true, hashes: { sha256: 'irrelevant', sha512: realSha512 }, error: null }],
    ]),
  );
  assert.equal(report.ok, true, 'sha512 (the strongest declared algorithm) matched, so this is clean');
});
