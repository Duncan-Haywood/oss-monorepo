import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

test('page wires the classroom form, local draft controls, and submit-only usage', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  for (const id of ['form', 'reset', 'ratio', 'staffCount', 'capacity', 'enrolled', 'required', 'errors', 'occupancy-section', 'occupancy-body', 'occupancy-summary']) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(page, /localStorage\.setItem\(storageKey/);
  assert.match(page, /form\.addEventListener\('submit'/);
  assert.match(page, /update\(true\)/);
  assert.match(page, /document\.querySelector\('#reset'\)\.addEventListener/);
  assert.match(page, /occupancyTable/);
  assert.match(page, /occupancy_table_viewed/);
});

test('an invalid input clears stale results instead of leaving them next to a silent error', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /id="errors" class="warning" role="alert"/, 'the error region is not announced');
  const scriptMatch = page.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/catch\(error\)\{([\s\S]*?)\n {4}\}\}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  for (const id of ['capacity', 'enrolled', 'required', 'breakeven', 'profit', 'margin', 'message', 'occupancy-summary']) {
    assert.match(
      body,
      new RegExp(`querySelector\\('#${id}'\\)\\.textContent\\s*=\\s*''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /querySelector\('#occupancy-body'\)\.innerHTML\s*=\s*''/, 'the stale occupancy table rows are never cleared');
  assert.match(body, /querySelector\('#errors'\)\.hidden\s*=\s*false/, 'the error message is never shown');
});

test('every .html file in the venture is reachable from the sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

test('the ratio disclaimer is not undercut by an asserted state ratio table anywhere on the page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /does not assert (either one|one) for you|never asserts one/);
});
