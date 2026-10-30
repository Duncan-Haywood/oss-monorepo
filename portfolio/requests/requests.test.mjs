import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUESTS_FILE, validateRequests } from './requests.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the committed queue is valid and its projects exist', () => {
  const data = JSON.parse(readFileSync(REQUESTS_FILE, 'utf8'));
  assert.deepEqual(validateRequests(data, { exists: (p) => existsSync(path.join(ROOT, p)) }), []);
});

test('the validator catches what a hand edit gets wrong', () => {
  const base = { id: 'R-0009', title: 't', ask: 'a', source: 'issue', link: 'https://github.com/x/y/issues/1', received: '2026-10-30', updated: '2026-10-30', status: 'received' };
  assert.deepEqual(validateRequests({ requests: [base] }), []);
  const bad = (over) => validateRequests({ requests: [{ ...base, ...over }] });
  assert.ok(bad({ status: 'done' }).length);
  assert.ok(bad({ link: '' }).length, 'issue requests link their issue');
  assert.ok(bad({ status: 'declined' }).length, 'declines give a reason');
  assert.ok(bad({ status: 'shipped' }).length, 'shipped links something');
  assert.ok(bad({ updated: '2026-10-01' }).length);
  assert.ok(validateRequests({ requests: [base, base] }).some((p) => /duplicate/.test(p)));
});
