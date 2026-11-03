import test from 'node:test';
import assert from 'node:assert/strict';
import { servedPath } from './served-path.mjs';

test('servedPath drops index.html and the .html extension, as Cloudflare serves them', () => {
  assert.equal(servedPath('index.html'), '');
  assert.equal(servedPath('tool/index.html'), 'tool/');
  assert.equal(servedPath('tool/nested/index.html'), 'tool/nested/');
  assert.equal(servedPath('tool/compare.html'), 'tool/compare');
  assert.equal(servedPath('tool/nested/page.html'), 'tool/nested/page');
  assert.equal(servedPath('tool/data.json'), 'tool/data.json');
});
