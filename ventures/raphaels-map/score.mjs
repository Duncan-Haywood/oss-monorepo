// @ts-check
// The research priority index (SPEC 6.4). Pure functions, no DOM.
//
// - Four 0–100 dimension scores from observed values only. A dimension with
//   no data for an area is null, never 0.
// - Each component metric is normalised across the areas being compared:
//   percentile (default) or min–max on a log scale for counts, so a huge
//   metro does not automatically win every score.
// - The composite is computed only over the dimensions an area actually has,
//   with the weights re-normalised over those, and is withheld when fewer
//   than `minDims` dimensions are scored.
// - Unvalidated hypotheses (class `unvalidated_hypothesis`) are a separate,
//   labelled dimension that is off unless the user turns it on.

export const DIMENSIONS = ['demographic_capacity', 'catholic_ecosystem', 'meeting_access', 'values_evidence'];
export const PROXY_DIMENSION = 'exploratory_proxies';

export const DIMENSION_LABELS = {
  demographic_capacity: 'Demographic capacity',
  catholic_ecosystem: 'Catholic ecosystem',
  meeting_access: 'Meeting access',
  values_evidence: 'Values evidence',
  exploratory_proxies: 'Exploratory proxies (unvalidated)',
};

export const DIMENSION_HELP = {
  demographic_capacity: 'Women in the chosen age band, and never-married women where the American Community Survey publishes that age band.',
  catholic_ecosystem: 'Catholic adherents and congregations from the U.S. Religion Census. Adherents of all ages: nominal presence, not Mass attendance or compatibility.',
  meeting_access: 'Publicly listed Catholic venues (parishes, young-adult groups, campus ministries) in the area. A venue existing does not prove a sizable pool.',
  values_evidence: 'Directly measured survey values at this geography. National surveys do not support county estimates, so this is usually unavailable.',
  exploratory_proxies: 'Ecological correlates such as county vote share. Not tested against the outcome; excluded unless you turn them on.',
};

/** Age bands the data can publish. Adults only; nothing below 18 exists here. */
export const AGE_BANDS = [
  { id: '18_19', label: '18–19' },
  { id: '20_24', label: '20–24' },
  { id: '25_29', label: '25–29' },
  { id: '30_34', label: '30–34' },
  { id: '20_29', label: '20–29' },
];

// Meeting access starts at 0 in both modes: communities.json is a hand-curated
// sample, so a county with no listed venue is "none listed yet", not "none".
// The slider stays, for users who add or trust the listings in their area.
export const MODES = {
  volume: {
    label: 'Find volume',
    help: 'Prioritises reachable age-eligible population and places to meet people: counts, on a log or percentile scale.',
    weights: { demographic_capacity: 0.7, catholic_ecosystem: 0.3, meeting_access: 0, values_evidence: 0, exploratory_proxies: 0 },
  },
  concentrated: {
    label: 'Find concentrated values',
    help: 'Prioritises directly measured values alignment where samples allow; otherwise leans on shares and densities rather than raw counts, and says that values evidence is unavailable.',
    weights: { demographic_capacity: 0.2, catholic_ecosystem: 0.3, meeting_access: 0, values_evidence: 0.5, exploratory_proxies: 0 },
  },
};

/**
 * Bands that have a women_<band> metric in the published metric list or
 * observation keys.
 * @param {Iterable<string>} metricIds
 */
export function availableBands(metricIds) {
  const have = new Set(metricIds);
  return AGE_BANDS.filter((b) => have.has(`women_${b.id}`));
}

/**
 * Component metrics per dimension.
 * @param {{band?: string, mode?: string, valuesMetrics?: string[], proxyMetrics?: string[]}} opts
 * @returns {Record<string, {metric: string, scale: 'log'|'linear', weight: number}[]>}
 */
export function dimensionComponents({ band = '20_24', mode = 'volume', valuesMetrics = [], proxyMetrics = [] } = {}) {
  const conc = mode === 'concentrated';
  const demo = conc
    ? [
        { metric: `never_married_women_${band}`, scale: /** @type {const} */ ('log'), weight: 1 },
        ...(['20_24', '25_29', '20_29'].includes(band) ? [{ metric: 'never_married_share_women_20_29', scale: /** @type {const} */ ('linear'), weight: 1 }] : []),
      ]
    : [
        { metric: `women_${band}`, scale: /** @type {const} */ ('log'), weight: 1 },
        { metric: `never_married_women_${band}`, scale: /** @type {const} */ ('log'), weight: 1 },
      ];
  const cath = conc
    ? [
        { metric: 'catholic_adherents_per_1000', scale: /** @type {const} */ ('linear'), weight: 1 },
        { metric: 'catholic_congregations_per_100k', scale: /** @type {const} */ ('linear'), weight: 1 },
      ]
    : [
        { metric: 'catholic_adherents', scale: /** @type {const} */ ('log'), weight: 1 },
        { metric: 'catholic_congregations', scale: /** @type {const} */ ('log'), weight: 1 },
      ];
  return {
    demographic_capacity: demo,
    catholic_ecosystem: cath,
    meeting_access: [{ metric: 'public_venues', scale: 'log', weight: 1 }],
    values_evidence: valuesMetrics.map((metric) => ({ metric, scale: 'linear', weight: 1 })),
    exploratory_proxies: proxyMetrics.map((metric) => ({ metric, scale: 'linear', weight: 1 })),
  };
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** log10(1 + v) for counts; negative values are left on a linear scale. */
export const logScale = (v) => (v >= 0 ? Math.log10(1 + v) : v);

/**
 * Midrank percentile, 0–100, of each value among the non-null values.
 * Ties share a score; a single value scores 50; null stays null.
 * @param {(number|null)[]} values
 */
export function percentiles(values) {
  const present = values.filter(finite).slice().sort((a, b) => a - b);
  const n = present.length;
  return values.map((v) => {
    if (!finite(v)) return null;
    if (n === 1) return 50;
    let lo = 0;
    while (lo < n && present[lo] < v) lo++;
    let hi = lo;
    while (hi < n && present[hi] === v) hi++;
    const midrank = (lo + hi - 1) / 2; // 0-based average rank of the ties
    return (midrank / (n - 1)) * 100;
  });
}

/**
 * Min–max to 0–100; equal values all score 50; null stays null.
 * @param {(number|null)[]} values
 */
export function minMax(values) {
  const present = values.filter(finite);
  if (!present.length) return values.map(() => null);
  const lo = Math.min(...present), hi = Math.max(...present);
  return values.map((v) => (!finite(v) ? null : hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100));
}

/**
 * @param {(number|null)[]} raw
 * @param {{scale: 'log'|'linear', normalization: 'percentile'|'log_minmax', invert?: boolean}} o
 */
export function normalise(raw, { scale, normalization, invert = false }) {
  const t = raw.map((v) => (!finite(v) ? null : scale === 'log' ? logScale(v) : v));
  const out = normalization === 'percentile' ? percentiles(t) : minMax(t);
  return invert ? out.map((v) => (v === null ? null : 100 - v)) : out;
}

/**
 * Dimension scores for every candidate area. Weight-independent, so it is
 * computed once and re-used for rank sensitivity.
 *
 * @param {{
 *   ids: string[],
 *   observations: Record<string, Record<string, {e: number|null}>>,
 *   metricsById?: Map<string, any>,
 *   band?: string, mode?: string,
 *   normalization?: 'percentile'|'log_minmax',
 *   includeProxies?: boolean,
 *   valuesMetrics?: string[], proxyMetrics?: string[],
 * }} input
 */
export function computeDimensions(input) {
  const { ids, observations = {}, metricsById = new Map(), band = '20_24', mode = 'volume', normalization = 'percentile', includeProxies = false } = input;
  const valuesMetrics = input.valuesMetrics ?? valuesMetricIds(metricsById);
  const proxyMetrics = input.proxyMetrics ?? proxyMetricIds(metricsById);
  const comps = dimensionComponents({ band, mode, valuesMetrics, proxyMetrics });
  const dims = includeProxies ? [...DIMENSIONS, PROXY_DIMENSION] : DIMENSIONS;

  /** @type {Record<string, Record<string, (number|null)[]>>} */
  const norm = {};
  for (const d of dims) {
    norm[d] = {};
    for (const c of comps[d]) {
      const raw = ids.map((id) => {
        const o = observations[id] && observations[id][c.metric];
        return o && finite(o.e) ? o.e : null;
      });
      const def = metricsById.get(c.metric);
      const invert = !!def && /^(less|lower|fewer)$/i.test(String(def.higher_is || ''));
      norm[d][c.metric] = normalise(raw, { scale: c.scale, normalization, invert });
    }
  }

  const rows = ids.map((id, i) => {
    /** @type {Record<string, any>} */
    const dimOut = {};
    for (const d of dims) {
      const parts = comps[d].map((c) => {
        const o = observations[id] && observations[id][c.metric];
        return { metric: c.metric, scale: c.scale, weight: c.weight, value: o && finite(o.e) ? o.e : null, moe: o && finite(o.moe) ? o.moe : null, flags: (o && o.flags) || [], norm: norm[d][c.metric][i] };
      });
      const avail = parts.filter((p) => p.norm !== null);
      const wsum = avail.reduce((s, p) => s + p.weight, 0);
      const score = avail.length && wsum > 0 ? avail.reduce((s, p) => s + p.weight * /** @type {number} */ (p.norm), 0) / wsum : null;
      dimOut[d] = { score, components: parts, available: avail.length, total: parts.length };
    }
    return { id, dims: dimOut };
  });
  return { rows, dims, components: comps, settings: { band, mode, normalization, includeProxies } };
}

/** Survey-estimate metrics marked for the values dimension. */
export function valuesMetricIds(metricsById) {
  return [...metricsById.values()].filter((m) => m.dimension === 'values_evidence' && m.class === 'survey_estimate').map((m) => m.metric_id);
}

/** County-level unvalidated hypotheses (off by default). */
export function proxyMetricIds(metricsById) {
  return [...metricsById.values()].filter((m) => m.class === 'unvalidated_hypothesis').map((m) => m.metric_id);
}

/**
 * Re-normalise the user's weights over the dimensions an area has.
 * @param {Record<string, number>} weights
 * @param {string[]} available dimensions with a non-null score
 * @returns {Record<string, number>|null} null when the available weights sum to 0
 */
export function renormalise(weights, available) {
  const sum = available.reduce((s, d) => s + Math.max(0, weights[d] || 0), 0);
  if (!(sum > 0)) return null;
  return Object.fromEntries(available.map((d) => [d, Math.max(0, weights[d] || 0) / sum]));
}

/**
 * Composite index and ranks from computed dimensions.
 * @param {ReturnType<typeof computeDimensions>} computed
 * @param {{weights: Record<string, number>, minDims?: number}} o
 */
export function composite(computed, { weights, minDims = 2 }) {
  const active = computed.dims.filter((d) => (weights[d] || 0) > 0);
  const rows = computed.rows.map((r) => {
    const scored = active.filter((d) => r.dims[d].score !== null);
    const w = renormalise(weights, scored);
    let index = null, status = 'ok';
    /** @type {Record<string, number>} */
    const contributions = {};
    if (scored.length < minDims) status = 'insufficient_coverage';
    else if (!w) status = 'no_weight';
    else {
      index = 0;
      for (const d of scored) {
        contributions[d] = w[d] * r.dims[d].score;
        index += contributions[d];
      }
    }
    return { ...r, index, status, weightsUsed: w || {}, contributions, coverage: { scored: scored.length, considered: active.length, missing: active.filter((d) => r.dims[d].score === null) } };
  });
  return assignRanks(rows);
}

/** Competition ranking (1, 2, 2, 4) on index; null index gets rank null and sorts last. */
export function assignRanks(rows) {
  const sorted = rows.slice().sort((a, b) => {
    if (a.index === null && b.index === null) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (a.index === null) return 1;
    if (b.index === null) return -1;
    return b.index - a.index || (a.id < b.id ? -1 : 1);
  });
  let prev = null, prevRank = 0;
  sorted.forEach((r, i) => {
    if (r.index === null) { r.rank = null; return; }
    const same = prev !== null && Math.abs(r.index - prev) < 1e-9;
    r.rank = same ? prevRank : i + 1;
    prev = r.index;
    prevRank = r.rank;
  });
  return sorted;
}

/** One call: dimensions, composite and ranks. */
export function scoreAreas(input) {
  const computed = computeDimensions(input);
  const rows = composite(computed, { weights: input.weights || MODES[input.mode || 'volume'].weights, minDims: input.minDims ?? 2 });
  const notes = [];
  if (computed.rows.length && computed.rows.every((r) => r.dims.values_evidence.score === null)) notes.push('values_evidence_unavailable');
  return { rows, computed, notes };
}

/**
 * How each area's rank moves when each active dimension's weight goes up or
 * down by `delta` (absolute, on the 0–1 slider scale; floored at 0).
 * @param {ReturnType<typeof computeDimensions>} computed
 * @param {{weights: Record<string, number>, minDims?: number, delta?: number}} o
 */
export function rankSensitivity(computed, { weights, minDims = 2, delta = 0.1 }) {
  const base = new Map(composite(computed, { weights, minDims }).map((r) => [r.id, r.rank]));
  /** @type {Map<string, {base: number|null, min: number|null, max: number|null, perturbations: {dim: string, sign: number, rank: number|null}[]}>} */
  const out = new Map([...base].map(([id, rank]) => [id, { base: rank, min: rank, max: rank, perturbations: [] }]));
  for (const d of computed.dims) {
    for (const sign of [-1, 1]) {
      const w = { ...weights, [d]: Math.max(0, (weights[d] || 0) + sign * delta) };
      if (w[d] === (weights[d] || 0)) continue;
      for (const r of composite(computed, { weights: w, minDims })) {
        const s = out.get(r.id);
        if (!s) continue;
        s.perturbations.push({ dim: d, sign, rank: r.rank });
        if (r.rank !== null) {
          s.min = s.min === null ? r.rank : Math.min(s.min, r.rank);
          s.max = s.max === null ? r.rank : Math.max(s.max, r.rank);
        }
      }
    }
  }
  return out;
}

/**
 * Plain-language reasons for a row's position.
 * @param {any} row from composite()
 * @param {(id: string) => string} label metric label
 * @param {number} n number of areas compared
 */
export function explainRow(row, label = (x) => x, n = 0) {
  const lines = [];
  if (row.status === 'insufficient_coverage') {
    lines.push(`Not ranked: only ${row.coverage.scored} of ${row.coverage.considered} weighted dimensions have data, below the minimum you set.`);
  } else if (row.status === 'no_weight') {
    lines.push('Not ranked: every dimension with data has zero weight.');
  }
  const order = Object.entries(row.contributions).sort((a, b) => b[1] - a[1]);
  for (const [d, c] of order) {
    const dim = row.dims[d];
    const comps = dim.components.filter((p) => p.norm !== null).map((p) => `${label(p.metric)} scores ${Math.round(p.norm)}`).join('; ');
    lines.push(`${DIMENSION_LABELS[d]} ${Math.round(dim.score)} × weight ${Math.round(row.weightsUsed[d] * 100)}% = ${c.toFixed(1)} points (${comps}).`);
  }
  for (const d of row.coverage.missing || []) {
    lines.push(`${DIMENSION_LABELS[d]}: no data for this area, so it is left out and the other weights are re-normalised (not counted as zero).`);
  }
  if (n) lines.push(`Scores are relative to the ${n} areas compared here, not absolute.`);
  return lines;
}
