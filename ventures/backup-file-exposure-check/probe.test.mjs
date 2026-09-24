import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchBackupPath, checkSite, BACKUP_PATHS } from './probe.mjs';

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

const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

function exposedSite(req, res) {
  const send = (status, type, body) => {
    res.writeHead(status, { 'content-type': type });
    res.end(body);
  };
  if (req.url === '/backup.zip') return send(200, 'application/zip', ZIP_HEADER);
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

test('BACKUP_PATHS has one entry per documented backup filename and no duplicates', () => {
  assert.equal(new Set(BACKUP_PATHS).size, BACKUP_PATHS.length);
  assert.ok(BACKUP_PATHS.includes('backup.zip'));
  assert.ok(BACKUP_PATHS.includes('db.sql'));
});

test('fetchBackupPath returns the real bytes and status for a readable path', () =>
  withServer(exposedSite, async (base) => {
    const result = await fetchBackupPath(base, 'backup.zip');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.ok(result.bytes instanceof Uint8Array);
    assert.equal(result.bytes[0], 0x50);
    assert.equal(result.bytes[1], 0x4b);
  }));

test('fetchBackupPath reports ok:false with the status for a 404', () =>
  withServer(cleanSite, async (base) => {
    const result = await fetchBackupPath(base, 'backup.zip');
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
  }));

test('fetchBackupPath reports an error (not a status) for an unreachable host', async () => {
  const result = await fetchBackupPath('http://127.0.0.1:1', 'backup.zip', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.ok(result.error);
});

test('checkSite fetches every path in BACKUP_PATHS against the base URL', () =>
  withServer(exposedSite, async (base) => {
    const { results } = await checkSite(base);
    assert.equal(results.length, BACKUP_PATHS.length);
    const byPath = Object.fromEntries(results.map((r) => [r.path, r]));
    assert.equal(byPath['backup.zip'].ok, true);
    assert.equal(byPath['db.sql'].ok, false);
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
    const { results } = await checkSite(base, { paths: ['backup.zip'] });
    assert.equal(results.length, 1);
    assert.equal(results[0].path, 'backup.zip');
  }));

test('checkSite throws a clear error with no base URL', async () => {
  await assert.rejects(() => checkSite(null), /base URL is required/);
});

test('a large body is capped rather than fully buffered', () =>
  withServer(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      // 1MB of filler, far past the 8KB cap.
      res.end(Buffer.concat([ZIP_HEADER, Buffer.alloc(1024 * 1024, 0x41)]));
    },
    async (base) => {
      const result = await fetchBackupPath(base, 'backup.zip');
      assert.equal(result.ok, true);
      assert.ok(result.bytes.length <= 8192, `expected a capped read, got ${result.bytes.length} bytes`);
      assert.equal(result.bytes[0], 0x50);
    },
  ));
