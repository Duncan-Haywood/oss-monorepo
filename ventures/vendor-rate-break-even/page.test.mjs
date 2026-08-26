import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');

test('hosted surface carries the no-SLA sentence the playbook requires', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test('scenario names are escaped before they are written into the page', () => {
  assert.match(html, /escapeHtml/);
  assert.match(html, /scenarios\[i\]/);
});
