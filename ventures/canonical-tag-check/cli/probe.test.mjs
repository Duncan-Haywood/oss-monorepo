import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchFollowingRedirects, extractCanonicalLinks, extractMetaRobots, runProbe } from './probe.mjs';

// A tiny local HTTP server standing in for "the internet" -- every request
// in this file goes to 127.0.0.1 only, nothing external, so these tests are
// deterministic and need no network access beyond loopback.
function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        await fn(`http://127.0.0.1:${port}`, port);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

test('extractCanonicalLinks finds a single canonical tag in <head>', () => {
  const html = '<html><head><link rel="canonical" href="https://example.com/page/"></head><body></body></html>';
  const links = extractCanonicalLinks(html);
  assert.equal(links.length, 1);
  assert.equal(links[0].href, 'https://example.com/page/');
});

test('extractCanonicalLinks ignores a link tag with a different rel', () => {
  const html = '<head><link rel="alternate" href="https://example.com/alt/"></head>';
  assert.deepEqual(extractCanonicalLinks(html), []);
});

test('extractCanonicalLinks matches "canonical" inside a multi-token rel list', () => {
  const html = '<head><link rel="alternate canonical" href="https://example.com/page/"></head>';
  const links = extractCanonicalLinks(html);
  assert.equal(links.length, 1);
});

test('extractCanonicalLinks finds multiple canonical tags', () => {
  const html = `<head>
    <link rel="canonical" href="https://example.com/a/">
    <link rel="canonical" href="https://example.com/b/">
  </head>`;
  const links = extractCanonicalLinks(html);
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((l) => l.href), ['https://example.com/a/', 'https://example.com/b/']);
});

test('extractCanonicalLinks only looks inside <head>, not the whole document', () => {
  const html = '<head></head><body><link rel="canonical" href="https://example.com/body-link/"></body>';
  assert.deepEqual(extractCanonicalLinks(html), []);
});

test('extractCanonicalLinks handles single-quoted attributes', () => {
  const html = "<head><link rel='canonical' href='https://example.com/single/'></head>";
  const links = extractCanonicalLinks(html);
  assert.equal(links[0].href, 'https://example.com/single/');
});

test('extractMetaRobots reads a meta robots content value', () => {
  const html = '<head><meta name="robots" content="noindex, nofollow"></head>';
  assert.equal(extractMetaRobots(html), 'noindex, nofollow');
});

test('extractMetaRobots returns null when no meta robots tag is present', () => {
  assert.equal(extractMetaRobots('<head><title>x</title></head>'), null);
});

test('fetchFollowingRedirects returns the final response and a redirect count of 0 for a direct 200', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<head></head>');
    },
    async (base) => {
      const result = await fetchFollowingRedirects(base);
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.equal(result.redirectCount, 0);
      assert.equal(result.finalUrl, base);
    },
  );
});

test('fetchFollowingRedirects follows a 301 to its Location and counts the hop', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/old') {
        res.writeHead(301, { location: '/new' });
        res.end();
      } else {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<head></head>');
      }
    },
    async (base) => {
      const result = await fetchFollowingRedirects(`${base}/old`);
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.equal(result.redirectCount, 1);
      assert.equal(result.finalUrl, `${base}/new`);
    },
  );
});

test('fetchFollowingRedirects stops after MAX_REDIRECTS and reports failure on a redirect loop', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(302, { location: req.url === '/a' ? '/b' : '/a' });
      res.end();
    },
    async (base) => {
      const result = await fetchFollowingRedirects(`${base}/a`);
      assert.equal(result.ok, false);
      assert.match(result.error, /too many redirects/);
    },
  );
});

test('fetchFollowingRedirects resolves (does not throw) on an unreachable host', async () => {
  const result = await fetchFollowingRedirects('http://127.0.0.1:1', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('fetchFollowingRedirects resolves with an error for an invalid URL', async () => {
  const result = await fetchFollowingRedirects('not a url');
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid URL/);
});

test('fetchFollowingRedirects rejects an unsupported scheme instead of attempting the request', async () => {
  const result = await fetchFollowingRedirects('ftp://example.com/file');
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported scheme/);
});

test('runProbe reports the page with zero canonical links and does not fetch a canonicalTarget', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<head><title>no canonical here</title></head>');
    },
    async (base) => {
      const result = await runProbe(base);
      assert.equal(result.page.ok, true);
      assert.deepEqual(result.page.canonicalLinks, []);
      assert.equal(result.canonicalTarget, null);
    },
  );
});

test('runProbe does not fetch a canonicalTarget when the canonical is self-referencing', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<head><link rel="canonical" href="${req.headers.host ? `http://${req.headers.host}/` : '/'}"></head>`);
    },
    async (base) => {
      const result = await runProbe(base);
      assert.equal(result.page.canonicalLinks.length, 1);
      assert.equal(result.canonicalTarget, null, 'a self-referencing canonical must not trigger a second fetch');
    },
  );
});

test('runProbe does not fetch a canonicalTarget when there are multiple canonical links', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<head><link rel="canonical" href="/a"><link rel="canonical" href="/b"></head>');
    },
    async (base) => {
      const result = await runProbe(base);
      assert.equal(result.page.canonicalLinks.length, 2);
      assert.equal(result.canonicalTarget, null);
    },
  );
});

test('runProbe fetches the canonicalTarget when it is a single, distinct, absolute URL', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/page') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<head><link rel="canonical" href="http://${req.headers.host}/canonical-target"></head>`);
      } else if (req.url === '/canonical-target') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<head></head>');
      } else {
        res.writeHead(404);
        res.end();
      }
    },
    async (base) => {
      const result = await runProbe(`${base}/page`);
      assert.ok(result.canonicalTarget, 'expected a second fetch to have been made');
      assert.equal(result.canonicalTarget.ok, true);
      assert.equal(result.canonicalTarget.status, 200);
      assert.equal(result.canonicalTarget.finalUrl, `${base}/canonical-target`);
    },
  );
});

test('runProbe reports canonicalTarget noindex from the target page\'s own meta robots tag', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/page') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<head><link rel="canonical" href="http://${req.headers.host}/dead-end"></head>`);
      } else if (req.url === '/dead-end') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<head><meta name="robots" content="noindex"></head>');
      }
    },
    async (base) => {
      const result = await runProbe(`${base}/page`);
      assert.equal(result.canonicalTarget.metaRobots, 'noindex');
    },
  );
});

test('runProbe does not throw and reports incomplete when the page itself is unreachable', async () => {
  const result = await runProbe('http://127.0.0.1:1', { timeoutMs: 500 });
  assert.equal(result.page.ok, false);
  assert.equal(result.canonicalTarget, null);
});
