import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, buildHash, idList, sanitizePrefs, loadPrefs, savePrefs, DEFAULT_PREFS, PREFS_KEY, VIEWS } from './app.mjs';
import { record, readUsage, setUsageOptOut, usageOptedOut } from './usage.mjs';
import { parseIds, sortAreas, comparisonWarnings, intervalsOverlap } from './compare.mjs';
import { filterOptions, matchTables, nonEquivalent } from './surveys.mjs';
import { countryMetricIds, valueYear } from './intl.mjs';
import { traceSteps } from './explore.mjs';
import { candidateIds, effectiveSettings } from './rank.mjs';

function fakeStorage() {
  const store = new Map();
  return { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
}
beforeEach(() => {
  globalThis.localStorage = fakeStorage();
  globalThis.__usageOptOut = false;
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
});

test('router parses views and params; unknown views fall back to home', () => {
  assert.deepEqual(parseHash('#compare?ids=08013,08031'), { view: 'compare', params: { ids: '08013,08031' } });
  assert.deepEqual(parseHash('#explore'), { view: 'explore', params: {} });
  assert.deepEqual(parseHash(''), { view: 'home', params: {} });
  assert.deepEqual(parseHash('#nope?x=1'), { view: 'home', params: { x: '1' } });
  assert.deepEqual(parseHash('#/rank?st=08&w=50%2C20'), { view: 'rank', params: { st: '08', w: '50,20' } });
  assert.deepEqual(parseHash('#surveys?bad=%E0%A4%A'), { view: 'surveys', params: { bad: '%E0%A4%A' } }, 'malformed escapes do not throw');
  assert.ok(VIEWS.includes('communities') && VIEWS.includes('toolkit'));
});

test('buildHash round-trips, keeps commas readable and drops empties', () => {
  const h = buildHash('compare', { ids: '08013,08031', sort: null, dir: '' });
  assert.equal(h, '#compare?ids=08013,08031');
  assert.deepEqual(parseHash(buildHash('rank', { st: '08', band: '20_24', q: 'a&b=c' })).params, { st: '08', band: '20_24', q: 'a&b=c' });
  assert.equal(buildHash('home'), '#home');
});

test('idList cleans and caps ids', () => {
  assert.deepEqual(idList('08013, 08013,abc,m19740,,08031'), ['08013', 'm19740', '08031']);
  assert.equal(idList(Array.from({ length: 20 }, (_, i) => String(10000 + i)).join(',')).length, 10);
  assert.deepEqual(parseIds('08013,m19740,8013,m1974,08013'), ['08013', 'm19740']);
});

test('preferences: invalid values fall back; ages below 18 impossible; storage failures tolerated', () => {
  const p = sanitizePrefs({ band: '15_17', mode: 'top_wives', weights: { demographic_capacity: 7, meeting_access: 'x' }, minDims: 9, radius: -5, origin: '8013', includeProxies: 'yes' });
  assert.equal(p.band, DEFAULT_PREFS.band);
  assert.equal(p.mode, 'volume');
  assert.equal(p.weights.demographic_capacity, 1);
  assert.equal(p.weights.meeting_access, DEFAULT_PREFS.weights.meeting_access);
  assert.equal(p.minDims, 2);
  assert.equal(p.radius, null);
  assert.equal(p.origin, null);
  assert.equal(p.includeProxies, false);
  savePrefs({ ...p, band: '25_29' });
  assert.equal(loadPrefs().band, '25_29');
  localStorage.setItem(PREFS_KEY, '{not json');
  assert.equal(loadPrefs().band, DEFAULT_PREFS.band);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => savePrefs(p, throwing));
  assert.equal(loadPrefs(throwing).mode, 'volume');
});

test('usage: counts, opt-out clears and stops, Do Not Track honoured', () => {
  record('view_rank');
  record('view_rank');
  assert.equal(readUsage().view_rank, 2);
  assert.equal(localStorage.getItem('raphaels-map-usage') !== null, true, 'stored under the venture key');
  setUsageOptOut(true);
  assert.equal(usageOptedOut(), true);
  assert.deepEqual(readUsage(), {});
  record('view_rank');
  assert.deepEqual(readUsage(), {});
  setUsageOptOut(false);
  globalThis.navigator.doNotTrack = '1';
  record('view_rank');
  assert.deepEqual(readUsage(), {});
});

test('compare: missing values sort last both ways; warnings name gaps and mixed units', () => {
  const A = (id, name, kind, e, flags = []) => ({ id, name, kind, observations: { m: { e, moe: null, flags } } });
  const areas = [A('1', 'One', 'county', 5), A('2', 'Two', 'county', null), A('3', 'Three', 'metro', 9, ['vintage_mismatch'])];
  assert.deepEqual(sortAreas(areas, 'm', 'desc').map((a) => a.id), ['3', '1', '2']);
  assert.deepEqual(sortAreas(areas, 'm', 'asc').map((a) => a.id), ['1', '3', '2']);
  assert.deepEqual(sortAreas(areas, 'name', 'asc').map((a) => a.name), ['One', 'Three', 'Two']);
  const w = comparisonWarnings(areas, ['m'], new Map([['m', { label: 'Metric M' }]])).join('\n');
  assert.match(w, /mixes counties and metros/);
  assert.match(w, /Metric M: not available for Two/);
  assert.match(w, /vintage mismatch/);
  assert.match(comparisonWarnings([areas[0]], [], new Map()).join(''), /at least one more/);
  assert.equal(intervalsOverlap({ e: 100, moe: 20 }, { e: 115, moe: 10 }), true);
  assert.equal(intervalsOverlap({ e: 100, moe: 5 }, { e: 200, moe: 5 }), false);
  assert.equal(intervalsOverlap({ e: 100, moe: null }, { e: 101, moe: 5 }), false);
});

test('surveys: filters only offer values that exist; non-equivalent wording detected', () => {
  const tables = [
    { dataset_id: 'g', variable: 'v1', filters: { sex: 'female', age_band: '18-29', relig: null } },
    { dataset_id: 'g', variable: 'v2', filters: { sex: 'female', attend: 'weekly' } },
  ];
  const o = filterOptions(tables);
  assert.deepEqual(o.sex, ['female']);
  assert.deepEqual(o.attend, ['weekly']);
  assert.ok(!('relig' in o) && !('marital' in o));
  assert.equal(matchTables(tables, { attend: 'weekly' }).length, 1);
  assert.equal(matchTables(tables, { ds: 'g', v: 'v1', sex: 'female' }).length, 1);
  const neq = nonEquivalent([
    { dataset_id: 'g', variable: 'a', harmonized_concept: 'ideal', original_text: 'Q1' },
    { dataset_id: 'n', variable: 'b', harmonized_concept: 'ideal', original_text: 'Q2' },
    { dataset_id: 'g', variable: 'c', harmonized_concept: 'other', original_text: 'Q3' },
  ]);
  assert.deepEqual(neq.map((x) => x.concept), ['ideal']);
});

test('international: metric ids collected; year from the value, else the metric, else null', () => {
  const f = { countries: [{ observations: { tfr_2023: {} } }, { observations: { tfr_2023: {}, ideal_kids: {} } }] };
  assert.deepEqual(countryMetricIds(f), ['tfr_2023', 'ideal_kids']);
  assert.equal(valueYear({ year: 2022 }, { year: 2023 }), '2022');
  assert.equal(valueYear({}, { year: 2023 }), '2023');
  assert.equal(valueYear(null, {}), null);
});

test('explore trace runs source → version → file → transform → denominator → value', () => {
  const steps = traceSteps(
    { source_id: 's', method: 'Ratio', source_variable_ids: ['A', 'B'], universe: 'All residents', unit: 'per 1,000' },
    { title: 'Src', provider: 'Prov', dataset_version: 'v2', reference_period: 'p', landing_url: 'https://example.org', files: [{ url: 'https://example.org/f.csv' }] },
    { e: 12.5, moe: null, flags: ['denominator_all_ages'] },
  );
  assert.deepEqual(steps.map((s) => s.k), ['Source', 'Version', 'File or API', 'Transform', 'Denominator / universe', 'Value']);
  assert.match(steps[2].v, /f\.csv/);
  assert.match(steps[4].v, /all ages/);
  assert.equal(steps[5].v, '12.5');
  const missing = traceSteps({ source_id: 'x' }, null, { e: null, flags: ['not_ingested'] });
  assert.match(missing[0].v, /Not in the source register/);
  assert.match(missing[5].v, /Not available: Source not imported yet/);
});

test('rank candidates: state filter, radius filter, shared-link params override prefs', () => {
  const geos = { counties: [
    { id: '08001', state: '08', lat: 40, lon: -105 }, { id: '08003', state: '08', lat: 40, lon: -104 }, { id: '56001', state: '56', lat: 43, lon: -105 },
  ] };
  assert.deepEqual(candidateIds(geos, {}, { st: '08' }), ['08001', '08003']);
  assert.deepEqual(candidateIds(geos, {}, { st: 'us' }), ['08001', '08003', '56001']);
  assert.deepEqual(candidateIds(geos, {}, { st: 'us', origin: '08001', radius: 30 }), ['08001']);
  assert.deepEqual(candidateIds({ missing: true }, {}, {}), []);
  const s = effectiveSettings({ prefs: sanitizePrefs(null), params: { st: '56', band: '30_34', mode: 'concentrated', w: '10,20,30,40,0', min: '3' } });
  assert.equal(s.st, '56');
  assert.equal(s.band, '30_34');
  assert.equal(s.mode, 'concentrated');
  assert.equal(s.weights.values_evidence, 0.4);
  assert.equal(s.minDims, 3);
  assert.equal(effectiveSettings({ prefs: sanitizePrefs(null), params: { band: '12_14' } }).band, '20_24');
});
