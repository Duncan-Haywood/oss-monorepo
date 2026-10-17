import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchEnvPath, checkSite, ENV_PATHS } from './probe.mjs';

// A tiny local HTTP server standing in for a real production site -- every
// request in this file goes to 127.0.0.1 only, nothing external, so these
// tests are deterministic and never touch anyone's real site.
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

const REAL_ENV = 'DATABASE_URL=postgres://user:pass@localhost/db\nSTRIPE_SECRET_KEY=sk_live_abc123\nDEBUG=true\n';

function exposedSite(req, res) {
  const send = (status, type, body) => {
    res.writeHead(status, { 'content-type': type });
    res.end(body);
  };
  if (req.url === '/.env') return send(200, 'text/plain', REAL_ENV);
  return send(404, 'text/plain', 'not found');
}

function cleanSite(req, res) {
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
}

function softNotFoundSite(req, res) {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<html><body>Welcome to our app</body></html>');
}

test('ENV_PATHS has one entry per documented dotenv filename and no duplicates', () => {
  assert.equal(new Set(ENV_PATHS).size, ENV_PATHS.length);
  assert.ok(ENV_PATHS.includes('.env'));
  assert.ok(ENV_PATHS.includes('.env.local'));
});

test('fetchEnvPath returns the real body and status for a readable path', () =>
  withServer(exposedSite, async (base) => {
    const result = await fetchEnvPath(base, '.env');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.match(result.text, /DATABASE_URL=/);
  }));

test('fetchEnvPath reports ok:false with the status for a 404', () =>
  withServer(cleanSite, async (base) => {
    const result = await fetchEnvPath(base, '.env');
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
  }));

test('fetchEnvPath reports an error (not a status) for an unreachable host', async () => {
  const result = await fetchEnvPath('http://127.0.0.1:1', '.env', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.ok(result.error);
});

test('checkSite fetches every path in ENV_PATHS against the base URL', () =>
  withServer(exposedSite, async (base) => {
    const { results } = await checkSite(base);
    assert.equal(results.length, ENV_PATHS.length);
    const byPath = Object.fromEntries(results.map((r) => [r.path, r]));
    assert.equal(byPath['.env'].ok, true);
    assert.equal(byPath['.env.local'].ok, false);
  }));

test('checkSite against a clean site reports every path blocked', () =>
  withServer(cleanSite, async (base) => {
    const { results } = await checkSite(base);
    assert.ok(results.every((r) => r.ok === false && r.status === 404));
  }));

test('checkSite against a soft-404 catch-all site still reports 200 for every path', () =>
  withServer(softNotFoundSite, async (base) => {
    const { results } = await checkSite(base);
    // The raw probe layer does not classify -- it faithfully reports what
    // came back. Telling this apart from a real exposure is analyze.mjs's job.
    assert.ok(results.every((r) => r.ok === true && r.status === 200));
  }));

test('checkSite accepts an explicit subset of paths', () =>
  withServer(exposedSite, async (base) => {
    const { results } = await checkSite(base, { paths: ['.env'] });
    assert.equal(results.length, 1);
    assert.equal(results[0].path, '.env');
  }));

test('checkSite throws a clear error with no base URL', async () => {
  await assert.rejects(() => checkSite(null), /base URL is required/);
});
