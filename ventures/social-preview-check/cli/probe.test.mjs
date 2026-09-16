import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchBuffer, runProbe } from './probe.mjs';

function pngBytes(width, height) {
  const buf = Buffer.alloc(33);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

// --- fetchBuffer -------------------------------------------------------------

test('fetchBuffer resolves ok:false for an invalid URL rather than throwing', async () => {
  const result = await fetchBuffer('not a url');
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid URL/);
});

test('fetchBuffer resolves ok:false for an unsupported scheme', async () => {
  const result = await fetchBuffer('ftp://example.com/');
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported scheme/);
});

test('fetchBuffer resolves ok:false against a port nothing listens on', async () => {
  const result = await fetchBuffer('http://127.0.0.1:1/', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('fetchBuffer reads the full body from a real local server', async () => {
  await withServer(
    (req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('hello world'); },
    async (base) => {
      const result = await fetchBuffer(`${base}/`);
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.equal(result.body.toString('utf8'), 'hello world');
    },
  );
});

test('fetchBuffer stops at maxBytes rather than downloading the whole body', async () => {
  const big = Buffer.alloc(100_000, 0x41);
  await withServer(
    (req, res) => { res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(big); },
    async (base) => {
      const result = await fetchBuffer(`${base}/`, { maxBytes: 1000 });
      assert.equal(result.ok, true);
      assert.ok(result.body.length <= 1000, `expected <=1000 bytes, got ${result.body.length}`);
    },
  );
});

// --- runProbe: HTML + image fetch orchestration -------------------------------

test('runProbe resolves ok:false for an invalid URL', async () => {
  const result = await runProbe('not a url');
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid URL/);
});

test('runProbe reports a redirect without following it', async () => {
  await withServer(
    (req, res) => { res.writeHead(302, { location: 'https://example.com/final' }); res.end(); },
    async (base) => {
      const result = await runProbe(`${base}/`);
      assert.equal(result.ok, true);
      assert.equal(result.redirectStatus, 302);
      assert.equal(result.redirectLocation, 'https://example.com/final');
      assert.equal(result.tags, null);
    },
  );
});

test('runProbe parses tags and fetches the resolved og:image, reading its real dimensions', async () => {
  const png = pngBytes(1200, 630);
  await withServer(
    (req, res) => {
      if (req.url === '/preview.png') {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(png);
      } else if (req.url === '/') {
        const imgUrl = `http://${req.headers.host}/preview.png`;
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><head>
          <title>T</title>
          <meta property="og:title" content="Hello">
          <meta property="og:image" content="${imgUrl}">
        </head></html>`);
      } else {
        res.writeHead(404); res.end();
      }
    },
    async (base) => {
      const result = await runProbe(`${base}/`);
      assert.equal(result.ok, true);
      assert.equal(result.tags.og.title, 'Hello');
      assert.equal(result.images.ogImage.url, `${base}/preview.png`);
      assert.equal(result.images.ogImage.fetch.ok, true);
      assert.deepEqual(result.images.ogImage.fetch.size, { format: 'png', width: 1200, height: 630, incomplete: false });
    },
  );
});

test('runProbe does not fetch a relative og:image (nothing valid to request)', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<meta property="og:image" content="relative.png">`);
    },
    async (base) => {
      const result = await runProbe(`${base}/`);
      assert.equal(result.images.ogImage.url, null);
      assert.equal(result.images.ogImage.fetch, null);
    },
  );
});

test('runProbe reuses the og:image fetch when twitter:image is the identical URL', async () => {
  const png = pngBytes(1200, 630);
  let imageRequests = 0;
  await withServer(
    (req, res) => {
      if (req.url === '/shared.png') {
        imageRequests += 1;
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(png);
      } else if (req.url === '/') {
        const imgUrl = `http://${req.headers.host}/shared.png`;
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<meta property="og:image" content="${imgUrl}"><meta name="twitter:image" content="${imgUrl}">`);
      } else {
        res.writeHead(404); res.end();
      }
    },
    async (base) => {
      const result = await runProbe(`${base}/`);
      assert.equal(imageRequests, 1, 'expected the identical image URL to be fetched only once');
      assert.equal(result.images.twitterImage.fetch, result.images.ogImage.fetch);
    },
  );
});

test('runProbe reports og-image fetch failure when the image 404s', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/') {
        const imgUrl = `http://${req.headers.host}/missing.png`;
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<meta property="og:image" content="${imgUrl}">`);
      } else {
        res.writeHead(404); res.end();
      }
    },
    async (base) => {
      const result = await runProbe(`${base}/`);
      assert.equal(result.images.ogImage.fetch.ok, false);
      assert.equal(result.images.ogImage.fetch.status, 404);
    },
  );
});
