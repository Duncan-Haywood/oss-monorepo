import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, csvCell } from './extract.mjs';
import { outline, toOutlineMarkdown, coverage, coverageToCsv, keyTerms } from './shred.mjs';
import { SAMPLE } from './sample.mjs';

const result = extract(SAMPLE);

test('outline groups every requirement exactly once', () => {
  const vols = outline(result);
  const ids = vols.flatMap((v) => v.ids);
  assert.equal(ids.length, result.requirements.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(vols.length >= 2);
});

test('outline markdown keeps every id, the source sentence and a TODO per row', () => {
  const md = toOutlineMarkdown(result);
  for (const r of result.requirements) assert.ok(md.includes(r.id), r.id);
  assert.equal((md.match(/Compliance statement:\*\* _TODO_/g) || []).length, result.requirements.length);
});

test('a draft that echoes the requirements covers them; an empty-ish draft does not', () => {
  const full = coverage(result, result.requirements.map((r) => r.text).join('\n'));
  assert.equal(full.summary.missing, 0);
  assert.equal(full.mandatoryGaps.length, 0);
  const none = coverage(result, 'We are a great company with a long history and wonderful people.');
  assert.equal(none.summary.addressed, 0);
  assert.ok(none.mandatoryGaps.length > 0);
});

test('citing a REQ id counts as addressed', () => {
  const r = result.requirements[0];
  const cov = coverage(result, `See ${r.id}.`);
  assert.equal(cov.rows.find((x) => x.id === r.id).status, 'addressed');
});

test('coverage CSV has one line per requirement plus a header', () => {
  const csv = coverageToCsv(coverage(result, 'nothing relevant here'), csvCell);
  assert.equal(csv.trim().split('\r\n').length, result.requirements.length + 1);
  assert.match(csv, /^ID,Section,Strength,Status,Score/);
});

test('keyTerms drops stop words and short tokens', () => {
  const t = keyTerms('The Contractor shall provide encrypted backups of all data.');
  assert.ok(t.has('encrypt') || t.has('encrypted'));
  assert.ok(!t.has('shall') && !t.has('the'));
});
