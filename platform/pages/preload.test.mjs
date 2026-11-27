import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { pathToFileURL } from 'node:url';

import {
  WORKER_FLAT_MARKER, addModulePreloads, flattenWorkerGraphs, injectPreloads, moduleGraph, pageEntries,
  resolveSpecifier, staticImports, strictStaticImports, workerEntries,
} from './preload.mjs';
import { listFiles } from './build.mjs';

test('staticImports finds import and re-export forms, not dynamic import()', () => {
  const src = `
    import { a, b } from './a.mjs';
    import c from "../c.mjs";
    import './side.mjs';
    import * as ns from './ns.mjs';
    export { d } from './d.mjs';
    export * from './e.mjs';
    const lazy = await import('./lazy.mjs');
    const s = "important from 'x'";
  `;
  assert.deepEqual(staticImports(src), ['./a.mjs', '../c.mjs', './side.mjs', './ns.mjs', './d.mjs', './e.mjs']);
});

test('pageEntries reads module script src and inline module imports only', () => {
  const html = `<head></head><body>
    <script src="classic.js"></script>
    <script type="module" src="../pf-embed.js" data-x="1"></script>
    <script type="module">import { run } from "./engine.mjs"; run();</script>
    <script type="application/ld+json">{"import": "x"}</script>
    <script>import('./not-module.mjs')</script>
  </body>`;
  assert.deepEqual(pageEntries(html), ['../pf-embed.js', './engine.mjs']);
});

test('resolveSpecifier keeps relative and root paths inside the build', () => {
  const out = '/site';
  assert.equal(resolveSpecifier('./a.mjs?v=2', '/site/tool', out), '/site/tool/a.mjs');
  assert.equal(resolveSpecifier('/pf-site.js', '/site/tool', out), '/site/pf-site.js');
  assert.equal(resolveSpecifier('../../../etc/x.mjs', '/site/tool', out), null);
  assert.equal(resolveSpecifier('lodash', '/site/tool', out), null);
  assert.equal(resolveSpecifier('https://cdn.example/x.mjs', '/site/tool', out), null);
  assert.equal(resolveSpecifier('//cdn.example/x.mjs', '/site/tool', out), null);
});

test('moduleGraph measures the longest chain and survives cycles and missing files', async () => {
  const src = {
    '/s/t/a.mjs': "import './b.mjs'; import './missing.mjs';",
    '/s/t/b.mjs': "import './c.mjs';",
    '/s/t/c.mjs': "import './a.mjs';", // cycle back to a
    '/s/t/flat.mjs': '',
  };
  const read = async (f) => src[f] ?? null;
  const html = '<script type="module">import "./a.mjs"; import "./flat.mjs";</script>';
  const g = await moduleGraph(html, '/s/t/index.html', '/s', read);
  assert.deepEqual(g.files.sort(), ['/s/t/a.mjs', '/s/t/b.mjs', '/s/t/c.mjs', '/s/t/flat.mjs']);
  assert.equal(g.depth, 3);
});

test('injectPreloads adds links before </head> and leaves pages with their own alone', () => {
  const out = injectPreloads('<html><head><title>x</title></head><body></body></html>', ['./a.mjs', '../b.js']);
  assert.match(out, /<link rel="modulepreload" href="\.\/a\.mjs">\n<link rel="modulepreload" href="\.\.\/b\.js">\n<\/head>/);
  const own = '<head><link rel="modulepreload" href="x.mjs"></head>';
  assert.equal(injectPreloads(own, ['./a.mjs']), own);
  assert.equal(injectPreloads('<body>no head</body>', ['./a.mjs']), '<body>no head</body>');
});

test('addModulePreloads writes links only on pages with an import chain', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'preload-'));
  try {
    await fs.mkdir(path.join(dir, 'tool'), { recursive: true });
    await fs.mkdir(path.join(dir, 'flat'), { recursive: true });
    await fs.writeFile(path.join(dir, 'shared.js'), '');
    await fs.writeFile(path.join(dir, 'tool', 'engine.mjs'), "import { f } from './util.mjs'; export const run = f;");
    await fs.writeFile(path.join(dir, 'tool', 'util.mjs'), "import '../shared.js'; export const f = 1;");
    await fs.writeFile(path.join(dir, 'tool', 'index.html'),
      '<html><head><title>t</title></head><body><script type="module">import { run } from "./engine.mjs";</script></body></html>');
    await fs.writeFile(path.join(dir, 'flat', 'leaf.mjs'), 'export const x = 1;');
    const flat = '<html><head></head><body><script type="module" src="./leaf.mjs"></script></body></html>';
    await fs.writeFile(path.join(dir, 'flat', 'index.html'), flat);

    const r = await addModulePreloads(dir, { listFiles });
    assert.deepEqual(r, { pages: 1, links: 3, deepest: 3 });
    const tool = await fs.readFile(path.join(dir, 'tool', 'index.html'), 'utf8');
    for (const href of ['./engine.mjs', './util.mjs', '../shared.js']) {
      assert.ok(tool.includes(`<link rel="modulepreload" href="${href}">`), href);
    }
    assert.equal(await fs.readFile(path.join(dir, 'flat', 'index.html'), 'utf8'), flat);

    // A second pass is a no-op.
    assert.deepEqual(await addModulePreloads(dir, { listFiles }), { pages: 0, links: 0, deepest: 0 });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('addModulePreloads gives the same bytes and totals as one page at a time', async () => {
  // 60 pages (more than the 32 in flight) sharing modules, with chains of
  // different depths, against a serial reference built from the same parts.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'preload-many-'));
  try {
    await fs.writeFile(path.join(dir, 'shared.js'), '');
    await fs.writeFile(path.join(dir, 'mid.mjs'), "import './shared.js';");
    for (let i = 0; i < 60; i += 1) {
      const sub = path.join(dir, `t${i}`);
      await fs.mkdir(sub);
      let prev = '../mid.mjs';
      for (let k = 0; k < i % 5; k += 1) {
        await fs.writeFile(path.join(sub, `m${k}.mjs`), `import '${prev}';`);
        prev = `./m${k}.mjs`;
      }
      await fs.writeFile(path.join(sub, 'index.html'),
        `<html><head><title>${i}</title></head><body><script type="module">import '${prev}';</script></body></html>`);
    }
    const pages = (await listFiles(dir)).filter((f) => f.endsWith('.html'));
    const expected = new Map();
    const totals = { pages: 0, links: 0, deepest: 0 };
    const read = async (f) => { try { return await fs.readFile(f, 'utf8'); } catch { return null; } };
    for (const file of pages) {
      const html = await fs.readFile(file, 'utf8');
      const { files, depth } = await moduleGraph(html, file, dir, read);
      const hrefs = files.map((f) => {
        const rel = path.relative(path.dirname(file), f).split(path.sep).join('/');
        return rel.startsWith('.') ? rel : `./${rel}`;
      });
      const out = depth >= 2 ? injectPreloads(html, hrefs) : html;
      expected.set(file, out);
      if (out !== html) { totals.pages += 1; totals.links += hrefs.length; totals.deepest = Math.max(totals.deepest, depth); }
    }
    assert.deepEqual(await addModulePreloads(dir, { listFiles }), totals);
    for (const [file, out] of expected) assert.equal(await fs.readFile(file, 'utf8'), out, file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('strictStaticImports skips specifiers in comments and strings', () => {
  const src = `import { a } from './a.mjs';
    // import './in-line-comment.mjs';
    /* import './in-block.mjs';
       export * from './in-block-too.mjs'; */
    const url = "https://example.com/x"; import b from "./b.mjs";
    const s = "import './in-string.mjs'";
    import {
      c,
      d as e,
    } from './c.mjs';
    export * from './d.mjs';
    const lazy = import('./lazy.mjs');`;
  assert.deepEqual(strictStaticImports(src), ['./a.mjs', './b.mjs', './c.mjs', './d.mjs']);
});

test('workerEntries finds module workers in the forms pages use, not classic ones', () => {
  const src = `
    new Worker("./a-worker.mjs", { type: "module" });
    new Worker(new URL('./b-worker.mjs', import.meta.url), { type: 'module' });
    new Worker(new URL("c-worker.mjs", location.href), { type: "module", name: "c" });
    new Worker("./classic.js");
    new Worker("https://cdn.example/x.mjs", { type: "module" });
    new SharedWorker("../d-worker.mjs", { type: "module" });`;
  assert.deepEqual(workerEntries(src, '/s/t/index.html', '/s'),
    ['/s/t/a-worker.mjs', '/s/t/b-worker.mjs', '/s/t/c-worker.mjs', '/s/d-worker.mjs']);
});

test('flattenWorkerGraphs lists a deep worker graph at depth 1 without changing evaluation order', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-flat-'));
  const orig = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-orig-'));
  try {
    // Each module logs when it evaluates, so the order can be compared.
    const mods = {
      'deep-worker.mjs': "import './a.mjs'; import { z } from './z.mjs'; (globalThis.order ||= []).push('deep-worker');",
      'a.mjs': "import './b.mjs'; // import './not-loaded.mjs';\n(globalThis.order ||= []).push('a');",
      'b.mjs': "import './c.mjs'; import './z.mjs'; (globalThis.order ||= []).push('b');",
      'c.mjs': "import './a.mjs'; (globalThis.order ||= []).push('c');", // a cycle back to a
      'z.mjs': "export const z = 1; (globalThis.order ||= []).push('z');",
      'not-loaded.mjs': "(globalThis.order ||= []).push('not-loaded');",
      'flat-worker.mjs': "import './z.mjs';",
    };
    for (const [name, src] of Object.entries(mods)) {
      await fs.writeFile(path.join(dir, name), src);
      await fs.writeFile(path.join(orig, name), src);
    }
    await fs.writeFile(path.join(dir, 'index.html'), `<script type="module">
      const w = new Worker("./deep-worker.mjs", { type: "module" });
      const f = new Worker("./flat-worker.mjs", { type: "module" });
      const c = new Worker("./a.mjs");
    </script>`);

    const r = await flattenWorkerGraphs(dir, { listFiles });
    assert.deepEqual(r, { workers: 1, imports: 2, deepest: 4 });
    const flat = await fs.readFile(path.join(dir, 'deep-worker.mjs'), 'utf8');
    assert.ok(flat.startsWith(mods['deep-worker.mjs']));
    assert.equal(flat.slice(flat.indexOf(WORKER_FLAT_MARKER)).split('\n').slice(1).filter(Boolean).join('\n'),
      'import "./b.mjs";\nimport "./c.mjs";');
    // Shallow and classic workers, and modules no worker names, keep their bytes.
    for (const name of ['flat-worker.mjs', 'a.mjs', 'b.mjs']) {
      assert.equal(await fs.readFile(path.join(dir, name), 'utf8'), mods[name], name);
    }

    const run = async (file) => {
      globalThis.order = [];
      await import(pathToFileURL(file).href);
      return globalThis.order;
    };
    const before = await run(path.join(orig, 'deep-worker.mjs'));
    assert.deepEqual(before, ['c', 'z', 'b', 'a', 'deep-worker']);
    assert.deepEqual(await run(path.join(dir, 'deep-worker.mjs')), before);

    // A second pass is a no-op.
    assert.deepEqual(await flattenWorkerGraphs(dir, { listFiles }), { workers: 0, imports: 0, deepest: 0 });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(orig, { recursive: true, force: true });
    delete globalThis.order;
  }
});
