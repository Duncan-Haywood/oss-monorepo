import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');

test('the page asks for a name on Other space and escapes it in the split', () => {
  assert.match(page, /from '\.\/area-name\.mjs'/);
  assert.match(page, /class="a-name"/);
  assert.match(page, /Name this space/);
  assert.match(page, /syncOtherState/);
  assert.match(page, /escapeHtml\(area\.name\)/);
  assert.match(page, /nameForRow\(/);
  assert.match(page, /space_named/);
  assert.match(page, /e\.g\. Server room, gym, loading dock/);
});
