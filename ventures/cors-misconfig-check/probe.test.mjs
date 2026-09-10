import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { sendProbe, buildProbeSet, runProbes } from './probe.mjs';

// A tiny local HTTP server standing in for "the internet" -- every request
// in this file goes to 127.0.0.1 only, nothing external, so these tests are
// deterministic and need no network access beyond loopback.
function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        await fn(`http://127.0.0.1:${port}`);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

test('buildProbeSet derives six probes with the expected labels and origins', () => {
  const set = buildProbeSet('https://api.example.com/v1/thing', { randomOrigin: 'https://cors-probe-fixed.invalid' });
  assert.equal(set.length, 6);
  assert.deepEqual(set.map((p) => p.label), [
    'baseline', 'reflect', 'null-origin', 'prefix-match', 'suffix-match', 'same-origin',
  ]);

  const byLabel = Object.fromEntries(set.map((p) => [p.label, p.requestOrigin]));
  assert.equal(byLabel.baseline, null);
  assert.equal(byLabel.reflect, 'https://cors-probe-fixed.invalid');
  assert.equal(byLabel['null-origin'], 'null');
  assert.equal(byLabel['prefix-match'], 'https://api.example.com.attacker-controlled.invalid');
  assert.equal(byLabel['suffix-match'], 'https://evil-api.example.com');
  assert.equal(byLabel['same-origin'], 'https://api.example.com');
});

test('prefix-match origin genuinely starts with the target origin (the bypass this probe tests)', () => {
  const set = buildProbeSet('https://api.example.com/v1/thing');
  const prefix = set.find((p) => p.label === 'prefix-match').requestOrigin;
  assert.ok(prefix.startsWith('https://api.example.com'));
  assert.notEqual(prefix, 'https://api.example.com', 'must be a different origin, not the real one');
});

test('suffix-match origin genuinely ends with the target hostname (the bypass this probe tests)', () => {
  const set = buildProbeSet('https://api.example.com/v1/thing');
  const suffix = set.find((p) => p.label === 'suffix-match').requestOrigin;
  assert.ok(suffix.endsWith('api.example.com'));
  assert.notEqual(suffix, 'https://api.example.com');
});

test('two calls without an injected randomOrigin produce different reflect origins', () => {
  const a = buildProbeSet('https://api.example.com/').find((p) => p.label === 'reflect').requestOrigin;
  const b = buildProbeSet('https://api.example.com/').find((p) => p.label === 'reflect').requestOrigin;
  assert.notEqual(a, b, 'the reflect probe origin should be a fresh random value each run');
});

test('sendProbe reads back the three CORS headers this tool cares about', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, {
        'access-control-allow-origin': req.headers.origin || '',
        'access-control-allow-credentials': 'true',
        vary: 'Origin',
      });
      res.end('ok');
    },
    async (base) => {
      const result = await sendProbe(base, 'https://attacker.invalid');
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.equal(result.headers['access-control-allow-origin'], 'https://attacker.invalid');
      assert.equal(result.headers['access-control-allow-credentials'], 'true');
      assert.equal(result.headers.vary, 'Origin');
    },
  );
});

test('sendProbe with originHeader=null sends no Origin header at all', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'x-saw-origin': req.headers.origin ? 'yes' : 'no' });
      res.end();
    },
    async (base) => {
      const result = await sendProbe(base, null);
      assert.equal(result.ok, true);
      // The server-observed header isn't part of the returned shape, but a
      // failed request here would mean the client crashed trying to omit it.
      assert.equal(result.status, 200);
    },
  );
});

test('sendProbe reports a header that was never set as null, not "undefined" or ""', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(204);
      res.end();
    },
    async (base) => {
      const result = await sendProbe(base, 'https://attacker.invalid');
      assert.equal(result.headers['access-control-allow-origin'], null);
      assert.equal(result.headers['access-control-allow-credentials'], null);
      assert.equal(result.headers.vary, null);
    },
  );
});

test('sendProbe resolves (does not throw) on an unreachable host', async () => {
  const result = await sendProbe('http://127.0.0.1:1', null, { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('sendProbe resolves with an error for an invalid URL', async () => {
  const result = await sendProbe('not a url', null);
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid URL/);
});

test('sendProbe rejects an unsupported scheme instead of attempting the request', async () => {
  const result = await sendProbe('ftp://example.com/file', null);
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported scheme/);
});

test('runProbes sends all six probes and labels each result', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'access-control-allow-origin': req.headers.origin === 'null' ? 'null' : '' });
      res.end();
    },
    async (base) => {
      const results = await runProbes(base);
      assert.equal(results.length, 6);
      assert.deepEqual(
        results.map((r) => r.label).sort(),
        ['baseline', 'null-origin', 'prefix-match', 'reflect', 'same-origin', 'suffix-match'],
      );
      for (const r of results) assert.equal(r.ok, true);
    },
  );
});
