// Observed one-year divorce rates for people like each partner, from the ACS baselines file
// (data/acs_divorce_baselines.json: 2019 and 2021–2024 ACS, per 1,000 people married at some
// point in the past 12 months, with 95% intervals; cells under 200 people are not published).
// No model: these are what the survey recorded. CROSS-SECTIONAL: characteristics are measured
// after any divorce. Pure functions; tests/summary.test.mjs.
import { STATES } from './lens-adapters.js';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const ACS_EDU = { 'Less than high school': 'Less than high school', 'High school': 'High school or GED', 'Some college': 'Some college', Associate: 'Associate', Bachelor: 'Bachelor', Master: 'Graduate or professional', PhD: 'Graduate or professional', Professional: 'Graduate or professional' };
const ageBand = (x) => (!Number.isFinite(x) ? null : x < 25 ? '15-24' : x < 30 ? '25-29' : x < 35 ? '30-34' : x < 40 ? '35-39' : x < 45 ? '40-44' : x < 50 ? '45-49' : x < 55 ? '50-54' : x < 65 ? '55-64' : '65+');
const durBand = (x) => (!Number.isFinite(x) ? null : x <= 2 ? '0-2 years' : x <= 5 ? '3-5 years' : x <= 10 ? '6-10 years' : x <= 20 ? '11-20 years' : x <= 30 ? '21-30 years' : '31+ years');
export const LABELS = { sex: 'Sex', age_band: 'Age', education: 'Education', race_ethnicity: 'Race-ethnicity', nativity: 'Born in the U.S.', duration_band: 'Years since the wedding', times_married: 'Times married', state: 'State' };

// The ACS attributes of one person (only those the form knows).
export function acsAttributes(p, couple = {}) {
  const ym = num(couple.yearsMarried) || 0;
  const tm = !p.priorMarriage ? 'Once' : p.marriagesBefore === '1' ? 'Twice' : p.marriagesBefore === '2+' ? 'Three or more' : null;
  return {
    sex: p.sex === 'Woman' || p.sex === 'Man' ? p.sex : null,
    age_band: ageBand(num(p.age)),
    education: ACS_EDU[p.degree] || null,
    race_ethnicity: ['Hispanic', 'White', 'Black', 'Asian', 'Other'].includes(p.raceEth) ? p.raceEth : null,
    nativity: p.bornUS === 'Yes' ? 'US-born' : p.bornUS === 'No' ? 'Foreign-born' : null,
    duration_band: durBand(ym),
    times_married: tm,
    state: STATES.includes(couple.state) ? couple.state : null,
  };
}

// Every published cell this person matches, most specific first (more dimensions, then fewer
// people), plus the overall rate. Each: { dims, values, people, divorces, per1000, lo, hi }.
export function acsMatches(data, p, couple = {}) {
  if (!data?.cells) return null;
  const at = acsAttributes(p, couple);
  const out = [];
  for (const [key, block] of Object.entries(data.cells)) {
    const dims = key.split('|');
    if (dims.some((d) => !at[d])) continue;
    const want = dims.map((d) => at[d]);
    const row = block.rows.find((r) => r[0].every((v, i) => v === want[i]));
    if (!row) continue;
    const [values, people, divorces, per1000, lo, hi] = row;
    out.push({ dims, values, people, divorces, per1000, lo, hi });
  }
  out.sort((x, y) => y.dims.length - x.dims.length || x.people - y.people);
  return { overall: data.overall, matches: out, attributes: at, missing: Object.keys(LABELS).filter((k) => !at[k]) };
}
