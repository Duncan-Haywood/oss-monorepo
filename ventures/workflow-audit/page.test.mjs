import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const action = await readFile(new URL('./action.yml', import.meta.url), 'utf8');

test('the page carries the portfolio disclaimers and local-only claims', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /makes no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
  assert.match(index, /not a security audit/i);
});

test('the page never claims a clean report means safe', () => {
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const m of prose.matchAll(/\b(?:is|are)\s+(?:safe|secure)\b/gi)) {
    const before = prose.slice(Math.max(0, m.index - 60), m.index);
    assert.ok(/\b(?:not|never|no)\b/i.test(before) || prose.slice(m.index + m[0].length).trimStart().startsWith('?'), m[0]);
  }
});

test('FAQPage JSON-LD questions match the visible FAQ headings', () => {
  const ld = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/)[0];
  const headings = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].trim());
  const asked = [...ld.matchAll(/"name":"([^"]+\?)"/g)].map((m) => m[1]);
  assert.ok(asked.length >= 4);
  for (const q of asked) assert.ok(headings.includes(q), q);
});

test('action.yml is a composite action with the documented inputs', () => {
  assert.match(action, /using: composite/);
  for (const k of ['path:', 'fail-on:', 'sarif-file:']) assert.ok(action.includes(k), k);
  // Inputs reach the shell through env, never interpolated into the script.
  const run = action.slice(action.indexOf('run: |'));
  assert.doesNotMatch(run, /\$\{\{\s*inputs\./);
});

test('links the standalone runtime-deprecation check', () => {
  assert.match(index, /href="\.\.\/actions-runtime-deprecation-check\/"/);
});
