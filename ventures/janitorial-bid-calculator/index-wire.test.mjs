import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');

test('the page asks for an optional proposal name on every space and escapes it', () => {
  assert.match(page, /from '\.\/area-name\.mjs'/);
  assert.match(page, /class="a-name"/);
  assert.match(page, /Name this space/);
  assert.match(page, /optional, e\.g\. 2nd floor restrooms/);
  assert.match(page, /Second-floor restrooms/);
  assert.match(page, /syncOtherState/);
  assert.match(page, /escapeHtml\((area|item)\.name\)/);
  assert.match(page, /nameForRow\(/);
  assert.match(page, /space_named/);
  assert.match(page, /e\.g\. Server room, gym, loading dock/);
});
