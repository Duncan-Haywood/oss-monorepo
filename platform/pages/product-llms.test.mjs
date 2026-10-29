import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProductLlmsTxt } from './build.mjs';

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
