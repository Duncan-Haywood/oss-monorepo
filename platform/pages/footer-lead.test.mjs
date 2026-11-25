// The footer's lead line says "like this one — everything runs in your
// browser" only on tools that run in the browser. Product, docs and list
// pages (a desktop app, a watch face, a server) get a line that claims
// nothing about the page above it (polish 2026-11-15).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FOOTER_LEAD_NOT_A_BROWSER_TOOL, addSiteChrome, injectChrome } from './build.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const page = '<!doctype html><html><head><title>x</title></head><body><main>tool</main></body></html>';
const opts = { slug: 'x', toRoot: '../', total: 4, canonical: 'https://example.test/x/', isEntry: true, title: 'X' };
const LIKE_THIS_ONE = 'Free and private, like this one';

test('a browser tool keeps "like this one" (the default)', () => {
  const out = injectChrome(page, opts);
  assert.ok(out.includes(LIKE_THIS_ONE));
  assert.ok(!out.includes(FOOTER_LEAD_NOT_A_BROWSER_TOOL));
});

test('a page that is not a browser tool gets the neutral lead', () => {
  const out = injectChrome(page, { ...opts, browserTool: false });
  assert.ok(!out.includes(LIKE_THIS_ONE));
  assert.ok(!/runs in your browser/.test(out.split('pf-chrome-foot')[1]));
  assert.ok(out.includes(FOOTER_LEAD_NOT_A_BROWSER_TOOL));
});

test('a lookup tool still names its hosts, whatever the flag', () => {
  const out = injectChrome(page, { ...opts, browserTool: false, externalCallHosts: ['api.example.org'] });
  assert.match(out, /api\.example\.org/);
});

test('addSiteChrome: the entry page or the page itself has a control', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'footer-lead-'));
  try {
    const write = async (rel, body) => {
      await fs.mkdir(path.dirname(path.join(out, rel)), { recursive: true });
      await fs.writeFile(path.join(out, rel), `<!doctype html><html><head><title>t</title></head><body><main>${body}</main></body></html>`);
    };
    await write('calc/index.html', '<h1>Calc</h1><input type="number" id="a">');
    await write('calc/guide.html', '<h1>Guide</h1><p>prose only</p>');
    await write('docs/index.html', '<h1>Desktop app</h1><p>Download it.</p>');
    await write('docs/install.html', '<h1>Install</h1><p>prose</p>');
    await write('docs/try.html', '<h1>Try it</h1><select id="s"><option>a</option></select>');
    const surfaces = [
      { slug: 'calc', title: 'Calc', description: 'c', category: 'Other' },
      { slug: 'docs', title: 'Docs', description: 'd', category: 'Other' },
    ];
    await addSiteChrome({ outDir: out, surfaces, baseUrl: 'https://example.test/' });
    const read = (rel) => fs.readFile(path.join(out, rel), 'utf8');
    assert.ok((await read('calc/index.html')).includes(LIKE_THIS_ONE));
    assert.ok((await read('calc/guide.html')).includes(LIKE_THIS_ONE));
    // A hub whose index has no control still has calculators inside it.
    assert.ok((await read('docs/try.html')).includes(LIKE_THIS_ONE));
    for (const rel of ['docs/index.html', 'docs/install.html']) {
      const html = await read(rel);
      assert.ok(!html.includes(LIKE_THIS_ONE), rel);
      assert.ok(html.includes(FOOTER_LEAD_NOT_A_BROWSER_TOOL), rel);
    }
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
});
