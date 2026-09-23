import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { extractScriptSrcs, extractSourceMappingUrl, checkScript, checkPage } from './probe.mjs';

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

const FULL_MAP = JSON.stringify({
  version: 3,
  sources: ['webpack:///src/App.jsx', 'webpack:///src/api/secrets.js'],
  sourcesContent: ['export default function App() {}', "export const KEY = 'sk_live_abcdef';"],
});

const PATHS_ONLY_MAP = JSON.stringify({
  version: 3,
  sources: ['webpack:///src/App.jsx', 'webpack:///src/utils.js'],
});

function fakeSite(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, type, body) => {
    res.writeHead(status, { 'content-type': type });
    res.end(body);
  };
  if (url.pathname === '/') {
    send(200, 'text/html', `<!doctype html><html><head>
      <script src="/static/exposed.js"></script>
      <script src="/static/blocked.js"></script>
      <script src="/static/clean.js"></script>
      <script src="/static/broken.js"></script>
      </head><body></body></html>`);
    return;
  }
  if (url.pathname === '/static/exposed.js') {
    send(200, 'application/javascript', 'console.log(1);\n//# sourceMappingURL=exposed.js.map\n');
    return;
  }
  if (url.pathname === '/static/exposed.js.map') {
    send(200, 'application/json', FULL_MAP);
    return;
  }
  if (url.pathname === '/static/blocked.js') {
    send(200, 'application/javascript', 'console.log(2);\n//# sourceMappingURL=blocked.js.map\n');
    return;
  }
  if (url.pathname === '/static/blocked.js.map') {
    send(404, 'text/plain', 'not found');
    return;
  }
  if (url.pathname === '/static/clean.js') {
    send(200, 'application/javascript', 'console.log(3);\n');
    return;
  }
  if (url.pathname === '/static/broken.js') {
    send(500, 'text/plain', 'server error');
    return;
  }
  send(404, 'text/plain', 'not found');
}

test('extractScriptSrcs finds and resolves every script src against the base URL', () => {
  const html = '<script src="/a.js"></script><script src="b.js"></script><script>inline</script>';
  assert.deepEqual(
    extractScriptSrcs(html, 'https://example.com/dir/page.html'),
    ['https://example.com/a.js', 'https://example.com/dir/b.js'],
  );
});

test('extractScriptSrcs de-duplicates repeated srcs', () => {
  const html = '<script src="/a.js"></script><script src="/a.js"></script>';
  assert.deepEqual(extractScriptSrcs(html, 'https://example.com/'), ['https://example.com/a.js']);
});

test('extractSourceMappingUrl finds the modern // # form', () => {
  assert.equal(extractSourceMappingUrl('code;\n//# sourceMappingURL=app.js.map\n'), 'app.js.map');
});

test('extractSourceMappingUrl finds the legacy //@ form', () => {
  assert.equal(extractSourceMappingUrl('code;\n//@ sourceMappingURL=app.js.map\n'), 'app.js.map');
});

test('extractSourceMappingUrl returns null when no comment is present', () => {
  assert.equal(extractSourceMappingUrl('console.log("hello");'), null);
});

test('extractSourceMappingUrl returns the last reference when more than one is present', () => {
  const src = '//# sourceMappingURL=first.map\ncode;\n//# sourceMappingURL=second.map\n';
  assert.equal(extractSourceMappingUrl(src), 'second.map');
});

test('checkScript reports mapFetchable + hasSourcesContent for a fully exposed map', () =>
  withServer(fakeSite, async (base) => {
    const result = await checkScript(`${base}/static/exposed.js`);
    assert.equal(result.hasReference, true);
    assert.equal(result.mapFetchable, true);
    assert.equal(result.hasSourcesContent, true);
    assert.equal(result.sourcesCount, 2);
    assert.equal(result.mapUrl, `${base}/static/exposed.js.map`);
  }));

test('checkScript reports mapFetchable + no sourcesContent for a paths-only map', () =>
  withServer((req, res) => {
    if (req.url === '/paths.js') {
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end('code;\n//# sourceMappingURL=paths.js.map\n');
      return;
    }
    if (req.url === '/paths.js.map') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(PATHS_ONLY_MAP);
      return;
    }
    res.writeHead(404); res.end();
  }, async (base) => {
    const result = await checkScript(`${base}/paths.js`);
    assert.equal(result.mapFetchable, true);
    assert.equal(result.hasSourcesContent, false);
    assert.equal(result.sourcesCount, 2);
  }));

test('checkScript reports hasReference but not mapFetchable when the map 404s', () =>
  withServer(fakeSite, async (base) => {
    const result = await checkScript(`${base}/static/blocked.js`);
    assert.equal(result.hasReference, true);
    assert.equal(result.mapFetchable, false);
    assert.equal(result.status, 404);
  }));

test('checkScript reports no reference at all for a clean script', () =>
  withServer(fakeSite, async (base) => {
    const result = await checkScript(`${base}/static/clean.js`);
    assert.equal(result.hasReference, false);
    assert.equal(result.error, null);
  }));

test('checkScript reports an error when the script itself fails to fetch', () =>
  withServer(fakeSite, async (base) => {
    const result = await checkScript(`${base}/static/broken.js`);
    assert.equal(result.hasReference, false);
    assert.ok(result.error);
  }));

test('checkScript decodes an inline base64 data: URI source map', () =>
  withServer((req, res) => {
    const inlineMap = Buffer.from(JSON.stringify({
      version: 3, sources: ['a.js'], sourcesContent: ['const a = 1;'],
    })).toString('base64');
    res.writeHead(200, { 'content-type': 'application/javascript' });
    res.end(`code;\n//# sourceMappingURL=data:application/json;base64,${inlineMap}\n`);
  }, async (base) => {
    const result = await checkScript(base);
    assert.equal(result.hasReference, true);
    assert.equal(result.mapFetchable, true);
    assert.equal(result.hasSourcesContent, true);
    assert.match(result.mapUrl, /inline/);
  }));

test('checkScript reports an error for a malformed inline data: URI', () =>
  withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/javascript' });
    res.end('code;\n//# sourceMappingURL=data:application/json;base64,not-valid-base64-json\n');
  }, async (base) => {
    const result = await checkScript(base);
    assert.equal(result.hasReference, true);
    assert.equal(result.mapFetchable, false);
    assert.ok(result.error);
  }));

test('checkPage fetches the page, discovers scripts, and checks each', () =>
  withServer(fakeSite, async (base) => {
    const report = await checkPage(base);
    assert.equal(report.pageError, null);
    assert.equal(report.scripts.length, 4);
    const byUrl = Object.fromEntries(report.scripts.map((s) => [s.scriptUrl, s]));
    assert.equal(byUrl[`${base}/static/exposed.js`].hasSourcesContent, true);
    assert.equal(byUrl[`${base}/static/blocked.js`].mapFetchable, false);
    assert.equal(byUrl[`${base}/static/clean.js`].hasReference, false);
  }));

test('checkPage accepts an explicit script list and skips the page fetch', () =>
  withServer(fakeSite, async (base) => {
    const report = await checkPage(null, { scriptUrls: [`${base}/static/exposed.js`] });
    assert.equal(report.scripts.length, 1);
    assert.equal(report.scripts[0].scriptUrl, `${base}/static/exposed.js`);
  }));

test('checkPage reports pageError when the page itself cannot be fetched', () =>
  withServer(fakeSite, async (base) => {
    const report = await checkPage(`${base}/does-not-exist`);
    assert.ok(report.pageError);
    assert.equal(report.scripts.length, 0);
  }));

test('checkPage throws a clear error when given neither a page URL nor scripts', async () => {
  await assert.rejects(() => checkPage(null, {}), /page URL or an explicit list/);
});

test('checkPage truncates at maxScripts and reports truncated', () =>
  withServer(fakeSite, async (base) => {
    const report = await checkPage(null, {
      scriptUrls: [`${base}/static/clean.js`, `${base}/static/exposed.js`, `${base}/static/blocked.js`],
      maxScripts: 2,
    });
    assert.equal(report.scripts.length, 2);
    assert.equal(report.truncated, true);
  }));

test('an unreachable script reports a clean error rather than throwing', async () => {
  const result = await checkScript('http://127.0.0.1:1/x.js', { timeoutMs: 500 });
  assert.equal(result.hasReference, false);
  assert.ok(result.error);
});
