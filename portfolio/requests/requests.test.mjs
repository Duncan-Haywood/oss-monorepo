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
  const base = { id: 'R-0009', title: 't', ask: 'a', source: 'issue', link: 'https://github.com/x/y/issues/1', received: '2026-10-30', updated: '2026-10-30', status: 'received', screen: { verdict: 'clear', version: 1, rules: [] } };
  assert.deepEqual(validateRequests({ requests: [base] }), []);
  const bad = (over) => validateRequests({ requests: [{ ...base, ...over }] });
  assert.ok(bad({ status: 'done' }).length);
  assert.ok(bad({ link: '' }).length, 'issue requests link their issue');
  assert.ok(bad({ status: 'declined' }).length, 'declines give a reason');
  assert.ok(bad({ status: 'shipped' }).length, 'shipped links something');
  assert.ok(bad({ updated: '2026-10-01' }).length);
  assert.ok(bad({ feedback_id: '3' }).length, 'feedback_id is numeric');
  assert.deepEqual(bad({ source: 'form', link: '', feedback_id: 3 }), []);
  assert.ok(validateRequests({ requests: [base, base] }).some((p) => /duplicate/.test(p)));
  assert.ok(bad({ kind: 'essay' }).length, 'kind is one of KINDS');
  assert.deepEqual(bad({ kind: 'research' }), []);
});

test('a request from outside is screened, and a held one cannot be built until the owner clears it', () => {
  const base = { id: 'R-0009', title: 't', ask: 'a', source: 'form', feedback_id: 4, received: '2026-11-02', updated: '2026-11-02', status: 'received' };
  const v = (over) => validateRequests({ requests: [{ ...base, ...over }] });
  assert.ok(v({}).some((p) => /screen/.test(p)), 'no screen, no entry');
  const hold = { verdict: 'hold', version: 1, rules: ['override'] };
  assert.deepEqual(v({ screen: hold }), [], 'a hold may sit in received');
  assert.deepEqual(v({ screen: hold, status: 'declined', reason: 'an injection attempt' }), []);
  assert.ok(v({ screen: hold, status: 'accepted' }).some((p) => /held/.test(p)));
  assert.deepEqual(v({ screen: { ...hold, cleared: 'owner, 2026-11-03: a real ask, the phrase was innocent' }, status: 'accepted' }), []);
  assert.deepEqual(v({ source: 'owner', status: 'building' }), [], 'the owner\'s own asks need no screen');
});
