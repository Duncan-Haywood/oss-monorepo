import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('the static page contains its executable module and queried controls', () => {
  assert.match(page, /<script type="module">/);
  assert.match(page, /import \{ calculateBid, SERVICE_PRESETS \} from '\.\/calc\.mjs';/);
  assert.match(page, /import \{ recordUsage \} from '\.\/usage\.mjs';/);

  for (const id of [
    'services',
    'addService',
    'oneWayMinutes',
    'frequency',
    'proposedRecurring',
    'waiveInitial',
    'copySummary',
    'usageOptOut',
    'initialPrice',
    'recurringPrice',
    'verdict',
  ]) {
    assert.match(page, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test('the page exposes the safety and privacy copy to users', () => {
  assert.match(page, /<strong>No warranty\.<\/strong>/);
  assert.match(page, /Nothing leaves your browser/);
  assert.match(page, /Do not keep anonymous local usage counts/);
});
