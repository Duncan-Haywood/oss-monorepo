import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('landing copy names the 5% vs 10% bid decision', () => {
  assert.match(page, /5% vs 10% Bid Markup/);
  assert.match(page, /What bid keeps the same cash coming in\?/);
  assert.match(page, /compareRetainageRates/);
  assert.match(page, /typicalHoldDays/);
  assert.match(page, /rate-compared/);
});

test('page keeps the disclaimer, privacy off-switch, and optional sponsors', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /Count anonymous local usage events/);
  assert.match(page, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(page, /no uptime or availability SLA/);
});
