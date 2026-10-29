import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  percentiles, minMax, logScale, normalise, computeDimensions, composite, scoreAreas, renormalise,
  rankSensitivity, explainRow, availableBands, dimensionComponents, MODES, AGE_BANDS, DIMENSIONS, PROXY_DIMENSION, assignRanks,
} from './score.mjs';

// Hand-made observations: all numbers here are synthetic test inputs.
const O = (e, flags = []) => ({ e, moe: null, flags });
const OBS = {
  a: { women_20_24: O(100), never_married_women_20_24: O(80), catholic_adherents: O(1000), catholic_congregations: O(3), public_venues: O(0) },
  b: { women_20_24: O(1000), never_married_women_20_24: O(700), catholic_adherents: O(5000), catholic_congregations: O(10), public_venues: O(2) },
  c: { women_20_24: O(100000), never_married_women_20_24: O(70000), catholic_adherents: O(200000), catholic_congregations: O(60), public_venues: O(4) },
  d: { women_20_24: O(500), never_married_women_20_24: O(400), catholic_adherents: O(null, ['not_published']), catholic_congregations: O(null, ['not_published']), public_venues: O(1) },
};
const IDS = ['a', 'b', 'c', 'd'];

test('percentiles: midrank 0–100, ties share, single value 50, null stays null', () => {
  assert.deepEqual(percentiles([10, 20, 30]), [0, 50, 100]);
  assert.deepEqual(percentiles([5, 5, 10]), [25, 25, 100]);
  assert.deepEqual(percentiles([7]), [50]);
  assert.deepEqual(percentiles([1, null, 3]), [0, null, 100]);
});

test('min–max: equal values score 50, nulls never become 0', () => {
  assert.deepEqual(minMax([2, 2]), [50, 50]);
  assert.deepEqual(minMax([0, 5, 10, null]), [0, 50, 100, null]);
  assert.deepEqual(minMax([null, null]), [null, null]);
});

test('log scale damps a huge county: middle county scores far above its linear share', () => {
  const raw = [100, 1000, 100000];
  const linear = normalise(raw, { scale: 'linear', normalization: 'log_minmax' });
  const logged = normalise(raw, { scale: 'log', normalization: 'log_minmax' });
  assert.ok(linear[1] < 1, `linear middle ${linear[1]}`);
  assert.ok(logged[1] > 30 && logged[1] < 40, `log middle ${logged[1]}`);
  assert.equal(logScale(0), 0);
  assert.ok(Math.abs(logScale(9) - 1) < 1e-12);
});

test('percentile normalisation ignores scale: rank order only', () => {
  const p = normalise([100, 1000, 100000], { scale: 'log', normalization: 'percentile' });
  assert.deepEqual(p, [0, 50, 100]);
});

test('higher_is "less" inverts a component', () => {
  const metricsById = new Map([['public_venues', { metric_id: 'public_venues', higher_is: 'less' }]]);
  const c = computeDimensions({ ids: ['a', 'c'], observations: OBS, metricsById });
  assert.equal(c.rows.find((r) => r.id === 'c').dims.meeting_access.score, 0);
});

test('missing dimension is null, never zero, and weights re-normalise over the rest', () => {
  const { rows } = scoreAreas({ ids: IDS, observations: OBS, mode: 'volume', weights: { demographic_capacity: 0.5, catholic_ecosystem: 0.2, meeting_access: 0.3, values_evidence: 0 } });
  const d = rows.find((r) => r.id === 'd');
  assert.equal(d.dims.catholic_ecosystem.score, null);
  assert.ok(!('catholic_ecosystem' in d.contributions));
  const w = d.weightsUsed;
  assert.ok(Math.abs(w.demographic_capacity - 0.625) < 1e-9);
  assert.ok(Math.abs(w.meeting_access - 0.375) < 1e-9);
  assert.ok(Math.abs(Object.values(w).reduce((s, x) => s + x, 0) - 1) < 1e-9);
  // The index equals the weighted mean of the dimensions it has.
  const expect = w.demographic_capacity * d.dims.demographic_capacity.score + w.meeting_access * d.dims.meeting_access.score;
  assert.ok(Math.abs(d.index - expect) < 1e-9);
  assert.ok(d.index > 0, 'a missing dimension did not drag the index to zero');
});

test('coverage counts scored dimensions among weighted ones', () => {
  const { rows } = scoreAreas({ ids: IDS, observations: OBS, mode: 'volume', weights: MODES.volume.weights });
  const d = rows.find((r) => r.id === 'd');
  const c = rows.find((r) => r.id === 'c');
  assert.deepEqual([d.coverage.scored, d.coverage.considered], [2, 3]);
  assert.deepEqual(d.coverage.missing, ['catholic_ecosystem']);
  assert.deepEqual([c.coverage.scored, c.coverage.considered], [3, 3]);
});

test('minimum dimensions withholds the index rather than inventing one', () => {
  const { rows } = scoreAreas({ ids: IDS, observations: OBS, mode: 'volume', weights: MODES.volume.weights, minDims: 3 });
  const d = rows.find((r) => r.id === 'd');
  assert.equal(d.index, null);
  assert.equal(d.rank, null);
  assert.equal(d.status, 'insufficient_coverage');
  assert.equal(rows[rows.length - 1].id, 'd', 'unranked areas sort last');
  assert.match(explainRow(d).join(' '), /only 2 of 3/);
});

test('values_evidence is null at county level when no survey metrics exist', () => {
  const r = scoreAreas({ ids: IDS, observations: OBS, mode: 'concentrated', weights: MODES.concentrated.weights });
  assert.ok(r.rows.every((x) => x.dims.values_evidence.score === null));
  assert.ok(r.notes.includes('values_evidence_unavailable'));
  assert.ok(r.rows.every((x) => !('values_evidence' in x.weightsUsed)));
});

test('values_evidence scores when survey-estimate metrics marked for it exist', () => {
  const metricsById = new Map([['values_ideal4', { metric_id: 'values_ideal4', class: 'survey_estimate', dimension: 'values_evidence' }]]);
  const obs = { a: { values_ideal4: O(20) }, b: { values_ideal4: O(40) } };
  const r = scoreAreas({ ids: ['a', 'b'], observations: obs, metricsById, mode: 'concentrated', weights: { values_evidence: 1 }, minDims: 1 });
  assert.equal(r.rows[0].id, 'b');
  assert.equal(r.rows[0].dims.values_evidence.score, 100);
  assert.ok(!r.notes.includes('values_evidence_unavailable'));
});

test('the two modes use different components: counts for volume, densities for concentrated', () => {
  const v = dimensionComponents({ band: '20_24', mode: 'volume' });
  const c = dimensionComponents({ band: '20_24', mode: 'concentrated' });
  assert.deepEqual(v.catholic_ecosystem.map((x) => x.metric), ['catholic_adherents', 'catholic_congregations']);
  assert.deepEqual(c.catholic_ecosystem.map((x) => x.metric), ['catholic_adherents_per_1000', 'catholic_congregations_per_100k']);
  assert.ok(v.demographic_capacity.some((x) => x.metric === 'women_20_24'));
  assert.ok(c.demographic_capacity.some((x) => x.metric === 'never_married_share_women_20_29'));
  assert.ok(!dimensionComponents({ band: '18_19', mode: 'concentrated' }).demographic_capacity.some((x) => x.metric === 'never_married_share_women_20_29'), 'no 20–29 share for an 18–19 band');
  assert.ok(MODES.volume.weights.values_evidence === 0 && MODES.concentrated.weights.values_evidence > 0);
});

test('volume mode ranks the biggest county first; per-capita can reorder in concentrated mode', () => {
  const obs = {
    big: { women_20_24: O(50000), never_married_women_20_24: O(30000), catholic_adherents: O(90000), catholic_congregations: O(40), catholic_adherents_per_1000: O(90), catholic_congregations_per_100k: O(4), never_married_share_women_20_29: O(50), public_venues: O(1) },
    small: { women_20_24: O(800), never_married_women_20_24: O(700), catholic_adherents: O(9000), catholic_congregations: O(9), catholic_adherents_per_1000: O(450), catholic_congregations_per_100k: O(45), never_married_share_women_20_29: O(80), public_venues: O(1) },
  };
  const vol = scoreAreas({ ids: ['big', 'small'], observations: obs, mode: 'volume', weights: MODES.volume.weights });
  const con = scoreAreas({ ids: ['big', 'small'], observations: obs, mode: 'concentrated', weights: MODES.concentrated.weights });
  assert.equal(vol.rows[0].id, 'big');
  assert.equal(con.rows[0].id, 'small');
});

test('unvalidated proxies are excluded by default and labelled when on', () => {
  const metricsById = new Map([['rep_pres_share_2024', { metric_id: 'rep_pres_share_2024', class: 'unvalidated_hypothesis' }]]);
  const obs = { a: { ...OBS.a, rep_pres_share_2024: O(30) }, b: { ...OBS.b, rep_pres_share_2024: O(70) } };
  const off = computeDimensions({ ids: ['a', 'b'], observations: obs, metricsById });
  assert.ok(!off.dims.includes(PROXY_DIMENSION));
  const on = computeDimensions({ ids: ['a', 'b'], observations: obs, metricsById, includeProxies: true });
  assert.ok(on.dims.includes(PROXY_DIMENSION));
  assert.equal(on.rows.find((r) => r.id === 'b').dims[PROXY_DIMENSION].score, 100);
});

test('renormalise: zero total gives null, not a divide-by-zero', () => {
  assert.equal(renormalise({ a: 0, b: 0 }, ['a', 'b']), null);
  assert.deepEqual(renormalise({ a: 1, b: 3 }, ['a', 'b']), { a: 0.25, b: 0.75 });
  assert.deepEqual(renormalise({ a: -1, b: 1 }, ['a', 'b']), { a: 0, b: 1 });
});

test('competition ranking handles ties', () => {
  const r = assignRanks([{ id: 'x', index: 50 }, { id: 'y', index: 70 }, { id: 'z', index: 50 }, { id: 'w', index: null }]);
  assert.deepEqual(r.map((x) => [x.id, x.rank]), [['y', 1], ['x', 2], ['z', 2], ['w', null]]);
});

test('rank sensitivity: stable when one dimension dominates, moving when weights are close', () => {
  const computed = computeDimensions({ ids: IDS, observations: OBS });
  const sens = rankSensitivity(computed, { weights: MODES.volume.weights, delta: 0.1 });
  for (const id of IDS) {
    const s = sens.get(id);
    assert.ok(s.min <= s.base && s.base <= s.max, `${id} range brackets the base`);
    assert.ok(s.perturbations.length > 0);
  }
  // Two areas that trade places depending on which dimension weighs more.
  const obs = { p: { women_20_24: O(9000), never_married_women_20_24: O(8000), public_venues: O(0) }, q: { women_20_24: O(100), never_married_women_20_24: O(90), public_venues: O(5) } };
  const c2 = computeDimensions({ ids: ['p', 'q'], observations: obs });
  const s2 = rankSensitivity(c2, { weights: { demographic_capacity: 0.5, meeting_access: 0.5 }, minDims: 1, delta: 0.2 });
  assert.equal(s2.get('p').min, 1);
  assert.equal(s2.get('p').max, 2);
});

test('explanations name dimensions, weights and the relative scale', () => {
  const { rows } = scoreAreas({ ids: IDS, observations: OBS, mode: 'volume', weights: MODES.volume.weights });
  const d = rows.find((r) => r.id === 'd');
  const text = explainRow(d, (x) => x.toUpperCase(), 4).join('\n');
  assert.match(text, /Demographic capacity \d+ × weight 63%/);
  assert.match(text, /WOMEN_20_24 scores/);
  assert.match(text, /Catholic ecosystem: no data .*not counted as zero/);
  assert.match(text, /relative to the 4 areas/);
});

test('age bands are adult only and limited to what the data publish', () => {
  assert.ok(AGE_BANDS.every((b) => Number(b.id.split('_')[0]) >= 18));
  assert.deepEqual(availableBands(['women_20_24', 'women_30_34', 'total_population']).map((b) => b.id), ['20_24', '30_34']);
  assert.deepEqual(availableBands([]), []);
});

test('fixture ranking: every county scored, missing religion data re-normalised, nothing NaN', () => {
  const f = JSON.parse(readFileSync(new URL('./test/fixtures/data/us/county_observations.json', import.meta.url), 'utf8'));
  assert.equal(f.synthetic, true);
  const ids = Object.keys(f.observations).filter((id) => id.startsWith('08'));
  const { rows } = scoreAreas({ ids, observations: f.observations, mode: 'volume', weights: MODES.volume.weights });
  assert.equal(rows.length, ids.length);
  for (const r of rows) {
    assert.ok(r.index === null || (r.index >= 0 && r.index <= 100 && !Number.isNaN(r.index)));
    for (const d of DIMENSIONS) assert.ok(r.dims[d].score === null || Number.isFinite(r.dims[d].score));
  }
  const noReligion = rows.find((r) => r.id === '08023');
  assert.equal(noReligion.dims.catholic_ecosystem.score, null);
  assert.ok(noReligion.index !== null);
});
