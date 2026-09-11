import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from './cli.mjs';

test('--help prints usage and exits 0', async () => {
  const { exitCode, output } = await run(['--help']);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
});

test('no arguments prints usage and exits 1', async () => {
  const { exitCode, output } = await run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

test('--dir requires --title', async () => {
  const { exitCode, output } = await run(['--dir', './docs'], {
    readDirImpl: async () => [],
  });
  assert.equal(exitCode, 1);
  assert.match(output, /--title is required/);
});

test('--dir walks a fake tree and groups by top-level subdirectory', async () => {
  const tree = {
    '.': [
      { name: 'guides', isDirectory: () => true, isFile: () => false },
      { name: 'readme.md', isDirectory: () => false, isFile: () => true },
    ],
    guides: [{ name: 'migrate.md', isDirectory: () => false, isFile: () => true }],
  };
  const files = {
    'readme.md': '# Overview\n\nWhat this project is.\n',
    'guides/migrate.md': '# Migration Guide\n\nHow to migrate.\n',
  };
  const { exitCode, output } = await run(['--dir', '.', '--title', 'Example Docs', '--base-url', 'https://example.test'], {
    readDirImpl: async (dir) => tree[dir.replace(/\\/g, '/').replace(/^\.\/?/, '.')] ?? tree[dir] ?? [],
    readFileImpl: async (p) => {
      const key = p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\.\//, '');
      const norm = key.startsWith('./') ? key.slice(2) : key;
      if (files[norm]) return files[norm];
      const guessKey = Object.keys(files).find((k) => p.endsWith(k));
      return files[guessKey];
    },
  });
  assert.equal(exitCode, 0);
  assert.match(output, /^# Example Docs/);
  assert.match(output, /## Docs/);
  assert.match(output, /\[Overview\]\(https:\/\/example\.test\/readme\.md\)/);
  assert.match(output, /## Guides/);
  assert.match(output, /\[Migration Guide\]\(https:\/\/example\.test\/guides\/migrate\.md\)/);
});

test('--sitemap reads a local file and builds a Pages section', async () => {
  const xml = '<urlset><url><loc>https://example.test/a</loc></url><url><loc>https://example.test/b</loc></url></urlset>';
  const { exitCode, output } = await run(['--sitemap', './sitemap.xml', '--title', 'Example Site'], {
    readFileImpl: async () => xml,
  });
  assert.equal(exitCode, 0);
  assert.match(output, /## Pages/);
  assert.match(output, /\[https:\/\/example\.test\/a\]\(https:\/\/example\.test\/a\)/);
});

test('--sitemap fetches a live URL instead of reading a file', async () => {
  let fetchedUrl = null;
  const xml = '<urlset><url><loc>https://example.test/live</loc></url></urlset>';
  const { exitCode, output } = await run(['--sitemap', 'https://example.test/sitemap.xml', '--title', 'T'], {
    fetchImpl: async (url) => {
      fetchedUrl = url;
      return { ok: true, text: async () => xml };
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(fetchedUrl, 'https://example.test/sitemap.xml');
  assert.match(output, /example\.test\/live/);
});

test('--sitemap reports a fetch failure', async () => {
  const { exitCode, output } = await run(['--sitemap', 'https://example.test/sitemap.xml', '--title', 'T'], {
    fetchImpl: async () => ({ ok: false, status: 404, text: async () => '' }),
  });
  assert.equal(exitCode, 1);
  assert.match(output, /HTTP 404/);
});

test('--urls-file builds from the sectioned mini-format', async () => {
  const { exitCode, output } = await run(['--urls-file', './urls.txt', '--title', 'T', '--summary', 'S'], {
    readFileImpl: async () => '## Docs\nhttps://x.test/a | A page | A note\n',
  });
  assert.equal(exitCode, 0);
  assert.match(output, /> S/);
  assert.match(output, /\[A page\]\(https:\/\/x\.test\/a\): A note/);
});

test('build mode exits 1 when there are no links to write', async () => {
  const { exitCode, output } = await run(['--urls-file', './urls.txt', '--title', 'T'], {
    readFileImpl: async () => '## Docs\n',
  });
  assert.equal(exitCode, 1);
  assert.match(output, /No links found/);
});

test('--out writes the file and reports a summary instead of printing the file', async () => {
  let written = null;
  const { exitCode, output } = await run(['--urls-file', './urls.txt', '--title', 'T', '--out', 'llms.txt'], {
    readFileImpl: async () => '## Docs\nhttps://x.test/a | A\n',
    writeFileImpl: async (p, content) => {
      written = { path: p, content };
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(written.path, 'llms.txt');
  assert.match(written.content, /^# T/);
  assert.match(output, /Wrote llms\.txt/);
});

test('--check validates an existing file and exits 1 on structural errors', async () => {
  const { exitCode, output } = await run(['--check', './llms.txt'], {
    readFileImpl: async () => '## Docs\n- [a](https://x.test/a)\n',
  });
  assert.equal(exitCode, 1);
  assert.match(output, /Has structural errors/);
  assert.match(output, /error:/);
});

test('--check exits 0 on a valid file, still surfacing warnings', async () => {
  const { exitCode, output } = await run(['--check', './llms.txt'], {
    readFileImpl: async () => '# T\n\n## Docs\n- [a](/relative)\n',
  });
  assert.equal(exitCode, 0);
  assert.match(output, /Structurally valid/);
  assert.match(output, /warning:/);
});
