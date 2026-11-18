import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GENERATED_PAGES, generateVenturePages, scriptsOf } from './generated-pages.mjs';

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

test('a venture with several generators runs each, in order', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gen-pages-'));
  try {
    mkdirSync(path.join(root, 'demo'));
    writeFileSync(path.join(root, 'demo', 'a.mjs'), "import { writeFileSync } from 'node:fs';\nwriteFileSync('out.txt', 'a');\n");
    writeFileSync(path.join(root, 'demo', 'b.mjs'), "import { appendFileSync } from 'node:fs';\nappendFileSync('out.txt', 'b');\n");
    assert.deepEqual(generateVenturePages(root, { demo: ['a.mjs', 'b.mjs'] }), ['demo']);
    assert.equal(readFileSync(path.join(root, 'demo', 'out.txt'), 'utf8'), 'ab');
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
  for (const [slug, entry] of Object.entries(GENERATED_PAGES)) for (const script of scriptsOf(entry)) {
    assert.ok(existsSync(new URL(`../../ventures/${slug}/${script}`, import.meta.url)), `${slug}/${script}`);
  }
});

// The rule above GENERATED_PAGES (write only gitignored files) had no check:
// shed-designer's make-size-pages.mjs rewrote the committed sitemap.xml on
// every build until a 2026-11-12 run noticed by hand. This runs each listed
// generator in the real tree and fails if a tracked file changed or a new
// file appeared that git would pick up. A changed tracked file is put back.
const repo = new URL('../../', import.meta.url).pathname;
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
let inGit = false;
try { inGit = git('rev-parse', '--is-inside-work-tree').trim() === 'true'; } catch { /* not a checkout */ }

test('every listed generator writes only gitignored files', { skip: !inGit && 'not a git checkout' }, () => {
  for (const slug of Object.keys(GENERATED_PAGES)) {
    const dir = `ventures/${slug}`;
    const tracked = git('ls-files', '-z', '--', dir).split('\0').filter(Boolean);
    const before = new Map(tracked.map((f) => [f, existsSync(path.join(repo, f)) ? readFileSync(path.join(repo, f)) : null]));
    const untracked = () => new Set(git('ls-files', '-z', '--others', '--exclude-standard', '--', dir).split('\0').filter(Boolean));
    const newBefore = untracked();
    generateVenturePages(path.join(repo, 'ventures'), { [slug]: GENERATED_PAGES[slug] });
    const changed = [];
    for (const [f, bytes] of before) {
      const now = existsSync(path.join(repo, f)) ? readFileSync(path.join(repo, f)) : null;
      if (bytes === null || now === null ? bytes !== now : !bytes.equals(now)) {
        changed.push(f);
        if (bytes !== null) writeFileSync(path.join(repo, f), bytes);
      }
    }
    const added = [...untracked()].filter((f) => !newBefore.has(f));
    assert.deepEqual(changed, [], `${slug}'s generator rewrote committed files (put back): ${changed.join(', ')}; generate them at build time and gitignore them, or move the script to portfolio-pages.yml as make-gallery.mjs was`);
    assert.deepEqual(added, [], `${slug}'s generator wrote files git does not ignore: ${added.join(', ')}; add them to the venture's .gitignore`);
  }
});
