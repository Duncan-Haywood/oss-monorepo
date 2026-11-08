import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { inlineBytes, measure, quantile, format } from './page-weight.mjs';

test('inlineBytes counts inline script and style blocks', () => {
  const html = '<style>a{}</style><p>x</p><script src="a.js"></script><script>1</script>';
  const r = inlineBytes(html);
  assert.equal(r.style, '<style>a{}</style>'.length);
  assert.equal(r.script, '<script src="a.js"></script>'.length + '<script>1</script>'.length);
});

test('quantile picks from a sorted list and handles empty input', () => {
  assert.equal(quantile([], 0.5), 0);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 3);
  assert.equal(quantile([1, 2, 3, 4], 0.99), 4);
});

test('measure ranks pages, counts shard files and the budget', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pw-'));
  await fs.mkdir(path.join(dir, 'writing'), { recursive: true });
  await fs.mkdir(path.join(dir, 'tool'), { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), 'x'.repeat(100));
  await fs.writeFile(path.join(dir, 'writing', 'index.html'), 'y'.repeat(5000));
  await fs.writeFile(path.join(dir, 'writing', 'card.png'), 'png');
  await fs.writeFile(path.join(dir, 'tool', 'index.html'), 'z'.repeat(10));
  const r = await measure(dir, { budget: 1000 });
  assert.equal(r.files, 4);
  assert.equal(r.shard_files, 2);
  assert.equal(r.html_pages, 3);
  assert.equal(r.over_budget, 1);
  assert.equal(r.heaviest[0].path, 'writing/index.html');
  assert.ok(r.heaviest[0].gzip < r.heaviest[0].bytes);
  assert.match(format(r), /1 page\(s\) over the 1 kB budget/);
  await fs.rm(dir, { recursive: true, force: true });
});
