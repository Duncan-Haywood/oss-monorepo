import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the browser page contains the live calculation journey', () => {
  assert.match(html, /<script type="module">[\s\S]*import \{parseInputs, computeAll, followUpDraft\}/);
  for (const id of [
    'form', 'contractValue', 'retainagePct', 'paidToDate', 'daysOutstanding',
    'annualCarryingRatePct', 'output', 'retainage', 'unpaid', 'carrying',
    'total', 'draftSection', 'draft', 'copy', 'usage', 'errors',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test('the page exposes the disclaimer and privacy boundary as rendered markup', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /project data is never uploaded/);
  assert.match(html, /localStorage/);
});
