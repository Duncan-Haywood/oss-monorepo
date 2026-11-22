// Tests for module-weight.mjs and module-exclusive.mjs on a planted repo.
// Run: node --test platform/perf/perf.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import zlib from 'node:zlib'; import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gz = (s) => zlib.gzipSync(s).length;

function plant(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-test-'));
  for (const [rel, body] of Object.entries(files)) {
    const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body);
  }
  return root;
}
const run = (script, args, cwd) => spawnSync('node', [path.join(here, script), ...args], { cwd, encoding: 'utf8' });

// p: src entry main.mjs -> a (minified import), re (export * as) -> c, b (?v= query); inline -> d, shared.
// big: one incompressible module over 200 kB gzip.
const big = crypto.randomBytes(240 * 1024).toString('base64');
const files = {
  'ventures/p/index.html': '<script type="module" src="main.mjs?v=1"></script>\n<script type="module">import "./d.mjs"; import {s} from "./shared.mjs";</script>\n',
  'ventures/p/main.mjs': "import{a}from'./a.mjs';\nimport { x } from './re.mjs';\nimport './b.mjs?v=2';\nimport {s} from './shared.mjs';\n",
  'ventures/p/a.mjs': 'export const a = 1;\n',
  'ventures/p/re.mjs': "export * as ns from './c.mjs';\nexport const x = 1;\n",
  'ventures/p/b.mjs': 'export const b = 2;\n',
  'ventures/p/c.mjs': 'export const c = 3;\n',
  'ventures/p/d.mjs': 'export const d = 4;\n',
  'ventures/p/shared.mjs': 'export const s = 5;\n',
  'ventures/big/index.html': '<script type="module">import { big } from "./big.mjs";</script>',
  'ventures/big/big.mjs': `export const big = "${big}";\n`,
  'ventures/none/index.html': '<p>no scripts</p>',
};

test('module-weight walks minified imports, export * as, src entries and query strings', () => {
  const root = plant(files);
  const out = execFileSync('node', [path.join(here, 'module-weight.mjs'), root], { encoding: 'utf8' });
  const p = out.split('\n').find(l => / p /.test(l));
  assert.ok(p, out);
  assert.match(p, /\b7 files p\b/, 'main, a, re, c, b, d, shared');
  assert.match(out, /pages with module graphs: 2 {2}over 200kB: 1/);
});

test('module-weight total is the sum of per-file gzip', () => {
  const root = plant(files);
  const out = execFileSync('node', [path.join(here, 'module-weight.mjs'), root], { encoding: 'utf8' });
  const want = gz(fs.readFileSync(path.join(root, 'ventures/big/big.mjs')));
  assert.match(out, new RegExp(`^${Math.round(want / 1024)}kB gz 1 files big`, 'm'));
});

test('module-exclusive reads <script type=module src> roots and splits exclusive bytes', () => {
  const root = plant(files); const dir = path.join(root, 'ventures/p');
  const r = run('module-exclusive.mjs', ['ventures/p/index.html'], root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^total 0 kB gz 7 files$/m);
  const row = r.stdout.split('\n').find(l => / main\.mjs /.test(l));
  assert.ok(row, r.stdout);
  const ex = row.split(' ')[2].split(',').sort();
  // shared.mjs is also imported inline, so it is not exclusive to main.mjs.
  assert.deepEqual(ex, ['a.mjs', 'b.mjs', 'c.mjs', 'main.mjs', 're.mjs']);
  const d = r.stdout.split('\n').find(l => / d\.mjs /.test(l));
  assert.equal(d.split(' ')[2], 'd.mjs');
  assert.equal(r.stdout.split('\n').find(l => / shared\.mjs /.test(l)).split(' ')[2], '', 'shared row has nothing exclusive');
  assert.ok(gz(fs.readFileSync(path.join(dir, 'a.mjs'))) > 0);
});

test('module-exclusive reports exclusive gzip bytes', () => {
  const root = plant(files);
  const r = run('module-exclusive.mjs', ['ventures/big/index.html'], root);
  const want = gz(fs.readFileSync(path.join(root, 'ventures/big/big.mjs'), 'utf8'));
  assert.match(r.stdout, new RegExp(`^${Math.round(want / 1024)}k big\\.mjs big\\.mjs$`, 'm'));
});

test('module-exclusive fails loudly on a page with no module graph', () => {
  const root = plant(files);
  const r = run('module-exclusive.mjs', ['ventures/none/index.html'], root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no local module scripts/);
});
