// Every Lambda zip that OpenTofu builds from a file list (`archive_file` with
// `"<path in zip>" = "${path.module}/<source>"` entries) must hold every
// module its handler imports, at the right relative path. A missing file is
// not caught by `tofu test` (the zip is never run there); it surfaces as
// ERR_MODULE_NOT_FOUND on the first real invocation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STACKS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'aws', 'stacks');

/** Pure: the zip lists in one .tf file, each as Map(zip path -> source path relative to the stack). */
export function zipLists(tf) {
  const lists = [];
  const re = /"([\w./-]+\.(?:mjs|js|json))"\s*=\s*"\$\{path\.module\}\/([^"]+)"/g;
  // Entries are grouped by the block they sit in: split at each archive_file or locals block.
  for (const block of tf.split(/\n(?=data "archive_file"|locals \{)/)) {
    const m = new Map();
    for (const [, zip, src] of block.matchAll(re)) m.set(zip, src);
    if (m.size) lists.push(m);
  }
  return lists;
}

/** Pure: the relative specifiers a module imports statically. */
export function relativeImports(source) {
  const out = [];
  for (const [, spec] of source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) out.push(spec);
  for (const [, spec] of source.matchAll(/(?:^|\n)\s*import\s+['"](\.{1,2}\/[^'"]+)['"]/g)) out.push(spec);
  return out;
}

/** Pure: the handlers named in one .tf file (`handler = "dir/module.export"`). */
export function handlers(tf) {
  return [...tf.matchAll(/\bhandler\s*=\s*"([\w./-]+)\.(\w+)"/g)].map(([, mod, fn]) => ({ mod, fn }));
}

const stacks = readdirSync(STACKS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

for (const stack of stacks) {
  const dir = path.join(STACKS, stack);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.tf'))) {
    for (const list of zipLists(readFileSync(path.join(dir, file), 'utf8'))) {
      test(`${stack}/${file}: the zip of ${[...list.keys()][0]} holds every module it imports`, () => {
        for (const [zip, src] of list) {
          const abs = path.join(dir, src);
          assert.ok(existsSync(abs), `${zip}: source ${src} does not exist`);
          if (!zip.endsWith('.mjs') && !zip.endsWith('.js')) continue;
          for (const spec of relativeImports(readFileSync(abs, 'utf8'))) {
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(zip), spec));
            assert.ok(list.has(target), `${zip} imports ${spec}, but ${target} is not in the zip`);
          }
        }
      });
      const tf = readFileSync(path.join(dir, file), 'utf8');
      for (const h of handlers(tf).filter((x) => list.has(`${x.mod}.mjs`))) {
        test(`${stack}/${file}: ${h.mod}.${h.fn} loads from the zip's files alone`, async () => {
          const root = mkdtempSync(path.join(os.tmpdir(), 'lambda-zip-'));
          try {
            for (const [zip, src] of list) {
              mkdirSync(path.join(root, path.dirname(zip)), { recursive: true });
              copyFileSync(path.join(dir, src), path.join(root, zip));
            }
            const mod = await import(pathToFileURL(path.join(root, `${h.mod}.mjs`)).href);
            assert.equal(typeof mod[h.fn], 'function', `${h.mod}.mjs exports ${h.fn}`);
          } finally {
            rmSync(root, { recursive: true, force: true });
          }
        });
      }
    }
  }
}

test('relativeImports finds static imports and re-exports, not bare or node: ones', () => {
  const src = "import a from './a.mjs';\nimport { b } from '../b.mjs';\nexport { c } from './c.mjs';\nimport './side.mjs';\nimport x from 'node:fs';\nimport cfg from './inboxes.json' with { type: 'json' };\nimport {\n  d,\n} from './d.mjs';\n";
  assert.deepEqual(relativeImports(src).sort(), ['../b.mjs', './a.mjs', './c.mjs', './d.mjs', './inboxes.json', './side.mjs']);
});
