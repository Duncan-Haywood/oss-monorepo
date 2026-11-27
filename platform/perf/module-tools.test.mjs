// module-weight.mjs and module-exclusive.mjs on throwaway fixtures: the argument
// shapes perf runs pass (an app dir, a multi-app venture, a built Vite dist, a
// .mjs entry), each of which used to exit with an error.
// Run: node --test platform/perf/module-tools.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const weight = path.join(here, 'module-weight.mjs');
const exclusive = path.join(here, 'module-exclusive.mjs');

function tree(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'modtools-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
    fs.writeFileSync(path.join(d, rel), body);
  }
  return d;
}
const run = (script, arg) => spawnSync(process.execPath, [script, arg], { encoding: 'utf8' });
const big = (n) => `export const x = ${JSON.stringify(Array.from({ length: n }, (_, i) => i * 7919 % 10007))};\n`;

test('module-weight: a plain page dir is swept alone', () => {
  const d = tree({ 'index.html': '<script type="module" src="./a.mjs"></script>', 'a.mjs': "import './b.mjs';\n", 'b.mjs': big(50) });
  const out = execFileSync(process.execPath, [weight, d], { encoding: 'utf8' });
  assert.match(out, /2 files/);
  assert.match(out, /pages with module graphs: 1 /);
});

test('module-weight: a multi-app venture sweeps apps/*, a Vite app reads dist/ and says when it is unbuilt', () => {
  const d = tree({
    'apps/site/index.html': '<script type="module">import "./m.mjs"</script>', 'apps/site/m.mjs': big(10),
    // Built Vite output: the page loads /assets/... from the site root, which is dist/.
    'apps/app/vite.config.ts': 'export default {}', 'apps/app/index.html': '<script type="module" src="/src/main.tsx"></script>',
    'apps/app/dist/index.html': '<script type="module" crossorigin src="/assets/index-abc.js"></script>',
    'apps/app/dist/assets/index-abc.js': 'import"./chunk-1.js";\n', 'apps/app/dist/assets/chunk-1.js': big(200),
    // The Cloudflare Vite plugin builds to dist/client/ (payapps, 2026-11-27).
    'apps/cf/vite.config.ts': '', 'apps/cf/index.html': '<script type="module" src="/src/main.tsx"></script>',
    'apps/cf/dist/client/index.html': '<script type="module" src="/assets/i.js"></script>', 'apps/cf/dist/client/assets/i.js': big(5),
    'apps/raw/vite.config.mjs': '', 'apps/raw/index.html': '<script type="module" src="/src/main.tsx"></script>',
  });
  const out = execFileSync(process.execPath, [weight, d], { encoding: 'utf8' });
  assert.match(out, /2 files \S+\/apps\/app dist\/assets\/chunk-1\.js/);
  assert.match(out, /1 files \S+\/apps\/site/);
  assert.match(out, /not built: \S+\/apps\/raw is a Vite app with no dist\//);
  assert.match(out, /1 files \S+\/apps\/cf dist\/client\/assets\/i\.js/);
  assert.match(out, /pages with module graphs: 3 /);
});

test('module-weight: a dir that is none of these exits 2 with the reason', () => {
  const r = run(weight, tree({ 'README.md': '' }));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not the repo root/);
});

test('module-exclusive: a .mjs entry splits by its own static imports', () => {
  const d = tree({
    'engine.mjs': "import './a.mjs';\nimport './b.mjs';\n",
    'a.mjs': "import './shared.mjs';\nimport './only-a.mjs';\n", 'only-a.mjs': big(300),
    'b.mjs': "import './shared.mjs';\n", 'shared.mjs': big(100),
  });
  const out = execFileSync(process.execPath, [exclusive, path.join(d, 'engine.mjs')], { encoding: 'utf8' });
  const rows = out.trim().split('\n');
  assert.match(rows[0], /^total \d+ kB gz 5 files$/);
  assert.match(rows[1], /^\d+k a\.mjs (a\.mjs,only-a\.mjs|only-a\.mjs,a\.mjs)$/);
  assert.match(rows[2], /^\d+k b\.mjs b\.mjs$/);
});

test('module-exclusive: an html page still reads its module scripts; none exits 1', () => {
  const d = tree({ 'index.html': '<script type="module" src="./a.mjs"></script>', 'a.mjs': '', 'empty.html': '<p>hi</p>', 'leaf.mjs': 'export const y = 1;\n' });
  assert.match(execFileSync(process.execPath, [exclusive, path.join(d, 'index.html')], { encoding: 'utf8' }), /^total 0 kB gz 1 files/);
  assert.equal(run(exclusive, path.join(d, 'empty.html')).status, 1);
  assert.equal(run(exclusive, path.join(d, 'leaf.mjs')).status, 1);
});
