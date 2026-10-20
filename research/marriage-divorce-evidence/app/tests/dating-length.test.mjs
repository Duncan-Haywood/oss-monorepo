// Dating length: derived from the form (years together minus years married), banded like the
// published estimate, and the shipped evidence is never marked as applied to a lens number.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { datingYears, datingBand } from '../dating-length.js';

const data = JSON.parse(readFileSync(new URL('../data/dating_length.json', import.meta.url)));

test('dating length from the form', () => {
  assert.equal(datingYears({ yearsTogether: 5, yearsMarried: 3 }), 2);
  assert.equal(datingYears({ yearsTogether: '3', yearsMarried: '0' }), 3);
  assert.equal(datingYears({ yearsTogether: 1, yearsMarried: 3 }), null);
  assert.equal(datingYears({ yearsTogether: '', yearsMarried: 0 }), null);
  assert.equal(datingBand(0.5), 'under 1 year');
  assert.equal(datingBand(1), '1-2 years');
  assert.equal(datingBand(2.9), '1-2 years');
  assert.equal(datingBand(3), '3+ years');
  assert.equal(datingBand(null), null);
});

test('shipped evidence: aggregates, verified literature, not applied', () => {
  assert.equal(data.grade.applied, false);
  assert.ok(data.literature.length === 2 && data.literature.every((r) => r.verified && r.usable_in_app === false));
  const core = data.heldout.find((r) => r.model === 'core');
  const plus = data.heldout.find((r) => r.model === 'core+dating');
  assert.ok(core && plus && Number.isFinite(plus.delta_gain_vs_constant_pct));
  assert.ok(plus.delta_gain_vs_constant_pct_lo <= plus.delta_gain_vs_constant_pct && plus.delta_gain_vs_constant_pct <= plus.delta_gain_vs_constant_pct_hi);
  const bands = data.hcmst_bands.filter((b) => b.band !== 'Unknown');
  assert.deepEqual(bands.map((b) => b.band), ['under 1 year', '1-2 years', '3+ years']);
  for (const b of bands) assert.ok(b.couples >= 30 && b.weighted_breakup_by_2017 > 0 && b.weighted_breakup_by_2017 < 1);
});
