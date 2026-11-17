import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { addResearchSlug, linesFor, readmeHasRow, researchSlugs } from './register-tool.mjs';

const LINE = "export const RESEARCH_ALGORITHM_SLUGS = ['a-tool', 'b-tool'];";

test('reads the research slug list from build.mjs source', () => {
  assert.deepEqual(researchSlugs(`x\n${LINE}\ny`), ['a-tool', 'b-tool']);
  assert.equal(researchSlugs('no list here'), null);
});

test('appends a new slug once and leaves a listed one alone', () => {
  const once = addResearchSlug(`x\n${LINE}\ny`, 'c-tool');
  assert.match(once, /\['a-tool', 'b-tool', 'c-tool'\];/);
  assert.equal(addResearchSlug(once, 'c-tool'), once);
  assert.match(addResearchSlug('export const RESEARCH_ALGORITHM_SLUGS = [];', 'c-tool'), /= \['c-tool'\];/);
});

test('the real build.mjs still has the one-line list this edits', () => {
  const slugs = researchSlugs(fs.readFileSync(new URL('./build.mjs', import.meta.url), 'utf8'));
  assert.ok(slugs && slugs.includes('changepoint-detector'), 'RESEARCH_ALGORITHM_SLUGS must stay a single line');
});

test('a README row counts only when it links the venture folder', () => {
  assert.ok(readmeHasRow('| [`x`](../../ventures/x/) | P | Q |', 'x'));
  assert.ok(!readmeHasRow('| [`x-two`](../../ventures/x-two/) |', 'x'));
});

test("keeps only checker lines naming this venture's folder", () => {
  const out = 'ventures/foo/calc.mjs: bad\nventures/foo-bar/calc.mjs: bad\nsummary';
  assert.deepEqual(linesFor(out, 'foo'), ['ventures/foo/calc.mjs: bad']);
});
