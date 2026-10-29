import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCSV, toReportCSV, toReportMarkdown, reportRows, mdCell, CSV_COLUMNS } from './export.mjs';

// Synthetic inputs only.
const metricsById = new Map([
  ['women_20_24', { metric_id: 'women_20_24', label: 'Women 20–24', universe: 'Female residents aged 20–24', unit: 'persons', definition: 'Sum of three published age cells.', method: 'Sum', source_variable_ids: ['X_032', 'X_033'], source_id: 'acs5', class: 'observed', caveats: 'Sample estimate.' }],
  ['catholic_adherents_per_1000', { metric_id: 'catholic_adherents_per_1000', label: 'Catholic adherents per 1,000', universe: 'All ages', unit: 'per 1,000', definition: 'Adherents / population × 1000.', source_id: 'usrc', class: 'proxy' }],
]);
const sourcesById = new Map([
  ['acs5', { id: 'acs5', title: 'Test survey, "5-year"', provider: 'Test bureau', reference_period: 'test period', dataset_version: 'v1', landing_url: 'https://example.org/acs', citation: 'Test Bureau (test). Table, with commas.', status: 'ingested' }],
  ['usrc', { id: 'usrc', title: 'Test religion census', reference_period: 'test year', landing_url: 'https://example.org/usrc', citation: 'Test citation two.', status: 'ingested' }],
]);
const areas = [
  { id: '08013', name: 'Test County, "Quoted"', kind: 'county', observations: { women_20_24: { e: 1234, moe: 210, flags: ['moe_approx'] }, catholic_adherents_per_1000: { e: 150.5, moe: null, flags: ['vintage_mismatch', 'denominator_all_ages'] } } },
  { id: '08031', name: '=HYPERLINK("x")', kind: 'county', observations: { women_20_24: { e: null, moe: null, flags: ['not_ingested'] } } },
];
const input = { areas, metricIds: ['women_20_24', 'catholic_adherents_per_1000'], metricsById, sourcesById, vintage: 'Test vintage line', title: 'T', notes: ['Mixed | units'] };

test('csvCell escapes quotes, commas, newlines, defuses formulas, keeps null empty', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell(-5), '-5', 'numbers are not defused');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(0), '0', 'a real zero stays zero');
  assert.equal(csvCell(['a', 'b']), 'a; b');
  assert.equal(toCSV([[1, 'x'], [null, 'y,z']]), '1,x\r\n,"y,z"\r\n');
});

test('report rows keep definitions, citations, vintage and flags on every line', () => {
  const rows = reportRows(input);
  assert.equal(rows.length, 4);
  const r = rows.find((x) => x.geo_id === '08013' && x.metric_id === 'women_20_24');
  assert.equal(r.estimate, 1234);
  assert.equal(r.moe_90, 210);
  assert.equal(r.definition, 'Sum of three published age cells.');
  assert.equal(r.citation, 'Test Bureau (test). Table, with commas.');
  assert.equal(r.vintage, 'Test vintage line');
  assert.deepEqual(r.flags, ['moe_approx']);
  const missing = rows.find((x) => x.geo_id === '08031' && x.metric_id === 'catholic_adherents_per_1000');
  assert.equal(missing.estimate, null);
  assert.deepEqual(missing.flags, ['not_published'], 'an absent cell is flagged, not zeroed');
});

test('CSV report has the header, escapes cells and leaves nulls empty', () => {
  const csv = toReportCSV(input);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.join(','));
  assert.equal(lines.length, 5);
  assert.ok(csv.includes('"Test County, ""Quoted"""'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'formula-looking names are defused');
  assert.ok(csv.includes('"Test Bureau (test). Table, with commas."'));
  assert.ok(csv.includes('vintage_mismatch; denominator_all_ages'));
  assert.ok(csv.includes('08031,"\'=HYPERLINK(""x"")",county,women_20_24,Women 20–24,,,persons'), 'null estimate and MOE are empty cells');
});

test('Markdown report carries values, definitions, sources, flags and the disclaimer', () => {
  const md = toReportMarkdown(input);
  assert.match(md, /^# T/);
  assert.match(md, /\*\*Data vintage:\*\* Test vintage line/);
  assert.match(md, /1,234 ± 210/);
  assert.match(md, /Not available \(Not ingested\)/);
  assert.match(md, /### Women 20–24 \(`women_20_24`\)/);
  assert.match(md, /\*\*Universe:\*\* Female residents aged 20–24/);
  assert.match(md, /\*\*Source variables:\*\* X_032, X_033/);
  assert.match(md, /Test Bureau \(test\)\. Table, with commas\./);
  assert.match(md, /Vintage mismatch/);
  assert.match(md, /Mixed \| units/);
  assert.match(md, /no warranty/i);
  assert.ok(!/\b0 ±/.test(md));
});

test('mdCell escapes pipes and newlines', () => {
  assert.equal(mdCell('a|b\nc'), 'a\\|b c');
});
