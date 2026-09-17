import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index links to the how-to docs page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="why-npm-audit-does-not-catch-a-malicious-install-script\.html"/,
    'index must link the secondary docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', async () => {
  const page = await readFile(new URL('./why-npm-audit-does-not-catch-a-malicious-install-script.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/);
});

test('both pages carry the no-warranty clause', async () => {
  for (const file of ['index.html', 'why-npm-audit-does-not-catch-a-malicious-install-script.html']) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test('index carries the sponsor link', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('index states nothing is uploaded (privacy line)', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /never uploaded|never leaves your device/i);
});

// Closest sibling: both are free, deterministic, paste-a-snapshot-and-diff
// dependency-tree checkers, just for a different signal (install-time
// scripts vs. declared licenses). Without this, this venture ships as a
// crawlable orphan -- no other tool links to it.
test('index links one hop to the license-drift-check sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/license-drift-check\/"/,
    'index must link ../license-drift-check/ so crawlers reach this tool in one hop from a sibling',
  );
});

// Reciprocal of vscode-extension-drift-check's own sibling-link test: keeps
// that venture from shipping as a crawlable orphan with no inbound link.
test('index links one hop to the vscode-extension-drift-check sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/vscode-extension-drift-check\/"/,
    'index must link ../vscode-extension-drift-check/ so crawlers reach that tool in one hop',
  );
});
