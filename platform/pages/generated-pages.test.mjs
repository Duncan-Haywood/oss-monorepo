import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GENERATED_PAGES, generateVenturePages } from './generated-pages.mjs';

test('a venture page generator runs in its own directory before the build copies it', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gen-pages-'));
  try {
    mkdirSync(path.join(root, 'demo'));
    writeFileSync(path.join(root, 'demo', 'make.mjs'), "import { writeFileSync } from 'node:fs';\nwriteFileSync('out.html', '<p>made</p>');\n");
    const ran = generateVenturePages(root, { demo: 'make.mjs', missing: 'make.mjs' });
    assert.deepEqual(ran, ['demo']);
    assert.equal(readFileSync(path.join(root, 'demo', 'out.html'), 'utf8'), '<p>made</p>');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a generator that throws stops the build rather than shipping without its pages', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gen-pages-'));
  try {
    mkdirSync(path.join(root, 'demo'));
    writeFileSync(path.join(root, 'demo', 'make.mjs'), "throw new Error('broken');\n");
    assert.throws(() => generateVenturePages(root, { demo: 'make.mjs' }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('every listed generator exists in the tree', () => {
  for (const [slug, script] of Object.entries(GENERATED_PAGES)) {
    assert.ok(existsSync(new URL(`../../ventures/${slug}/${script}`, import.meta.url)), `${slug}/${script}`);
  }
});
