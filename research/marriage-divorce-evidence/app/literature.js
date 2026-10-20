// Published-evidence adjustment: a LITERATURE-BASED layer on top of a data lens.
//
// A data lens (couple.js) gives a divorce curve for a couple from the variables its survey
// measured. Some well-studied risk factors are not in those surveys (destructive conflict,
// depression, alcohol problems, neuroticism, earlier cohabitations, parents' divorce,
// religiosity). This module shifts the lens's curve by hazard ratios published for those
// factors, under proportional hazards: S_adj(t) = S_base(t) ^ HR.
//
// It is deliberately lower-confidence than the lenses, and says so in its output:
//   * it applies only evidence records that were mechanically verified against the full
//     text of the primary source (verified && provenance === 'primary' && usable_in_app);
//   * it never adjusts a factor the lens already models (that would count it twice);
//   * every published HR is uncertain: log HR is drawn from a normal with the published CI
//     (or, when the paper printed no CI, the widest SE consistent with its significance
//     level), plus a between-population "transport" SD, by seeded Monte Carlo;
//   * when several adjustments stack, their log HRs are shrunk for overlap (see SHRINKAGE);
//   * Gottman's in-sample classification accuracies are never used: "Gottman-style"
//     conflict questions map to Birditt et al. (2010)'s prospective Cox HRs.
//
// Usage:
//   const evidence = await (await fetch('data/literature_evidence.json')).json();
//   const out = adjust({ base: { cumulative: [...] }, lens: 'nsfg2002_first_marriage',
//                        answers: { depression: 'yes', destructive_conflict_wife: 3 } }, evidence);
//   out.horizons[10].adjusted  -> { median, lo, hi }   (95% interval)
//   out.applied / out.refused  -> per-factor provenance and reasons

export const LABEL = 'Literature-based adjustment (published hazard ratios; lower confidence than the data lenses)';

// Transport SD added to every log HR: the studies' populations, eras and measures differ
// from the lens's and from each other. 0.10 on the log scale is about +/-20% at 95%.
export const TRANSPORT_SD = 0.10;

// Overlap shrinkage when k adjustments stack. Published HRs are each estimated without the
// other factors in the model, and these risks are correlated (depression, alcohol problems,
// neuroticism and hostile conflict travel together). For k predictors with equal marginal
// effects and equal pairwise correlation rho, the multivariable coefficient of each is
// marginal / (1 + (k - 1) rho), so each log HR is multiplied by c = 1 / (1 + (k - 1) rho),
// with rho drawn uniformly from RHO_RANGE in every Monte Carlo draw. c = 1 for a single
// adjustment; for rho = 0.3, c = 0.77 for two and 0.53 for four.
export const RHO_RANGE = [0.1, 0.5];

// Divorce prevalence assumed when converting a correlation with divorce (Roberts et al. 2007)
// into a per-SD log odds ratio: d = r / sqrt(p (1 - p) (1 - r^2)), log OR per SD ~= d under
// an equal-variance normal model. p is unknown for the pooled studies, so it is drawn
// uniformly from this range.
export const R_TO_LOGOR_PREVALENCE = [0.15, 0.5];

const Z = 1.959964;

// Factors this module can adjust for. `records` are evidence ids by answer; `exposure` turns
// an answer into the multiplier of the log HR (0 = no adjustment).
export const FACTORS = {
  destructive_conflict_wife: {
    label: 'Destructive conflict by the wife',
    question: 'In disagreements, how true is it that the wife yells or shouts, insults or calls names, brings up things from long ago, and has to have the last word? Average the four on 1 (not at all true) to 4 (very true).',
    kind: 'scale', range: [1, 4], record: 'Birditt2010_destructive_wife',
    note: 'Closest prospective measure to Gottman\'s criticism/contempt; Gottman\'s own accuracy figures are in-sample classifications, not hazard ratios, and are not used.',
  },
  destructive_conflict_husband: {
    label: 'Destructive conflict by the husband',
    question: 'Same four behaviours, for the husband (1-4).',
    kind: 'scale', range: [1, 4], record: 'Birditt2010_destructive_husband',
  },
  depression: {
    label: 'Major depression before the marriage (either partner)',
    question: 'Did either partner have major depression before marrying?', kind: 'yesno', record: 'Breslau2011_depression_M2',
  },
  alcohol_problem: {
    label: 'Alcohol abuse before the marriage (either partner)',
    question: 'Did either partner have alcohol abuse (with or without dependence) before marrying?', kind: 'yesno', record: 'Breslau2011_alcoholabuse_M2',
  },
  neuroticism_wife: {
    label: 'Wife\'s neuroticism', question: 'How far above (+) or below (-) average is the wife on neuroticism (emotional instability), in standard deviations? (-2 to 2)',
    kind: 'z', range: [-2, 2], record: 'Roberts2007_neuroticism',
  },
  neuroticism_husband: {
    label: 'Husband\'s neuroticism', question: 'Same, for the husband (-2 to 2 SD).', kind: 'z', range: [-2, 2], record: 'Roberts2007_neuroticism',
  },
  prior_cohabitations_other_partners: {
    label: 'Wife lived with other partners before marrying',
    question: 'Before this marriage, how many partners other than her husband did the wife live with? (0, 1, 2 or more)',
    kind: 'count', records: { 1: 'Rosenfeld2019_other_cohab1_M4', 2: 'Rosenfeld2019_other_cohab2plus_M4' },
    note: 'Estimated for women\'s first marriages only; there is no verified equivalent for husbands.',
  },
  parental_divorce_wife: {
    label: 'Wife did not grow up with both parents', question: 'Did the wife live with both biological or adoptive parents until 18?',
    kind: 'notintact', record: 'Manning2012_intactfamily_W',
  },
  parental_divorce_husband: {
    label: 'Husband did not grow up with both parents', question: 'Did the husband live with both biological or adoptive parents until 18?',
    kind: 'notintact', record: 'Manning2012_intactfamily_M',
  },
  nonreligious_spouse: {
    label: 'At least one spouse has no religion', question: 'Does at least one of you report no religion?', kind: 'yesno', record: 'Killewald2016_notreligious_post1975',
  },
  religiosity_match: {
    label: 'Religious mismatch between spouses', question: 'Do you differ in religion or in how often you attend services?', kind: 'refuse',
    reason: 'No verified primary hazard ratio: the retrieved evidence is an abstract giving direction only (Vaaler et al. 2009) and a secondhand transcription (Lehrer & Chiswick 1993). Not applied.',
  },
};

// What each lens already models (by the factor keys above). A factor listed here is refused.
export const LENS_MODELS = {
  nlsy79_couples: ['nonreligious_spouse', 'religiosity_match'],
  nlsy79_individuals: ['nonreligious_spouse', 'religiosity_match'],
  nsfg2002_first_marriage: ['parental_divorce_wife'],
  nsfg2002_family: ['parental_divorce_wife'],
  newlywed_la_couples: ['destructive_conflict_wife', 'destructive_conflict_husband', 'alcohol_problem', 'depression',
    'neuroticism_wife', 'neuroticism_husband', 'parental_divorce_wife', 'parental_divorce_husband'],
  sipp_prospective_couples: [],
  // HCMST models religion_pair and self-rated relationship_quality; quality absorbs much of
  // what destructive conflict predicts, so conflict is refused too (conservative).
  hcmst_couples: ['nonreligious_spouse', 'religiosity_match', 'destructive_conflict_wife', 'destructive_conflict_husband'],
  // Marriage happiness absorbs much of what conflict predicts (as relationship quality does).
  gss_panel_marriages: ['nonreligious_spouse', 'religiosity_match', 'parental_divorce_wife', 'parental_divorce_husband', 'destructive_conflict_wife', 'destructive_conflict_husband'],
  nlsy79_first_marriage: ['nonreligious_spouse', 'religiosity_match', 'parental_divorce_wife', 'parental_divorce_husband'],
  nlsy97_first_marriage: ['nonreligious_spouse', 'religiosity_match', 'parental_divorce_wife', 'parental_divorce_husband', 'prior_cohabitations_other_partners'],
  nsfg_pooled_first_marriage: ['nonreligious_spouse', 'religiosity_match', 'parental_divorce_wife'],
  nsfg_pooled_both_sexes: ['nonreligious_spouse', 'religiosity_match', 'parental_divorce_wife', 'parental_divorce_husband'],
  canada_gss_first_marriage: ['prior_cohabitations_other_partners', 'parental_divorce_wife', 'parental_divorce_husband'],
  // Each partner's religion raised and family of origin (both perspectives are scored).
  prewedding_harmonized: ['nonreligious_spouse', 'religiosity_match', 'parental_divorce_wife', 'parental_divorce_husband'],
};

// For a bundle not in LENS_MODELS: infer from its input column names (conservatively).
const COLUMN_RULES = [
  [/relig|attend|church/i, ['nonreligious_spouse', 'religiosity_match']],
  [/intact_family|parent_marriage|parents?_divorc|family_structure/i, ['parental_divorce_wife', 'parental_divorce_husband']],
  [/hostil|negativ|conflict|aggress|contempt/i, ['destructive_conflict_wife', 'destructive_conflict_husband']],
  [/substance|alcohol|drink/i, ['alcohol_problem']],
  [/depress|neg_affect|distress/i, ['depression', 'neuroticism_wife', 'neuroticism_husband']],
  [/neurotic/i, ['neuroticism_wife', 'neuroticism_husband']],
  [/other_cohab|nonmarital_cohab|prior_cohab/i, ['prior_cohabitations_other_partners']],
];

export function modeledFactors(lens) {
  if (typeof lens === 'string') {
    if (lens in LENS_MODELS) return { known: true, factors: new Set(LENS_MODELS[lens]) };
    return { known: false, factors: new Set() };
  }
  const id = lens && (lens.id || lens.lens);
  if (id && id in LENS_MODELS) return { known: true, factors: new Set(LENS_MODELS[id]) };
  const cols = (lens && lens.columns) || bundleColumns(lens);
  if (!cols.length) return { known: false, factors: new Set() };
  const out = new Set();
  for (const c of cols) for (const [re, fs] of COLUMN_RULES) if (re.test(c)) fs.forEach((f) => out.add(f));
  return { known: true, factors: out };
}

function bundleColumns(bundle) {
  const out = [];
  for (const m of (bundle && bundle.models) || []) {
    for (const k of ['numeric', 'categorical']) {
      const v = m[k];
      if (Array.isArray(v)) out.push(...v);
      else if (v && Array.isArray(v.columns)) out.push(...v.columns);
    }
  }
  return out;
}

// --- deterministic random numbers ---------------------------------------------------------
export function rng(seed) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let x = 0; let y = 0;
    while (x === 0) x = u();
    y = u();
    const r = Math.sqrt(-2 * Math.log(x));
    spare = r * Math.sin(2 * Math.PI * y);
    return r * Math.cos(2 * Math.PI * y);
  };
  return { uniform: u, normal };
}

// --- the evidence a factor rests on --------------------------------------------------------
function findRecord(evidence, id) {
  const recs = Array.isArray(evidence) ? evidence : (evidence && evidence.records) || [];
  return recs.find((r) => r.id === id) || null;
}

// Why a record cannot be used, or null if it can.
export function unusable(rec) {
  if (!rec) return 'evidence record not found';
  if (rec.verified !== true) return `record ${rec.id} is not verified (${rec.verification_reason || 'no reason recorded'})`;
  if (rec.provenance !== 'primary') return `record ${rec.id} was checked only against ${rec.provenance === 'abstract' ? 'an abstract' : 'a secondhand source'}, not the full primary text`;
  if (rec.usable_withheld) return rec.usable_withheld;
  if (rec.usable_in_app !== true) return `record ${rec.id} is not marked usable_in_app`;
  if (!(rec.estimate > 0) && rec.factor !== 'neuroticism') return `record ${rec.id} has no usable estimate`;
  return null;
}

// Log-HR sampler for a record: mean, SD and how the SD was obtained.
export function logHrPrior(rec) {
  if (rec.factor === 'neuroticism') {
    const sdR = (rec.ci_high - rec.ci_low) / (2 * Z);
    return {
      kind: 'r', r: rec.estimate, sdR,
      ciSource: `meta-analytic r = ${rec.estimate} (95% CI ${rec.ci_low} to ${rec.ci_high}) converted to log odds per SD with divorce prevalence drawn from ${R_TO_LOGOR_PREVALENCE[0]}-${R_TO_LOGOR_PREVALENCE[1]} (assumption)`,
    };
  }
  let mu = Math.log(rec.estimate);
  let sd; let ciSource;
  if (rec.ci_low > 0 && rec.ci_high > 0) {
    sd = (Math.log(rec.ci_high) - Math.log(rec.ci_low)) / (2 * Z);
    ciSource = rec.derivation ? `95% CI derived from the printed SE (${rec.derivation.method})` : '95% CI as printed';
  } else {
    // No CI printed: use the widest SE still consistent with significance at p < .05,
    // |ln HR| / 1.96 (even when the paper reports p < .01, which would allow a narrower SE).
    sd = Math.abs(mu) / Z;
    ciSource = 'no CI printed; SE set to |ln HR| / 1.96, the widest value consistent with p < .05: a conservatively wide prior';
  }
  if (rec.transform === 'reciprocal') mu = -mu; // HR for "not intact" = 1 / HR(intact)
  return { kind: 'logHR', mu, sd, ciSource };
}

function drawLogHr(prior, R) {
  if (prior.kind === 'r') {
    const r = Math.max(-0.95, Math.min(0.95, prior.r + prior.sdR * R.normal()));
    const [a, b] = R_TO_LOGOR_PREVALENCE;
    const p = a + (b - a) * R.uniform();
    return r / Math.sqrt(p * (1 - p) * (1 - r * r));
  }
  return prior.mu + prior.sd * R.normal();
}

function exposureFor(spec, value, rec) {
  if (value === undefined || value === null || value === '' || value === 'unknown') return { x: 0, skip: 'not answered' };
  if (spec.kind === 'scale') {
    const v = Number(value);
    if (!Number.isFinite(v) || v < spec.range[0] || v > spec.range[1]) return { x: 0, skip: `answer must be between ${spec.range[0]} and ${spec.range[1]}` };
    const c = rec && rec.center ? rec.center.value : (spec.range[0] + spec.range[1]) / 2;
    return { x: v - c, desc: `${v} on the 1-4 scale vs the study's average ${c}` };
  }
  if (spec.kind === 'z') {
    const v = Number(value);
    if (!Number.isFinite(v) || v < spec.range[0] || v > spec.range[1]) return { x: 0, skip: `answer must be between ${spec.range[0]} and ${spec.range[1]} SD` };
    return { x: v, desc: `${v > 0 ? '+' : ''}${v} SD from average` };
  }
  if (spec.kind === 'yesno') {
    const yes = value === true || value === 'yes' || value === 'Yes';
    return yes ? { x: 1, desc: 'yes (reference: no)' } : { x: 0, skip: 'answered no: the lens average is treated as the unexposed reference, so no reduction is claimed' };
  }
  if (spec.kind === 'notintact') {
    const intact = value === true || value === 'yes' || value === 'Yes' || value === 'intact';
    return intact ? { x: 0, skip: 'grew up with both parents: treated as the reference, no adjustment' } : { x: 1, desc: 'did not live with both parents until 18 (HR = 1 / HR for intact)' };
  }
  return { x: 0, skip: 'unsupported answer' };
}

// --- base curve ------------------------------------------------------------------------------
function baseCumulative(base) {
  let cum;
  if (Array.isArray(base)) cum = base;
  else if (base && Array.isArray(base.cumulative)) cum = base.cumulative;
  else if (base && Array.isArray(base.survival)) cum = base.survival.map((s) => 1 - s);
  else if (base && Array.isArray(base.hazards)) {
    let s = 1;
    cum = base.hazards.map((q) => { s *= 1 - q; return 1 - s; });
  } else throw new Error('base must give cumulative, survival or hazards by year');
  cum.forEach((p, i) => {
    if (!(p >= 0 && p < 1)) throw new Error(`base cumulative probability at year ${i + 1} must be in [0, 1)`);
    if (i && p + 1e-12 < cum[i - 1]) throw new Error('base cumulative probabilities must not decrease');
  });
  return cum;
}

const quantile = (sorted, q) => {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i); const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

// --- main entry ------------------------------------------------------------------------------
// opts: { base, lens, answers, horizons = [5, 10, 20], draws = 4000, seed = 1,
//         transportSd = TRANSPORT_SD, rhoRange = RHO_RANGE }
export function adjust(opts, evidence) {
  const { base, lens, answers = {}, horizons = [5, 10, 20], draws = 4000, seed = 1 } = opts;
  const transportSd = opts.transportSd ?? TRANSPORT_SD;
  const rhoRange = opts.rhoRange ?? RHO_RANGE;
  const cum = baseCumulative(base);
  const modeled = modeledFactors(lens);
  const applied = []; const refused = []; const skipped = [];

  for (const [key, value] of Object.entries(answers)) {
    const spec = FACTORS[key];
    if (!spec) { refused.push({ factor: key, reason: 'unknown factor' }); continue; }
    if (!modeled.known) { refused.push({ factor: key, label: spec.label, reason: 'Unknown lens: cannot tell which factors it already models, so no literature adjustment is applied.' }); continue; }
    if (modeled.factors.has(key)) { refused.push({ factor: key, label: spec.label, reason: 'This lens already models this factor; adjusting again would count it twice.' }); continue; }
    if (spec.kind === 'refuse') { refused.push({ factor: key, label: spec.label, reason: spec.reason }); continue; }
    let recId = spec.record;
    if (spec.kind === 'count') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) { skipped.push({ factor: key, reason: 'not answered' }); continue; }
      if (n === 0) { skipped.push({ factor: key, reason: 'none: reference category, no adjustment' }); continue; }
      recId = spec.records[n >= 2 ? 2 : 1];
    }
    const rec = findRecord(evidence, recId);
    const why = unusable(rec);
    if (why) { refused.push({ factor: key, label: spec.label, record: recId, reason: why }); continue; }
    const ex = spec.kind === 'count' ? { x: 1, desc: `${Number(value) >= 2 ? '2 or more' : '1'} (reference: none)` } : exposureFor(spec, value, rec);
    if (ex.skip) { skipped.push({ factor: key, label: spec.label, reason: ex.skip }); continue; }
    if (ex.x === 0) { skipped.push({ factor: key, label: spec.label, reason: 'at the reference level: no adjustment' }); continue; }
    applied.push({ key, spec, rec, x: ex.x, desc: ex.desc, prior: logHrPrior(rec) });
  }

  const k = applied.length;
  const R = rng(seed);
  const hz = horizons.map((h) => (h <= cum.length ? h : null));
  const samples = hz.map(() => new Float64Array(draws));
  const effLog = applied.map(() => new Float64Array(draws));
  const shrinks = new Float64Array(draws);
  for (let d = 0; d < draws; d++) {
    const rho = rhoRange[0] + (rhoRange[1] - rhoRange[0]) * R.uniform();
    const c = k > 1 ? 1 / (1 + (k - 1) * rho) : 1;
    shrinks[d] = c;
    let lp = 0;
    applied.forEach((a, i) => {
      const b = drawLogHr(a.prior, R) + transportSd * R.normal();
      const e = c * b * a.x;
      effLog[i][d] = e;
      lp += e;
    });
    const hr = Math.exp(lp);
    hz.forEach((h, j) => { if (h) samples[j][d] = 1 - Math.pow(1 - cum[h - 1], hr); });
  }

  const out = {
    label: LABEL,
    confidence: 'lower than the data lenses: hazard ratios come from other populations and studies, are applied as if proportional over the whole marriage, and overlap with each other',
    lens: typeof lens === 'string' ? lens : (lens && lens.id) || null,
    draws, seed, horizons: {},
    applied: applied.map((a, i) => {
      const s = Array.from(effLog[i]).sort((p, q) => p - q);
      return {
        factor: a.key, label: a.spec.label, answer: a.desc,
        record: a.rec.id, citation: a.rec.citation, doi: a.rec.doi || null, url: a.rec.url,
        locator: a.rec.locator || null, quote: a.rec.quote, provenance: a.rec.provenance,
        published: { estimate: a.rec.estimate, ci_low: a.rec.ci_low ?? null, ci_high: a.rec.ci_high ?? null, measure: a.rec.measure, unit: a.rec.unit || null },
        uncertainty: a.prior.ciSource,
        applied_hr: { median: Math.exp(quantile(s, 0.5)), lo: Math.exp(quantile(s, 0.025)), hi: Math.exp(quantile(s, 0.975)) },
        caveats: a.rec.caveats || null, note: a.spec.note || null,
      };
    }),
    refused, skipped,
    shrinkage: {
      adjustments: k,
      method: 'each log HR multiplied by 1 / (1 + (k - 1) rho), rho ~ Uniform(' + rhoRange.join(', ') + ') per draw (equicorrelated-predictor overlap)',
      factor_median: quantile(Array.from(shrinks).sort((p, q) => p - q), 0.5),
    },
    notes: [
      'Base curve is treated as fixed; intervals show uncertainty in the published effects only.',
      `Each log HR also carries a transport SD of ${transportSd} for differences between the studies' populations and yours.`,
      'Odds ratios from discrete-time models are used as hazard ratios (annual divorce risk is small).',
      'Yes/no factors: the lens average is treated as the unexposed reference, so "no" claims no reduction.',
    ],
  };
  hz.forEach((h, j) => {
    const H = horizons[j];
    if (!h) { out.horizons[H] = { base: null, adjusted: null, note: `base curve has only ${cum.length} years` }; return; }
    const s = Array.from(samples[j]).sort((p, q) => p - q);
    out.horizons[H] = {
      base: cum[h - 1],
      adjusted: k ? { median: quantile(s, 0.5), lo: quantile(s, 0.025), hi: quantile(s, 0.975) } : { median: cum[h - 1], lo: cum[h - 1], hi: cum[h - 1] },
    };
  });
  return out;
}

// Questions to show, minus those the lens already models (for the UI).
export function questionsFor(lens) {
  const m = modeledFactors(lens);
  return Object.entries(FACTORS).map(([key, f]) => ({
    key, label: f.label, question: f.question, kind: f.kind,
    available: m.known && !m.factors.has(key) && f.kind !== 'refuse',
    reason: !m.known ? 'unknown lens' : m.factors.has(key) ? 'already modelled by this lens' : f.kind === 'refuse' ? f.reason : null,
  }));
}
