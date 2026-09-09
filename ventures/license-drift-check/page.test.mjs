import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index links to the how-to docs page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="how-a-dependency-license-change-reaches-your-lockfile\.html"/,
    'index must link the secondary docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', async () => {
  const page = await readFile(new URL('./how-a-dependency-license-change-reaches-your-lockfile.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/);
});

test('both pages carry the no-warranty clause', async () => {
  for (const file of ['index.html', 'how-a-dependency-license-change-reaches-your-lockfile.html']) {
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

// Closest sibling per platform/pages/siblings.mjs: both are free,
// deterministic, paste-and-diff CI checkers, just for a different surface
// (dependency licenses vs. workflow YAML). Without this, this venture ships
// as a crawlable orphan -- no other tool links to it.
test('index links one hop to the actions-injection-check sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/actions-injection-check\/"/,
    'index must link ../actions-injection-check/ so crawlers reach this tool in one hop from a sibling',
  );
});

test('index links to the vs-fossa comparison page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="vs-fossa\.html"/,
    'index must link the comparison page so crawlers can reach it',
  );
});

test('vs-fossa page links back to the tool and carries required clauses', async () => {
  const page = await readFile(new URL('./vs-fossa.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/, 'must link back to the tool');
  assert.match(page, /no warranty/i, 'missing the no-warranty clause');
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/, 'missing the sponsor link');
  assert.match(page, /not affiliated with, endorsed by, or sponsored by FOSSA/i, 'missing the non-affiliation disclaimer');
});
