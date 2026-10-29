// Writes the synthetic test fixtures in test/fixtures/data/, shaped exactly
// like ARCHITECTURE.md. Every number here is invented by a seeded generator,
// every file says "synthetic": true at the top level, and every county name
// says "Fixture". The page never loads these: tests read them from disk and
// test/e2e.mjs injects them with Playwright's page.route.
//
//   node test/make-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'data');

let seed = 20261029;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const int = (lo, hi) => Math.round(lo + rand() * (hi - lo));
const obs = (e, moe = null, flags = []) => ({ e, moe, flags });

function write(rel, body) {
  const file = path.join(OUT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ synthetic: true, ...body }, null, 1) + '\n');
}

const STATES = [
  { id: '08', name: 'Fixture State Eight', abbr: 'F8', n: 12, cols: 4 },
  { id: '56', name: 'Fixture State Fifty-six', abbr: 'F5', n: 3, cols: 3 },
];
const LETTERS = 'ABCDEFGHIJKLMNOP';
const counties = [];
for (const st of STATES) {
  for (let i = 0; i < st.n; i++) {
    const county = String(1 + 2 * i).padStart(3, '0');
    counties.push({
      id: st.id + county, name: `Fixture County ${LETTERS[i]}${st.id === '56' ? '2' : ''}`,
      state: st.id, state_name: st.name, county,
      cbsa: i < 4 && st.id === '08' ? '99901' : null,
      cbsa_name: i < 4 && st.id === '08' ? 'Fixture Metro' : null,
      lat: 40 - Math.floor(i / st.cols) * 0.5 + (st.id === '56' ? 3 : 0),
      lon: -105 + (i % st.cols) * 0.6, land_sqmi: int(300, 2500), _i: i, _cols: st.cols,
    });
  }
}

write('us/geographies.json', {
  vintage: 'fixture',
  counties: counties.map(({ _i, _cols, ...c }) => c),
  states: STATES.map(({ id, name, abbr }) => ({ id, name, abbr })),
  cbsas: [{ id: '99901', name: 'Fixture Metro', kind: 'metro', counties: counties.filter((c) => c.cbsa).map((c) => c.id) }],
});

// County observations. 08023 has no Religion Census values; 08021 is absent
// from the observations entirely; 56005 has an exploratory proxy only.
const observations = {};
for (const c of counties) {
  if (c.id === '08021') continue;
  const big = c._i < 2 ? 12 : 1;
  const w1819 = int(200, 3000) * big, w2024 = int(500, 9000) * big, w2529 = int(500, 8000) * big, w3034 = int(500, 8000) * big;
  const nm2024 = Math.round(w2024 * (0.7 + rand() * 0.25)), nm2529 = Math.round(w2529 * (0.35 + rand() * 0.3));
  const nm3034 = Math.round(w3034 * (0.2 + rand() * 0.2));
  const total = (w2024 + w2529) * int(14, 22);
  const o = {
    total_population: obs(total, int(0, 50)),
    female_population: obs(Math.round(total / 2), int(50, 400)),
    women_18_19: obs(w1819, int(40, 300)),
    women_20_24: obs(w2024, int(90, 600), ['moe_approx']),
    women_25_29: obs(w2529, int(90, 600)),
    women_30_34: obs(w3034, int(90, 600)),
    women_20_29: obs(w2024 + w2529, int(120, 800), ['moe_approx']),
    never_married_women_20_24: obs(nm2024, int(90, 600), ['moe_approx']),
    never_married_women_25_29: obs(nm2529, int(90, 600), ['moe_approx']),
    never_married_women_20_29: obs(nm2024 + nm2529, int(120, 800), ['moe_approx']),
    never_married_women_30_34: obs(nm3034, int(60, 400), ['moe_approx']),
    never_married_share_women_20_29: obs(Math.round(((nm2024 + nm2529) / (w2024 + w2529)) * 1000) / 10, null, ['derived']),
    women_20_29_per_1000: obs(Math.round(((w2024 + w2529) / total) * 10000) / 10, null, ['derived']),
    rep_pres_share_2024: obs(null, null, ['not_ingested']),
    public_venues: obs(c._i % 3 === 0 ? int(1, 4) : 0, null, []),
  };
  if (c.id !== '08023') {
    const adh = Math.round(total * (0.05 + rand() * 0.3));
    const cong = int(2, 40) * (big > 1 ? 3 : 1);
    Object.assign(o, {
      catholic_adherents: obs(adh),
      catholic_congregations: obs(cong),
      catholic_adherents_per_1000: obs(Math.round((adh / total) * 10000) / 10, null, ['denominator_all_ages', 'vintage_mismatch', 'derived']),
      catholic_congregations_per_100k: obs(Math.round((cong / total) * 1e6) / 10, null, ['denominator_all_ages', 'vintage_mismatch', 'derived']),
    });
  } else {
    for (const k of ['catholic_adherents', 'catholic_congregations', 'catholic_adherents_per_1000', 'catholic_congregations_per_100k']) {
      o[k] = obs(null, null, ['not_published']);
    }
  }
  observations[c.id] = o;
}
write('us/county_observations.json', {
  vintage_label: 'Fixture ACS 5-year · Fixture Religion Census',
  source_ids: ['acs5', 'usrc2020'],
  observations,
});
write('us/state_observations.json', {
  vintage_label: 'Fixture ACS 5-year · Fixture Religion Census',
  source_ids: ['acs5', 'usrc2020'],
  observations: Object.fromEntries(STATES.map((s) => [s.id, { total_population: obs(int(1e5, 1e6), int(0, 50)), women_20_24: obs(int(5000, 50000), int(100, 900)) }])),
});
write('us/cbsa_observations.json', {
  vintage_label: 'Fixture ACS 5-year · Fixture Religion Census',
  source_ids: ['acs5', 'usrc2020'],
  observations: {
    99901: {
      total_population: obs(int(1e6, 2e6), int(0, 50)),
      women_20_24: obs(int(40000, 90000), int(300, 900)),
      women_25_29: obs(int(40000, 90000), int(300, 900)),
      never_married_women_20_24: obs(int(30000, 70000), int(300, 900), ['moe_approx']),
      catholic_adherents: obs(int(1e5, 3e5)),
      catholic_adherents_per_1000: obs(180.4, null, ['denominator_all_ages', 'vintage_mismatch', 'derived']),
    },
  },
});

// Geometry: one square per county on a grid, a projection-free toy.
function geo(list, cols) {
  const size = 100, gap = 4;
  const paths = {};
  for (const c of list) {
    const x = (c._i % cols) * (size + gap), y = Math.floor(c._i / cols) * (size + gap);
    paths[c.id] = `M${x},${y}h${size}v${size}h${-size}Z`;
  }
  const rows = Math.ceil(list.length / cols);
  return { viewBox: `0 0 ${cols * (size + gap) - gap} ${rows * (size + gap) - gap}`, projection: 'fixture-grid', paths };
}
for (const st of STATES) {
  const list = counties.filter((c) => c.state === st.id);
  const g = geo(list, st.cols);
  const n = list.length;
  write(`geo/state_${st.id}.json`, { ...g, states: { [st.id]: `M0,0h${st.cols * 104 - 4}v${Math.ceil(n / st.cols) * 104 - 4}h${-(st.cols * 104 - 4)}Z` } });
}

const SRC = (id, title, status, extra = {}) => ({
  id, title, provider: 'Fixture provider', landing_url: `https://example.org/${id}`,
  dataset_version: 'fixture-1', reference_period: 'fixture period', retrieved_at: '2026-10-29T00:00:00Z',
  license: 'Fixture licence', access: status === 'gated' ? 'registration required' : 'public download',
  citation: `Fixture citation for ${title}.`, status,
  files: status === 'ingested' ? [{ url: `https://example.org/${id}/file.csv`, sha256: '0'.repeat(64) }] : [],
  notes: '', ...extra,
});
write('sources.json', {
  sources: [
    SRC('acs5', 'American Community Survey 5-year (fixture)', 'ingested', { reference_period: 'fixture 5-year' }),
    SRC('usrc2020', 'U.S. Religion Census (fixture)', 'ingested'),
    SRC('mit_election', 'County presidential returns (fixture)', 'not_ingested'),
    SRC('gss', 'General Social Survey (fixture)', 'ingested'),
    SRC('issp2022', 'International Social Survey Programme 2022 (fixture)', 'gated'),
    SRC('wpp2024', 'World Population Prospects (fixture)', 'failed', { notes: 'fixture failure' }),
  ],
});

const M = (metric_id, label, source_id, cls, unit = 'persons', extra = {}) => ({
  metric_id, label, short: label, universe: `Fixture universe for ${label}`, unit,
  definition: `Fixture definition of ${label}.`, source_variable_ids: ['FIXTURE_001'],
  method: 'Fixture method', source_id, class: cls, caveats: 'Fixture caveat.', higher_is: 'more', ...extra,
});
write('metrics.json', {
  metrics: [
    M('total_population', 'Total population', 'acs5', 'observed'),
    M('female_population', 'Female population', 'acs5', 'observed'),
    M('women_18_19', 'Women 18–19', 'acs5', 'observed'),
    M('women_20_24', 'Women 20–24', 'acs5', 'observed'),
    M('women_25_29', 'Women 25–29', 'acs5', 'observed'),
    M('women_30_34', 'Women 30–34', 'acs5', 'observed'),
    M('women_20_29', 'Women 20–29', 'acs5', 'observed'),
    M('never_married_women_20_24', 'Never-married women 20–24', 'acs5', 'observed'),
    M('never_married_women_25_29', 'Never-married women 25–29', 'acs5', 'observed'),
    M('never_married_women_20_29', 'Never-married women 20–29', 'acs5', 'observed'),
    M('never_married_women_30_34', 'Never-married women 30–34', 'acs5', 'observed'),
    M('never_married_share_women_20_29', 'Never-married share, women 20–29', 'acs5', 'observed', 'percent'),
    M('women_20_29_per_1000', 'Women 20–29 per 1,000 residents', 'acs5', 'observed', 'per 1,000'),
    M('catholic_adherents', 'Catholic adherents', 'usrc2020', 'proxy'),
    M('catholic_congregations', 'Catholic congregations', 'usrc2020', 'proxy', 'congregations'),
    M('catholic_adherents_per_1000', 'Catholic adherents per 1,000', 'usrc2020', 'proxy', 'per 1,000'),
    M('catholic_congregations_per_100k', 'Catholic congregations per 100,000', 'usrc2020', 'proxy', 'per 100,000'),
    M('rep_pres_share_2024', 'Republican presidential vote share', 'mit_election', 'unvalidated_hypothesis', 'percent'),
    M('public_venues', 'Public venues listed', 'communities', 'user_listing', 'venues'),
  ],
});

write('surveys/questions.json', {
  datasets: [{ id: 'gss', title: 'General Social Survey (fixture)', source_id: 'gss', years: [2018, 2021, 2022], weight_variable: 'wtssps', design: 'Fixture design note' }],
  questions: [
    { dataset_id: 'gss', variable: 'chldidel', original_text: 'Fixture question text: ideal number of children?', response_map: { 0: 'None', 4: 'Four or more' }, harmonized_concept: 'ideal_family_size', alignment: 'direct', years: [2018, 2021, 2022] },
    { dataset_id: 'gss', variable: 'fefam', original_text: 'Fixture question text: roles in the family?', response_map: { 1: 'Strongly agree', 4: 'Strongly disagree' }, harmonized_concept: 'role_norm', alignment: 'partial', years: [2018, 2022] },
    { dataset_id: 'gss', variable: 'divlaw', original_text: 'Fixture question text: divorce law?', response_map: { 1: 'Easier', 2: 'More difficult' }, harmonized_concept: 'divorce_law_attitude', alignment: 'related', years: [2018, 2022] },
  ],
});
const T = (id, variable, filters, rows, n, n_eff, flags = []) => ({ id, dataset_id: 'gss', variable, years: [2018, 2022], filters, rows, n, n_eff, weighted_base: n, excluded: { dk: 3, refused: 1, iap: 10 }, flags });
write('surveys/crosstabs.json', {
  tables: [
    T('t1', 'chldidel', { sex: 'female', age_band: '18-29', relig: 'catholic', attend: 'any', marital: 'any' },
      [{ category: 'Four or more', pct: 31.5, ci_low: 22.1, ci_high: 40.9 }, { category: 'Two', pct: 40.2, ci_low: 30.0, ci_high: 50.4 }], 140, 112),
    T('t2', 'chldidel', { sex: 'female', age_band: '18-29', relig: 'catholic', attend: 'weekly', marital: 'never_married' }, null, 31, 22, ['suppressed_small_sample']),
    T('t3', 'fefam', { sex: 'female', age_band: '18-29', relig: 'catholic', attend: 'any', marital: 'any' },
      [{ category: 'Agree', pct: 18.0, ci_low: 9.5, ci_high: 26.5 }, { category: 'Disagree', pct: 82.0, ci_low: 73.5, ci_high: 90.5 }], 88, 64, ['exploratory_sample']),
  ],
});
write('surveys/proxy_tests.json', {
  tests: [{ id: 'p1', hypothesis: 'Fixture: weekly attendance predicts ideal 4+', outcome: 'chldidel>=4', predictors: ['attend'], train_years: [2018], test_years: [2022], n_train: 400, n_test: 200, auc: 0.61, auc_ci: [0.55, 0.67], baseline_auc: 0.5, brier: 0.2, baseline_brier: 0.22, verdict: 'weak', notes: 'Fixture.' }],
});
write('intl/countries.json', {
  countries: [
    { iso3: 'AAA', name: 'Fixtureland', observations: { tfr_2023: { ...obs(1.4), year: 2023 } } },
    { iso3: 'BBB', name: 'Testonia', observations: { tfr_2023: obs(null, null, ['not_ingested']) } },
  ],
  metrics: [{ metric_id: 'tfr_2023', label: 'Total fertility rate', year: 2023, source_id: 'wpp2024', class: 'observed', definition: 'Fixture TFR definition.' }],
  notes: 'Fixture notes.',
});
console.log('wrote fixtures to', OUT);
