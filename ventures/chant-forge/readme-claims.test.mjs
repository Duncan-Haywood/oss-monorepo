// Quality audit 2026-11-19 (round 77): the README said stage 3 (Arrange) was
// "Not built" while genre.mjs, --genre and --sections shipped, and quoted a
// stale test count. These keep the pipeline summary in step with the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const here = (f) => new URL(`./${f}`, import.meta.url);
const readme = readFileSync(here('README.md'), 'utf8');

test('README stage 3 does not call the shipped genre arranger unbuilt', () => {
  const stage3 = readme.match(/^3\. \*\*Arrange:\*\*[\s\S]*?(?=^4\. )/m)?.[0] ?? '';
  assert.ok(stage3, 'stage 3 line present');
  if (existsSync(here('genre.mjs'))) assert.doesNotMatch(stage3, /Not built\./);
});

test('README test count for chant-forge.test.mjs matches the file', () => {
  const n = (readFileSync(here('chant-forge.test.mjs'), 'utf8').match(/^test\(/gm) || []).length;
  const m = readme.match(/chant-forge\.test\.mjs` \((\d+) tests/);
  assert.ok(m, 'README states a count');
  assert.equal(Number(m[1]), n);
});
