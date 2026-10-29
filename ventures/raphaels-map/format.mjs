// @ts-check
// Numbers, margins of error, badges, empty states and acronym expansion.
// Rule one: null renders "Not available", never 0.

export const NOT_AVAILABLE = 'Not available';

/** @param {any} s */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

/** @param {any} v */
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {any} v
 * @param {{digits?: number, unit?: string}} [opts]
 */
export function num(v, { digits, unit } = {}) {
  if (!isNum(v)) return NOT_AVAILABLE;
  const d = digits ?? (Number.isInteger(v) ? 0 : Math.abs(v) < 10 ? 2 : 1);
  const s = v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  if (unit === 'percent') return `${s}%`;
  return s;
}

/** Margin of error text, "± 210", or "" when the source publishes none. */
export function moe(o) {
  if (!o || !isNum(o.moe)) return '';
  return `± ${num(o.moe, { digits: Number.isInteger(o.moe) ? 0 : 1 })}`;
}

/** "1,234 ± 210" or "Not available". */
export function obsText(o, unit) {
  if (!o || !isNum(o.e)) return NOT_AVAILABLE;
  const m = moe(o);
  return m ? `${num(o.e, { unit })} ${m}` : num(o.e, { unit });
}

/** Why a value is not available, in words, from its flags. */
export function missingReason(o) {
  const f = (o && o.flags) || [];
  if (!o) return 'No observation in the published file';
  if (f.includes('not_ingested')) return 'Source not imported yet';
  if (f.includes('not_published')) return 'The source publishes no such cell';
  if (f.includes('suppressed_small_sample')) return 'Insufficient sample';
  return 'No value in the published file';
}

export const CLASS_LABELS = {
  observed: 'Observed statistic',
  survey_estimate: 'Survey estimate',
  projection: 'Projection',
  proxy: 'Proxy',
  unvalidated_hypothesis: 'Unvalidated hypothesis',
  user_listing: 'User-maintained listing',
};

export const FLAG_LABELS = {
  not_ingested: 'Not ingested',
  not_published: 'Not published by source',
  suppressed_small_sample: 'Insufficient sample',
  exploratory_sample: 'Exploratory',
  moe_approx: 'Approximate margin of error',
  vintage_mismatch: 'Vintage mismatch',
  denominator_all_ages: 'Denominator: all ages',
  proxy: 'Proxy',
  unvalidated: 'Unvalidated',
  derived: 'Derived',
  geo_changed: 'Boundary changed',
};

export const FLAG_HELP = {
  not_ingested: 'The source file has not been fetched and imported yet.',
  not_published: 'The source does not publish this cell for this geography.',
  suppressed_small_sample: 'Effective sample size below 30: no percentage is shown.',
  exploratory_sample: 'Effective sample size between 30 and 100: high uncertainty.',
  moe_approx: 'Margin of error for summed cells uses the Census Bureau approximation sqrt(sum of squared MOEs).',
  vintage_mismatch: 'Numerator and denominator come from different years.',
  denominator_all_ages: 'The denominator is everyone of all ages, not the target age band.',
  proxy: 'An indirect measure, not the outcome itself.',
  unvalidated: 'Not tested against an outcome in compatible data.',
  derived: 'Computed from published values (a ratio or sum), not published directly.',
  geo_changed: 'The geographic boundary does not match across vintages.',
};

const SEVERE = new Set(['not_ingested', 'not_published', 'suppressed_small_sample', 'vintage_mismatch', 'unvalidated', 'geo_changed']);

/** @param {string} cls */
export function classBadge(cls) {
  if (!cls) return '';
  const label = CLASS_LABELS[cls] || cls;
  return `<span class="badge cls cls-${esc(cls)}">${esc(label)}</span>`;
}

/** @param {string[]|undefined} flags */
export function flagBadges(flags) {
  return (flags || [])
    .map((f) => `<span class="badge flag${SEVERE.has(f) ? ' flag-warn' : ''}" title="${esc(FLAG_HELP[f] || f)}">${esc(FLAG_LABELS[f] || f)}</span>`)
    .join(' ');
}

// Acronyms the page uses, expanded on first appearance in a view.
export const ACRONYMS = {
  ACS: 'American Community Survey',
  GSS: 'General Social Survey',
  NSFG: 'National Survey of Family Growth',
  FIPS: 'Federal Information Processing Standards',
  MOE: 'margin of error',
  CBSA: 'Core-Based Statistical Area',
  ISSP: 'International Social Survey Programme',
  EVS: 'European Values Study',
  WVS: 'World Values Survey',
  WPP: 'World Population Prospects',
  TFR: 'total fertility rate',
  CI: 'confidence interval',
  AUC: 'area under the ROC curve',
  CSV: 'comma-separated values',
  DHS: 'Demographic and Health Surveys',
  PRRI: 'Public Religion Research Institute',
  ISO: 'International Organization for Standardization',
};

/**
 * An expander that writes "American Community Survey (ACS)" the first time it
 * sees ACS and plain "ACS" afterwards. One per rendered view.
 * Works on plain text; escape the result before putting it in HTML.
 */
export function acronyms(table = ACRONYMS) {
  const seen = new Set();
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${keys.join('|')})\\b`, 'g');
  /** @param {string} text */
  return (text) =>
    String(text ?? '').replace(re, (m, k, offset, whole) => {
      if (seen.has(k)) return m;
      seen.add(k);
      const long = table[k];
      // Already written out right before it, e.g. "American Community Survey (ACS)".
      if (whole.slice(Math.max(0, offset - long.length - 2), offset).toLowerCase().includes(long.toLowerCase())) return m;
      return `${long} (${k})`;
    });
}

/** The vintage line every composite view carries, read from the data files. */
export function vintageLine(countyObs, sources) {
  if (countyObs && !countyObs.missing && countyObs.vintage_label) return countyObs.vintage_label;
  if (sources && !sources.missing && countyObs && !countyObs.missing && Array.isArray(countyObs.source_ids)) {
    const by = new Map((sources.sources || []).map((s) => [s.id, s]));
    const parts = countyObs.source_ids.map((id) => by.get(id)).filter(Boolean).map((s) => `${s.title}${s.reference_period ? ` (${s.reference_period})` : ''}`);
    if (parts.length) return parts.join(' · ');
  }
  return 'Data vintage not loaded yet';
}

/** @param {string} label @param {string} text */
export function vintageHtml(text) {
  return `<p class="vintage"><span class="vintage-k">Data vintage</span> ${esc(text)}</p>`;
}

const EMPTY_TEXT = {
  'us/county_observations.json': 'The county statistics (American Community Survey and 2020 U.S. Religion Census aggregates) have not been built yet.',
  'us/geographies.json': 'The list of counties and states has not been built yet.',
  'sources.json': 'The source register has not been published yet.',
  'metrics.json': 'The metric definitions have not been published yet.',
  'surveys/questions.json': 'No survey has been imported yet, so there are no questions to show.',
  'surveys/crosstabs.json': 'No survey tables have been computed yet.',
  'surveys/proxy_tests.json': 'No proxy hypothesis has been tested yet.',
  'intl/countries.json': 'The international country table has not been built yet.',
  'us/cbsa_observations.json': 'Metro statistics have not been built yet.',
};

/** A friendly empty state for a missing file. */
export function emptyState(path, extra = '') {
  const text = EMPTY_TEXT[path] || (path.startsWith('geo/') ? 'The map outlines for this area have not been built yet.' : `The file ${path} is not available yet.`);
  return `<div class="empty" role="status"><p><strong>Not available yet.</strong> ${esc(text)} Nothing is shown in its place: no estimate is substituted. See <a href="#methodology">Methodology</a> for what is imported and what is not.</p>${extra}</div>`;
}

/** Metric label from metrics.json, falling back to the id. */
export function metricLabel(metricsById, id) {
  const m = metricsById && metricsById.get ? metricsById.get(id) : null;
  return (m && (m.label || m.short)) || id;
}
