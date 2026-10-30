import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProductLlmsTxt, withLlmsAsOf } from './build.mjs';

test('generated product llms.txt carries title, description, links and the caveat', () => {
  const t = renderProductLlmsTxt({ slug: 'x-tool', title: 'X  Tool', description: 'short', fullDescription: 'A longer\n description.' }, 'https://h/o/');
  assert.match(t, /^# X Tool\n\n> A longer description\.\n/);
  assert.match(t, /\(https:\/\/h\/o\/x-tool\/\)/);
  assert.match(t, /ventures\/x-tool\)/);
  assert.match(t, /not legal, tax, financial or professional advice/);
});

test('generated product llms.txt states when its source last changed, only when known', () => {
  const p = { slug: 'x-tool', title: 'X', description: 'd' };
  assert.match(renderProductLlmsTxt({ ...p, updated: '2026-10-27T09:00:00+00:00' }, 'https://h/'), /Source last changed: 2026-10-27 /);
  assert.doesNotMatch(renderProductLlmsTxt(p, 'https://h/'), /last changed/);
  assert.doesNotMatch(renderProductLlmsTxt({ ...p, updated: 'today' }, 'https://h/'), /last changed/);
});

test('a hand-written llms.txt gets the git date appended unless it already states one', () => {
  const d = '2026-10-20T09:00:00+00:00';
  assert.match(withLlmsAsOf('# T\n\nbody\n', d), /body\n\nSource last changed: 2026-10-20 \(from/);
  assert.equal(withLlmsAsOf('# T\nLast updated: 2026-09-01\n', d), '# T\nLast updated: 2026-09-01\n');
  assert.equal(withLlmsAsOf('# T\n', undefined), '# T\n');
});

test('a shallow build that cannot see the change states an upper bound, and a real date wins over it', () => {
  const start = '2026-10-15T08:00:00+00:00';
  assert.match(withLlmsAsOf('# T\n', undefined, start), /Source last changed: on or before 2026-10-15 \(older than/);
  assert.match(withLlmsAsOf('# T\n', '2026-10-20T09:00:00+00:00', start), /Source last changed: 2026-10-20 \(from/);
  assert.equal(withLlmsAsOf('# T\n', undefined, null), '# T\n');
});

test('check flags an undated llms.txt only where dates are available', async () => {
  const { llmsTxtMissingDate } = await import('./check.mjs');
  const dated = '# T\n\nSource last changed: 2026-10-20 (from git).\n';
  assert.deepEqual(llmsTxtMissingDate(new Map([['a', dated], ['b', '# B\n']])), ['b']);
  assert.deepEqual(llmsTxtMissingDate(new Map([['a', '# A\n'], ['b', '# B\n']])), []);
  assert.deepEqual(llmsTxtMissingDate(new Map()), []);
});
