import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');

test('the page ships a day-porter section and the search phrases contractors type', () => {
  assert.match(page, /id="addShift"/);
  assert.match(page, /id="shifts"/);
  assert.match(page, /id="shiftHours"/);
  assert.match(page, /How do I price a day porter on a janitorial contract/);
  assert.match(page, /FAQPage/);
  assert.match(page, /SHIFT_ROLE_PRESETS/);
  assert.match(page, /readShifts/);
});
