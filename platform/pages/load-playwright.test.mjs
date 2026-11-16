// Tests for load-playwright.mjs: the loader every browser script and test in
// platform/pages uses, so an ESM import that ignores NODE_PATH no longer turns
// a session's browser tests into silent skips.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPlaywright } from './load-playwright.mjs';

function fakeModule(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-fake-'));
  const file = path.join(dir, 'index.cjs');
  fs.writeFileSync(file, body);
  return file;
}

test('PLAYWRIGHT naming a CommonJS entry file: exports unwrapped from .default', async () => {
  const file = fakeModule('module.exports = { chromium: { name: "fake" } };');
  const pw = await loadPlaywright({ PLAYWRIGHT: file });
  assert.equal(pw.chromium.name, 'fake');
});

test('PLAYWRIGHT set but wrong: null with the path in the reason, no silent fallback', async () => {
  const pw = await loadPlaywright({ PLAYWRIGHT: '/nonexistent/playwright/index.js' }, { optPath: '/nonexistent' });
  assert.equal(pw, null);
  assert.match(loadPlaywright.lastError, /^PLAYWRIGHT=\/nonexistent\/playwright\/index\.js: /);
});

test('a module with no chromium export is refused', async () => {
  const file = fakeModule('module.exports = { firefox: {} };');
  assert.equal(await loadPlaywright({ PLAYWRIGHT: file }), null);
  assert.match(loadPlaywright.lastError, /exports no chromium/);
});

test('unset PLAYWRIGHT falls back to the optPath install', async () => {
  // Only meaningful where neither the bare specifier nor NODE_PATH resolves;
  // elsewhere the earlier attempts win, which is also a pass.
  const file = fakeModule('module.exports = { chromium: { name: "opt" } };');
  const pw = await loadPlaywright({}, { optPath: file });
  assert.ok(pw?.chromium, loadPlaywright.lastError);
});
